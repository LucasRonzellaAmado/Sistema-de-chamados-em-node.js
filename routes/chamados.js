const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db/database');
const { exigirLogin, exigirTI } = require('../middlewares/auth');
const { logger } = require('../middlewares/logger');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

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

router.get('/chamados', exigirLogin, (req, res) => {
  const usuario = req.session.usuario;
  const filtroStatus = req.query.status || null;

  let chamados;

  if (usuario.tipo === 'cliente') {
    chamados = db.prepare(`
      SELECT c.*, s.nome as setor_nome, r.nome as responsavel_nome
      FROM chamados c
      JOIN setores s ON s.id = c.setor_id
      LEFT JOIN usuarios r ON r.id = c.responsavel_id
      WHERE c.cliente_id = ?
      ${filtroStatus ? 'AND c.status = ?' : ''}
      ORDER BY c.criado_em DESC
    `).all(...(filtroStatus ? [usuario.id, filtroStatus] : [usuario.id]));
  } else if (usuario.tipo === 'admin') {
    chamados = db.prepare(`
      SELECT c.*, s.nome as setor_nome, cl.nome as cliente_nome, r.nome as responsavel_nome,
        (SELECT MIN(h.criado_em) FROM historico h WHERE h.chamado_id = c.id AND h.tipo = 'atribuicao') as assumido_em
      FROM chamados c
      JOIN setores s ON s.id = c.setor_id
      JOIN usuarios cl ON cl.id = c.cliente_id
      LEFT JOIN usuarios r ON r.id = c.responsavel_id
      ${filtroStatus ? 'WHERE c.status = ?' : ''}
      ORDER BY c.criado_em DESC
    `).all(...(filtroStatus ? [filtroStatus] : []));

    chamados = chamados.map(c => ({ ...c, ...calcularTemposChamado(c) }));
  } else {
    chamados = db.prepare(`
      SELECT c.*, s.nome as setor_nome, cl.nome as cliente_nome, r.nome as responsavel_nome
      FROM chamados c
      JOIN setores s ON s.id = c.setor_id
      JOIN usuarios cl ON cl.id = c.cliente_id
      LEFT JOIN usuarios r ON r.id = c.responsavel_id
      WHERE c.setor_id = ?
      ${filtroStatus ? 'AND c.status = ?' : ''}
      ORDER BY c.criado_em DESC
    `).all(...(filtroStatus ? [usuario.setor_id, filtroStatus] : [usuario.setor_id]));
  }

  logger.info('CHAMADOS', `Listagem consultada por ${usuario.email} (${chamados.length} resultado(s))`);
  res.render('chamados/lista', { chamados, STATUS_LABEL, filtroStatus });
});

router.get('/chamados/novo', exigirLogin, (req, res) => {
  const setores = db.prepare('SELECT * FROM setores ORDER BY nome').all();
  const assuntos = db.prepare('SELECT * FROM assuntos_predefinidos ORDER BY setor_id').all();
  res.render('chamados/novo', { setores, assuntos, erro: null });
});

