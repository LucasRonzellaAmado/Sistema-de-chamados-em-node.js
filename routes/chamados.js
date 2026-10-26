const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db/database');
const {
  ehEquipe,
  exigirLogin,
  exigirTI,
  podeAcessarChamado,
  carregarChamadoAutorizado
} = require('../middlewares/auth');
const { logger } = require('../middlewares/logger');
const { csrfProtection } = require('../middlewares/csrf');
const { STATUS_VALIDOS, PRIORIDADES_VALIDAS, LIMITES, interpretarComando } = require('../utils/validacao');

// Extensoes aceitas nos anexos. Qualquer outra e ignorada (ex.: .html, .js, .exe).
const EXTENSOES_PERMITIDAS = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.docx', '.xlsx'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.uploadsDir),
    filename: (req, file, cb) => {
      // Nome aleatorio no disco: o nome original nunca e usado como caminho
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase());
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 5, fields: 20 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, EXTENSOES_PERMITIDAS.includes(ext));
  }
});

// Remove do disco arquivos enviados que nao chegaram a ser registrados
function removerArquivos(files = []) {
  files.forEach(f => fs.unlink(f.path, () => {}));
}

function gerarProtocolo() {
  const ultimo = db.prepare('SELECT id FROM chamados ORDER BY id DESC LIMIT 1').get();
  const proximoId = ultimo ? ultimo.id + 1 : 1;
  return 'CH-' + String(proximoId).padStart(6, '0');
}

const STATUS_LABEL = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  aguardando_cliente: 'Aguardando cliente',
  resolvido: 'Resolvido',
  fechado: 'Fechado'
};

const PRIORIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };

// Visoes da lista para a equipe (como as "visoes" de chamados do GLPI)
const VISOES = {
  todos: 'Todos',
  meus: 'Atribuídos a mim',
  setor: 'Do meu setor',
  sem_responsavel: 'Sem responsável',
  observando: 'Que observo'
};

function paraData(textoSqlite) {
  return new Date(textoSqlite.replace(' ', 'T') + 'Z');
}