router.post('/chamados/novo', exigirLogin, upload.array('anexos', 5), (req, res) => {
  const usuario = req.session.usuario;
  const { setor_id, assunto_predefinido, titulo_customizado, descricao, prioridade } = req.body;

  const titulo = (assunto_predefinido && assunto_predefinido !== 'outro')
    ? assunto_predefinido
    : titulo_customizado;

  if (!titulo || !descricao || !setor_id) {
    logger.aviso('CHAMADOS', `Falha ao abrir chamado (dados incompletos) usuario=${usuario.email}`);
    const setores = db.prepare('SELECT * FROM setores ORDER BY nome').all();
    const assuntos = db.prepare('SELECT * FROM assuntos_predefinidos ORDER BY setor_id').all();
    return res.render('chamados/novo', { setores, assuntos, erro: 'Preencha o setor, assunto e a descricao do problema.' });
  }

  const protocolo = gerarProtocolo();

  const resultado = db.prepare(`
    INSERT INTO chamados (protocolo, titulo, descricao, setor_id, cliente_id, prioridade)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(protocolo, titulo, descricao, setor_id, usuario.id, prioridade || 'media');

  const chamadoId = Number(resultado.lastInsertRowid);

  if (req.files && req.files.length > 0) {
    const inserirAnexo = db.prepare(`
      INSERT INTO anexos (chamado_id, usuario_id, nome_original, caminho_arquivo)
      VALUES (?, ?, ?, ?)
    `);
    req.files.forEach(f => inserirAnexo.run(chamadoId, usuario.id, f.originalname, f.filename));
    logger.info('ANEXOS', `${req.files.length} arquivo(s) anexado(s) ao chamado ${protocolo}`);
  }

  db.prepare(`
    INSERT INTO historico (chamado_id, usuario_id, tipo, descricao)
    VALUES (?, ?, 'criacao', 'Chamado aberto pelo cliente.')
  `).run(chamadoId, usuario.id);

  logger.sucesso('CHAMADOS', `Chamado ${protocolo} aberto por ${usuario.email} (prioridade=${prioridade || 'media'})`);
  res.redirect('/chamados/' + chamadoId);
});

router.get('/chamados/:id', exigirLogin, (req, res) => {
  const usuario = req.session.usuario;
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

  const infoAtribuicao = db.prepare(`
    SELECT MIN(criado_em) as assumido_em FROM historico WHERE chamado_id = ? AND tipo = 'atribuicao'
  `).get(chamado.id);
  const tempos = calcularTemposChamado({ ...chamado, assumido_em: infoAtribuicao.assumido_em });

  const podeVer =
    usuario.tipo === 'admin' ||
    (usuario.tipo === 'cliente' && chamado.cliente_id === usuario.id) ||
    (usuario.tipo === 'agente' && chamado.setor_id === usuario.setor_id);

  if (!podeVer) {
    logger.aviso('CHAMADOS', `Acesso negado ao chamado ${chamado.protocolo} para ${usuario.email}`);
    return res.status(403).render('erro', { titulo: 'Acesso negado', mensagem: 'Voce nao tem acesso a este chamado.' });
  }

  const mensagens = db.prepare(`
    SELECT m.*, u.nome as usuario_nome, u.tipo as usuario_tipo
    FROM mensagens m
    JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.chamado_id = ? ${usuario.tipo === 'cliente' ? 'AND m.interna = 0' : ''}
    ORDER BY m.criado_em ASC
  `).all(req.params.id);

  const anexos = db.prepare('SELECT a.*, u.nome as usuario_nome FROM anexos a JOIN usuarios u ON u.id = a.usuario_id WHERE chamado_id = ? ORDER BY a.criado_em ASC').all(req.params.id);
  const historico = db.prepare('SELECT h.*, u.nome as usuario_nome FROM historico h LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE chamado_id = ? ORDER BY h.criado_em ASC').all(req.params.id);
  const setores = db.prepare('SELECT * FROM setores ORDER BY nome').all();

  const agentesDoSetor = db.prepare("SELECT id, nome FROM usuarios WHERE tipo = 'agente' AND setor_id = ?").all(chamado.setor_id);

  res.render('chamados/detalhe', {
    chamado, mensagens, anexos, historico, setores, agentesDoSetor, STATUS_LABEL, tempos
  });
});

router.post('/chamados/:id/mensagem', exigirLogin, upload.array('anexos', 5), (req, res) => {
  const usuario = req.session.usuario;
  const { mensagem, interna } = req.body;
  const chamadoId = req.params.id;

  if (!mensagem || !mensagem.trim()) return res.redirect('/chamados/' + chamadoId);

  const ehInterna = (usuario.tipo !== 'cliente' && interna === 'on') ? 1 : 0;

  db.prepare(`
    INSERT INTO mensagens (chamado_id, usuario_id, mensagem, interna)
    VALUES (?, ?, ?, ?)
  `).run(chamadoId, usuario.id, mensagem.trim(), ehInterna);

  if (req.files && req.files.length > 0) {
    const inserirAnexo = db.prepare(`
      INSERT INTO anexos (chamado_id, usuario_id, nome_original, caminho_arquivo)
      VALUES (?, ?, ?, ?)
    `);
    req.files.forEach(f => inserirAnexo.run(chamadoId, usuario.id, f.originalname, f.filename));
  }

  const chamado = db.prepare('SELECT status, protocolo FROM chamados WHERE id = ?').get(chamadoId);
  if (usuario.tipo === 'cliente' && chamado.status === 'aguardando_cliente') {
    db.prepare("UPDATE chamados SET status = 'em_andamento', atualizado_em = datetime('now') WHERE id = ?").run(chamadoId);
  } else {
    db.prepare("UPDATE chamados SET atualizado_em = datetime('now') WHERE id = ?").run(chamadoId);
  }

  logger.info('MENSAGEM', `${usuario.email} respondeu o chamado ${chamado.protocolo}${ehInterna ? ' (nota interna)' : ''}`);
  res.redirect('/chamados/' + chamadoId);
});

router.post('/chamados/:id/transferir', exigirLogin, exigirTI, (req, res) => {
  const { novo_setor_id, motivo } = req.body;
  const chamadoId = req.params.id;

  const chamadoAtual = db.prepare('SELECT protocolo FROM chamados WHERE id = ?').get(chamadoId);
  const setorAtual = db.prepare('SELECT s.nome FROM chamados c JOIN setores s ON s.id = c.setor_id WHERE c.id = ?').get(chamadoId);
  const setorNovo = db.prepare('SELECT nome FROM setores WHERE id = ?').get(novo_setor_id);

  db.prepare("UPDATE chamados SET setor_id = ?, responsavel_id = NULL, status = 'aberto', atualizado_em = datetime('now') WHERE id = ?")
    .run(novo_setor_id, chamadoId);

  db.prepare(`
    INSERT INTO historico (chamado_id, usuario_id, tipo, descricao)
    VALUES (?, ?, 'transferencia', ?)
  `).run(chamadoId, req.session.usuario.id, `Transferido de "${setorAtual.nome}" para "${setorNovo.nome}". Motivo: ${motivo || 'nao informado'}`);

  logger.sucesso('TRANSFERENCIA', `${chamadoAtual.protocolo} movido de "${setorAtual.nome}" para "${setorNovo.nome}" por ${req.session.usuario.email}`);
  res.redirect('/chamados/' + chamadoId);
});

router.post('/chamados/:id/assumir', exigirLogin, exigirTI, (req, res) => {
  const chamadoId = req.params.id;
  const usuario = req.session.usuario;

  db.prepare("UPDATE chamados SET responsavel_id = ?, status = 'em_andamento', atualizado_em = datetime('now') WHERE id = ?")
    .run(usuario.id, chamadoId);

  db.prepare(`
    INSERT INTO historico (chamado_id, usuario_id, tipo, descricao)
    VALUES (?, ?, 'atribuicao', ?)
  `).run(chamadoId, usuario.id, `${usuario.nome} assumiu o chamado.`);

  logger.sucesso('ATRIBUICAO', `${usuario.email} assumiu o chamado id=${chamadoId}`);
  res.redirect('/chamados/' + chamadoId);
});

router.post('/chamados/:id/status', exigirLogin, exigirTI, (req, res) => {
  const { status } = req.body;
  const chamadoId = req.params.id;

  const fechamento = (status === 'resolvido' || status === 'fechado') ? ", fechado_em = datetime('now')" : '';
  db.prepare(`UPDATE chamados SET status = ?, atualizado_em = datetime('now') ${fechamento} WHERE id = ?`).run(status, chamadoId);

  db.prepare(`
    INSERT INTO historico (chamado_id, usuario_id, tipo, descricao)
    VALUES (?, ?, 'status', ?)
  `).run(chamadoId, req.session.usuario.id, `Status alterado para "${STATUS_LABEL[status]}".`);

  logger.info('STATUS', `Chamado id=${chamadoId} alterado para "${STATUS_LABEL[status]}" por ${req.session.usuario.email}`);
  res.redirect('/chamados/' + chamadoId);
});

router.post('/chamados/:id/prioridade', exigirLogin, exigirTI, (req, res) => {
  const { prioridade } = req.body;
  const chamadoId = req.params.id;

  db.prepare("UPDATE chamados SET prioridade = ?, atualizado_em = datetime('now') WHERE id = ?").run(prioridade, chamadoId);

  db.prepare(`
    INSERT INTO historico (chamado_id, usuario_id, tipo, descricao)
    VALUES (?, ?, 'prioridade', ?)
  `).run(chamadoId, req.session.usuario.id, `Prioridade alterada para "${prioridade}".`);

  logger.info('PRIORIDADE', `Chamado id=${chamadoId} alterado para prioridade "${prioridade}" por ${req.session.usuario.email}`);
  res.redirect('/chamados/' + chamadoId);
});

router.get('/api/assuntos/:setorId', exigirLogin, (req, res) => {
  const assuntos = db.prepare('SELECT titulo FROM assuntos_predefinidos WHERE setor_id = ?').all(req.params.setorId);
  res.json(assuntos);
});

module.exports = router;