function formatarDuracao(ms) {
  if (ms == null) return null;
  if (ms < 0) ms = 0;
  const minutos = Math.floor(ms / 60000);
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const mins = minutos % 60;
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${mins}min`;
  return `${mins}min`;
}

function calcularTemposChamado(chamado) {
  const criadoEm = paraData(chamado.criado_em);
  const agora = new Date();

  const tempoParaAssumir = chamado.assumido_em
    ? formatarDuracao(paraData(chamado.assumido_em) - criadoEm)
    : null;

  const fim = chamado.fechado_em ? paraData(chamado.fechado_em) : agora;
  const tempoTotal = formatarDuracao(fim - criadoEm);

  return { tempoParaAssumir, tempoTotal };
}

function registrarHistorico(chamadoId, usuarioId, tipo, descricao) {
  db.prepare('INSERT INTO historico (chamado_id, usuario_id, tipo, descricao) VALUES (?, ?, ?, ?)')
    .run(chamadoId, usuarioId, tipo, descricao);
}

function salvarAnexos(files, chamadoId, usuarioId, mensagemId = null) {
  if (!files || files.length === 0) return;
  const inserirAnexo = db.prepare(`
    INSERT INTO anexos (chamado_id, usuario_id, nome_original, caminho_arquivo, mensagem_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  files.forEach(f => inserirAnexo.run(chamadoId, usuarioId, f.originalname.slice(0, 255), f.filename, mensagemId));
}

function telaNovoChamado(res, erro, status = 200) {
  const setores = db.prepare('SELECT * FROM setores ORDER BY nome').all();
  const assuntos = db.prepare('SELECT * FROM assuntos_predefinidos ORDER BY setor_id').all();
  res.status(status).render('chamados/novo', { setores, assuntos, erro });
}

function erroDados(res, mensagem) {
  return res.status(400).render('erro', { titulo: 'Dados inválidos', mensagem });
}

router.get('/chamados', exigirLogin, (req, res) => {
  const usuario = req.session.usuario;
  const equipe = ehEquipe(usuario);
  const filtroStatus = STATUS_VALIDOS.includes(req.query.status) ? req.query.status : null;
  const visao = equipe && VISOES[req.query.visao] ? req.query.visao : 'todos';
  const busca = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';

  // Escopo: o que o usuario pode ver nesta visao (sem o filtro de status)
  const escopo = [];
  const paramsEscopo = [];

  if (!equipe) {
    escopo.push('c.cliente_id = ?');
    paramsEscopo.push(usuario.id);
  } else if (visao === 'meus') {
    escopo.push('c.responsavel_id = ?');
    paramsEscopo.push(usuario.id);
  } else if (visao === 'setor') {
    escopo.push('c.setor_id = ?');
    paramsEscopo.push(usuario.setor_id);
  } else if (visao === 'sem_responsavel') {
    escopo.push("c.responsavel_id IS NULL AND c.status NOT IN ('resolvido', 'fechado')");
  } else if (visao === 'observando') {
    escopo.push('EXISTS (SELECT 1 FROM chamado_observadores o WHERE o.chamado_id = c.id AND o.usuario_id = ?)');
    paramsEscopo.push(usuario.id);
  }

  if (busca) {
    escopo.push("(c.protocolo LIKE ? ESCAPE '\\' OR c.titulo LIKE ? ESCAPE '\\')");
    const termo = '%' + busca.replace(/[\\%_]/g, '\\$&') + '%';
    paramsEscopo.push(termo, termo);
  }

  const whereEscopo = escopo.length ? 'WHERE ' + escopo.join(' AND ') : '';

  const contagem = Object.fromEntries(STATUS_VALIDOS.map(s => [s, 0]));
  db.prepare(`SELECT c.status, COUNT(*) as total FROM chamados c ${whereEscopo} GROUP BY c.status`)
    .all(...paramsEscopo)
    .forEach(l => { contagem[l.status] = l.total; });

  const condicoes = [...escopo];
  const params = [...paramsEscopo];
  if (filtroStatus) {
    condicoes.push('c.status = ?');
    params.push(filtroStatus);
  }

  const chamados = db.prepare(`
    SELECT c.*, s.nome as setor_nome, cl.nome as cliente_nome, r.nome as responsavel_nome,
      (SELECT MIN(h.criado_em) FROM historico h WHERE h.chamado_id = c.id AND h.tipo = 'atribuicao') as assumido_em
    FROM chamados c
    JOIN setores s ON s.id = c.setor_id
    JOIN usuarios cl ON cl.id = c.cliente_id
    LEFT JOIN usuarios r ON r.id = c.responsavel_id
    ${condicoes.length ? 'WHERE ' + condicoes.join(' AND ') : ''}
    ORDER BY c.atualizado_em DESC
  `).all(...params).map(c => ({ ...c, ...calcularTemposChamado(c) }));

  logger.info('CHAMADOS', `Listagem consultada por ${usuario.email} (${chamados.length} resultado(s))`);
  res.render('chamados/lista', {
    chamados, STATUS_LABEL, PRIORIDADE_LABEL, VISOES, filtroStatus, visao, busca, contagem
  });
});

router.get('/chamados/novo', exigirLogin, (req, res) => telaNovoChamado(res, null));

router.post('/chamados/novo', exigirLogin, upload.array('anexos', 5), csrfProtection, (req, res) => {
  const usuario = req.session.usuario;
  const { setor_id, assunto_predefinido, titulo_customizado, prioridade } = req.body;
  const descricao = typeof req.body.descricao === 'string' ? req.body.descricao.trim() : '';

  const tituloBruto = (assunto_predefinido && assunto_predefinido !== 'outro')
    ? assunto_predefinido
    : titulo_customizado;
  const titulo = typeof tituloBruto === 'string' ? tituloBruto.trim() : '';

  const setorExiste = setor_id && db.prepare('SELECT id FROM setores WHERE id = ?').get(setor_id);

  if (!titulo || !descricao || !setorExiste) {
    removerArquivos(req.files);
    logger.aviso('CHAMADOS', `Falha ao abrir chamado (dados incompletos) usuario=${usuario.email}`);
    return telaNovoChamado(res, 'Preencha o setor, assunto e a descricao do problema.');
  }

  if (titulo.length > LIMITES.titulo || descricao.length > LIMITES.descricao) {
    removerArquivos(req.files);
    return telaNovoChamado(res, `O assunto aceita ate ${LIMITES.titulo} caracteres e a descricao ate ${LIMITES.descricao}.`);
  }

  const protocolo = gerarProtocolo();

  const resultado = db.prepare(`
    INSERT INTO chamados (protocolo, titulo, descricao, setor_id, cliente_id, prioridade)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(protocolo, titulo, descricao, setor_id, usuario.id, PRIORIDADES_VALIDAS.includes(prioridade) ? prioridade : 'media');

  const chamadoId = Number(resultado.lastInsertRowid);

  salvarAnexos(req.files, chamadoId, usuario.id);
  if (req.files && req.files.length > 0) {
    logger.info('ANEXOS', `${req.files.length} arquivo(s) anexado(s) ao chamado ${protocolo}`);
  }

  registrarHistorico(chamadoId, usuario.id, 'criacao', `Chamado aberto por ${usuario.nome}.`);

  logger.sucesso('CHAMADOS', `Chamado ${protocolo} aberto por ${usuario.email} (prioridade=${prioridade || 'media'})`);
  res.redirect('/chamados/' + chamadoId);
});

router.get('/chamados/:id', exigirLogin, (req, res) => {
  const usuario = req.session.usuario;
  const equipe = ehEquipe(usuario);
  const chamado = db.prepare(`
    SELECT c.*, s.nome as setor_nome, cl.nome as cliente_nome, cl.email as cliente_email, r.nome as responsavel_nome
    FROM chamados c
    JOIN setores s ON s.id = c.setor_id
    JOIN usuarios cl ON cl.id = c.cliente_id
    LEFT JOIN usuarios r ON r.id = c.responsavel_id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!chamado) {
    logger.aviso('CHAMADOS', `Chamado inexistente id=${req.params.id} solicitado por ${usuario.email}`);
    return res.status(404).render('erro', { titulo: 'Nao encontrado', mensagem: 'Chamado nao existe.' });
  }

  if (!podeAcessarChamado(usuario, chamado)) {
    logger.aviso('CHAMADOS', `Acesso negado ao chamado ${chamado.protocolo} para ${usuario.email}`);
    return res.status(403).render('erro', { titulo: 'Acesso negado', mensagem: 'Voce nao tem acesso a este chamado.' });
  }

  const infoAtribuicao = db.prepare(`
    SELECT MIN(criado_em) as assumido_em FROM historico WHERE chamado_id = ? AND tipo = 'atribuicao'
  `).get(chamado.id);
  const tempos = calcularTemposChamado({ ...chamado, assumido_em: infoAtribuicao.assumido_em });

  // O cliente nunca recebe notas privadas, nem os anexos enviados junto delas
  const mensagens = db.prepare(`
    SELECT m.*, u.nome as usuario_nome, u.tipo as usuario_tipo
    FROM mensagens m
    JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.chamado_id = ? ${equipe ? '' : "AND m.tipo != 'nota'"}
    ORDER BY m.criado_em ASC, m.id ASC
  `).all(chamado.id);

  const anexos = db.prepare(`
    SELECT a.*, u.nome as usuario_nome
    FROM anexos a
    JOIN usuarios u ON u.id = a.usuario_id
    LEFT JOIN mensagens m ON m.id = a.mensagem_id
    WHERE a.chamado_id = ? ${equipe ? '' : "AND (m.tipo IS NULL OR m.tipo != 'nota')"}
    ORDER BY a.criado_em ASC
  `).all(chamado.id);

  const anexosPorMensagem = {};
  anexos.forEach(a => {
    const chave = a.mensagem_id || 'chamado';
    (anexosPorMensagem[chave] = anexosPorMensagem[chave] || []).push(a);
  });

  const historico = db.prepare('SELECT h.*, u.nome as usuario_nome FROM historico h LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE chamado_id = ? ORDER BY h.criado_em ASC, h.id ASC').all(chamado.id);
  const setores = db.prepare('SELECT * FROM setores ORDER BY nome').all();

  // Toda a equipe pode receber o chamado; os do setor do chamado aparecem primeiro
  const equipeDisponivel = equipe
    ? db.prepare(`
        SELECT u.id, u.nome, s.nome as setor_nome
        FROM usuarios u LEFT JOIN setores s ON s.id = u.setor_id
        WHERE u.tipo IN ('agente', 'admin') AND u.ativo = 1
        ORDER BY (u.setor_id = ?) DESC, u.nome
      `).all(chamado.setor_id)
    : [];

  const observadores = db.prepare(`
    SELECT u.id, u.nome FROM chamado_observadores o JOIN usuarios u ON u.id = o.usuario_id
    WHERE o.chamado_id = ? ORDER BY u.nome
  `).all(chamado.id);

  res.render('chamados/detalhe', {
    chamado, mensagens, anexosPorMensagem, historico, setores, equipeDisponivel, observadores,
    ehObservador: observadores.some(o => o.id === usuario.id),
    STATUS_LABEL, PRIORIDADE_LABEL, tempos
  });
});

router.post('/chamados/:id/mensagem', exigirLogin, carregarChamadoAutorizado, upload.array('anexos', 5), csrfProtection, (req, res) => {
  const usuario = req.session.usuario;
  const chamado = res.locals.chamado;
  const equipe = ehEquipe(usuario);

  if (chamado.status === 'fechado') {
    removerArquivos(req.files);
    return erroDados(res, 'Este chamado está fechado e não aceita novas respostas.');
  }

  // Comandos (/nota, /solucao...) so valem para a equipe. Para o cliente o texto e publicado como esta.
  let { tipo, texto } = equipe
    ? interpretarComando(req.body.mensagem)
    : { tipo: 'acompanhamento', texto: String(req.body.mensagem || '').trim() };

  if (equipe && tipo === 'acompanhamento') {
    if (req.body.interna === 'on' || req.body.tipo === 'nota') tipo = 'nota';
    else if (req.body.tipo === 'solucao') tipo = 'solucao';
  }

  if (!texto) {
    removerArquivos(req.files);
    return res.redirect('/chamados/' + chamado.id);
  }

  if (texto.length > LIMITES.mensagem) {
    removerArquivos(req.files);
    return erroDados(res, `A mensagem deve ter no máximo ${LIMITES.mensagem} caracteres.`);
  }

  const resultado = db.prepare(`
    INSERT INTO mensagens (chamado_id, usuario_id, mensagem, interna, tipo)
    VALUES (?, ?, ?, ?, ?)
  `).run(chamado.id, usuario.id, texto, tipo === 'nota' ? 1 : 0, tipo);

  salvarAnexos(req.files, chamado.id, usuario.id, Number(resultado.lastInsertRowid));

  if (tipo === 'solucao') {
    db.prepare("UPDATE chamados SET status = 'resolvido', fechado_em = datetime('now'), atualizado_em = datetime('now') WHERE id = ?").run(chamado.id);
    registrarHistorico(chamado.id, usuario.id, 'solucao', `${usuario.nome} registrou uma solução. Aguardando aprovação do cliente.`);
  } else if (!equipe && chamado.status === 'aguardando_cliente') {
    db.prepare("UPDATE chamados SET status = 'em_andamento', atualizado_em = datetime('now') WHERE id = ?").run(chamado.id);
  } else {
    db.prepare("UPDATE chamados SET atualizado_em = datetime('now') WHERE id = ?").run(chamado.id);
  }

  logger.info('MENSAGEM', `${usuario.email} respondeu o chamado ${chamado.protocolo} (tipo=${tipo})`);
  res.redirect('/chamados/' + chamado.id + '#conversa');
});

// Aprovacao da solucao pelo cliente (fluxo do GLPI): aprovar fecha, recusar reabre
router.post('/chamados/:id/solucao/:decisao', exigirLogin, carregarChamadoAutorizado, csrfProtection, (req, res) => {
  const usuario = req.session.usuario;
  const chamado = res.locals.chamado;
  const { decisao } = req.params;

  if (chamado.cliente_id !== usuario.id) {
    return res.status(403).render('erro', { titulo: 'Acesso negado', mensagem: 'Somente quem abriu o chamado pode avaliar a solução.' });
  }
  if (chamado.status !== 'resolvido' || !['aprovar', 'recusar'].includes(decisao)) {
    return erroDados(res, 'Não há solução pendente de avaliação neste chamado.');
  }

  if (decisao === 'aprovar') {
    db.prepare("UPDATE chamados SET status = 'fechado', atualizado_em = datetime('now') WHERE id = ?").run(chamado.id);
    registrarHistorico(chamado.id, usuario.id, 'status', 'Solução aprovada pelo cliente. Chamado fechado.');
  } else {
    const motivo = String(req.body.motivo || '').trim().slice(0, LIMITES.mensagem);
    db.prepare("UPDATE chamados SET status = 'em_andamento', fechado_em = NULL, atualizado_em = datetime('now') WHERE id = ?").run(chamado.id);
    if (motivo) {
      db.prepare("INSERT INTO mensagens (chamado_id, usuario_id, mensagem, tipo) VALUES (?, ?, ?, 'acompanhamento')")
        .run(chamado.id, usuario.id, motivo);
    }
    registrarHistorico(chamado.id, usuario.id, 'status', 'Solução recusada pelo cliente. Chamado reaberto.');
  }

  logger.info('SOLUCAO', `${usuario.email} ${decisao === 'aprovar' ? 'aprovou' : 'recusou'} a solucao de ${chamado.protocolo}`);
  res.redirect('/chamados/' + chamado.id);
});

router.post('/chamados/:id/transferir', exigirLogin, exigirTI, carregarChamadoAutorizado, csrfProtection, (req, res) => {
  const chamado = res.locals.chamado;
  const { novo_setor_id } = req.body;
  const motivo = String(req.body.motivo || '').trim().slice(0, LIMITES.motivo);

  const setorAtual = db.prepare('SELECT nome FROM setores WHERE id = ?').get(chamado.setor_id);
  const setorNovo = db.prepare('SELECT id, nome FROM setores WHERE id = ?').get(novo_setor_id);

  if (!setorNovo) return erroDados(res, 'Setor de destino inválido.');

  db.prepare("UPDATE chamados SET setor_id = ?, responsavel_id = NULL, status = 'aberto', fechado_em = NULL, atualizado_em = datetime('now') WHERE id = ?")
    .run(setorNovo.id, chamado.id);

  registrarHistorico(chamado.id, req.session.usuario.id, 'transferencia',
    `Transferido de "${setorAtual.nome}" para "${setorNovo.nome}". Motivo: ${motivo || 'nao informado'}`);

  logger.sucesso('TRANSFERENCIA', `${chamado.protocolo} movido de "${setorAtual.nome}" para "${setorNovo.nome}" por ${req.session.usuario.email}`);
  res.redirect('/chamados/' + chamado.id);
});

router.post('/chamados/:id/assumir', exigirLogin, exigirTI, carregarChamadoAutorizado, csrfProtection, (req, res) => {
  const chamado = res.locals.chamado;
  const usuario = req.session.usuario;

  db.prepare("UPDATE chamados SET responsavel_id = ?, status = 'em_andamento', fechado_em = NULL, atualizado_em = datetime('now') WHERE id = ?")
    .run(usuario.id, chamado.id);
  registrarHistorico(chamado.id, usuario.id, 'atribuicao', `${usuario.nome} assumiu o chamado.`);

  logger.sucesso('ATRIBUICAO', `${usuario.email} assumiu o chamado ${chamado.protocolo}`);
  res.redirect('/chamados/' + chamado.id);
});

// Atribui o chamado a qualquer membro da equipe (ou remove o responsavel)
router.post('/chamados/:id/atribuir', exigirLogin, exigirTI, carregarChamadoAutorizado, csrfProtection, (req, res) => {
  const chamado = res.locals.chamado;
  const usuario = req.session.usuario;
  const responsavelId = req.body.responsavel_id;

  if (!responsavelId) {
    db.prepare("UPDATE chamados SET responsavel_id = NULL, atualizado_em = datetime('now') WHERE id = ?").run(chamado.id);
    registrarHistorico(chamado.id, usuario.id, 'atribuicao_removida', `${usuario.nome} removeu o responsável.`);
    return res.redirect('/chamados/' + chamado.id);
  }

  const tecnico = db.prepare("SELECT id, nome FROM usuarios WHERE id = ? AND tipo IN ('agente', 'admin') AND ativo = 1").get(responsavelId);
  if (!tecnico) return erroDados(res, 'Responsável inválido.');

  const novoStatus = chamado.status === 'aberto' ? 'em_andamento' : chamado.status;
  db.prepare("UPDATE chamados SET responsavel_id = ?, status = ?, atualizado_em = datetime('now') WHERE id = ?")
    .run(tecnico.id, novoStatus, chamado.id);
  registrarHistorico(chamado.id, usuario.id, 'atribuicao', `${usuario.nome} atribuiu o chamado a ${tecnico.nome}.`);

  logger.sucesso('ATRIBUICAO', `${chamado.protocolo} atribuido a ${tecnico.nome} por ${usuario.email}`);
  res.redirect('/chamados/' + chamado.id);
});

// Entrar/sair como observador do chamado
router.post('/chamados/:id/observar', exigirLogin, exigirTI, carregarChamadoAutorizado, csrfProtection, (req, res) => {
  const chamado = res.locals.chamado;
  const usuario = req.session.usuario;
  const jaObserva = db.prepare('SELECT 1 FROM chamado_observadores WHERE chamado_id = ? AND usuario_id = ?').get(chamado.id, usuario.id);

  if (jaObserva) {
    db.prepare('DELETE FROM chamado_observadores WHERE chamado_id = ? AND usuario_id = ?').run(chamado.id, usuario.id);
    registrarHistorico(chamado.id, usuario.id, 'observador', `${usuario.nome} deixou de observar o chamado.`);
  } else {
    db.prepare('INSERT INTO chamado_observadores (chamado_id, usuario_id) VALUES (?, ?)').run(chamado.id, usuario.id);
    registrarHistorico(chamado.id, usuario.id, 'observador', `${usuario.nome} passou a observar o chamado.`);
  }
  res.redirect('/chamados/' + chamado.id);
});

router.post('/chamados/:id/status', exigirLogin, exigirTI, carregarChamadoAutorizado, csrfProtection, (req, res) => {
  const { status } = req.body;
  const chamado = res.locals.chamado;

  if (!STATUS_VALIDOS.includes(status)) return erroDados(res, 'Status inválido.');

  // fechado_em so tem valor enquanto o chamado estiver resolvido ou fechado
  db.prepare(`
    UPDATE chamados
    SET status = ?,
        atualizado_em = datetime('now'),
        fechado_em = CASE WHEN ? IN ('resolvido', 'fechado') THEN COALESCE(fechado_em, datetime('now')) ELSE NULL END
    WHERE id = ?
  `).run(status, status, chamado.id);

  registrarHistorico(chamado.id, req.session.usuario.id, 'status', `Status alterado para "${STATUS_LABEL[status]}".`);

  logger.info('STATUS', `Chamado ${chamado.protocolo} alterado para "${STATUS_LABEL[status]}" por ${req.session.usuario.email}`);
  res.redirect('/chamados/' + chamado.id);
});

router.post('/chamados/:id/prioridade', exigirLogin, exigirTI, carregarChamadoAutorizado, csrfProtection, (req, res) => {
  const { prioridade } = req.body;
  const chamado = res.locals.chamado;

  if (!PRIORIDADES_VALIDAS.includes(prioridade)) return erroDados(res, 'Prioridade inválida.');

  db.prepare("UPDATE chamados SET prioridade = ?, atualizado_em = datetime('now') WHERE id = ?").run(prioridade, chamado.id);
  registrarHistorico(chamado.id, req.session.usuario.id, 'prioridade', `Prioridade alterada para "${PRIORIDADE_LABEL[prioridade]}".`);

  logger.info('PRIORIDADE', `Chamado ${chamado.protocolo} alterado para prioridade "${prioridade}" por ${req.session.usuario.email}`);
  res.redirect('/chamados/' + chamado.id);
});

// Download de anexo: so quem tem acesso ao chamado; anexos de notas privadas so para a equipe
router.get('/anexos/:id', exigirLogin, (req, res) => {
  const usuario = req.session.usuario;
  const anexo = db.prepare(`
    SELECT a.*, c.cliente_id, c.setor_id, m.tipo as mensagem_tipo
    FROM anexos a
    JOIN chamados c ON c.id = a.chamado_id
    LEFT JOIN mensagens m ON m.id = a.mensagem_id
    WHERE a.id = ?
  `).get(req.params.id);

  const bloqueado = !anexo
    || !podeAcessarChamado(usuario, anexo)
    || (anexo.mensagem_tipo === 'nota' && !ehEquipe(usuario));

  if (bloqueado) {
    return res.status(404).render('erro', { titulo: 'Nao encontrado', mensagem: 'Anexo nao encontrado.' });
  }

  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.download(path.join(config.uploadsDir, path.basename(anexo.caminho_arquivo)), anexo.nome_original);
});

router.get('/api/assuntos/:setorId', exigirLogin, (req, res) => {
  const assuntos = db.prepare('SELECT titulo FROM assuntos_predefinidos WHERE setor_id = ?').all(req.params.setorId);
  res.json(assuntos);
});

module.exports = router;
