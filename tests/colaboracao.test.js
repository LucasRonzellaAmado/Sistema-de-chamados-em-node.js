const h = require('./helpers');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const idUsuario = (email) => h.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email).id;
const ultimaMensagem = (chamadoId) =>
  h.db.prepare('SELECT * FROM mensagens WHERE chamado_id = ? ORDER BY id DESC LIMIT 1').get(chamadoId);

describe('colaboracao da equipe e notas privadas', () => {
  let server, base, chamadoId, cliente, suporte, dev;

  before(async () => {
    server = await h.iniciarServidor();
    base = `http://localhost:${server.address().port}`;
    chamadoId = h.criarChamado({ setor_id: 3, cliente_id: idUsuario('cliente@empresa.com') });
    cliente = new h.ClienteHttp(base);
    suporte = new h.ClienteHttp(base);
    dev = new h.ClienteHttp(base);
    await cliente.logar('cliente@empresa.com');
    await suporte.logar('davi@empresa.com');
    await dev.logar('lucas@empresa.com');
  });

  after(() => h.encerrar(server));

  it('comando /nota grava nota privada sem o comando no texto', async () => {
    await suporte.post(`/chamados/${chamadoId}/mensagem`, { mensagem: '/nota segredo-da-equipe' });
    const m = ultimaMensagem(chamadoId);
    assert.equal(m.tipo, 'nota');
    assert.equal(m.mensagem, 'segredo-da-equipe');
  });

  it('comando /privado tambem gera nota privada', async () => {
    await dev.post(`/chamados/${chamadoId}/mensagem`, { mensagem: '/privado outro-segredo' });
    assert.equal(ultimaMensagem(chamadoId).tipo, 'nota');
  });

  it('outro tecnico enxerga a nota privada', async () => {
    const r = await dev.abrir(`/chamados/${chamadoId}`);
    assert.match(r.html, /segredo-da-equipe/);
  });

  it('cliente nao enxerga a nota privada', async () => {
    const r = await cliente.abrir(`/chamados/${chamadoId}`);
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.html, /segredo-da-equipe/);
    assert.doesNotMatch(r.html, /outro-segredo/);
  });

  it('comando digitado pelo cliente vira mensagem publica comum', async () => {
    await cliente.post(`/chamados/${chamadoId}/mensagem`, { mensagem: '/nota tentando esconder' });
    const m = ultimaMensagem(chamadoId);
    assert.equal(m.tipo, 'acompanhamento');
    assert.equal(m.mensagem, '/nota tentando esconder');
  });

  it('anexo de nota privada nao e entregue ao cliente', async () => {
    await suporte.postMultipart(`/chamados/${chamadoId}/mensagem`,
      { mensagem: '/nota log interno' },
      [{ nome: 'log.txt', conteudo: 'log confidencial' }]);
    const anexo = h.db.prepare('SELECT id FROM anexos WHERE chamado_id = ? ORDER BY id DESC LIMIT 1').get(chamadoId);

    const doCliente = await fetch(`${base}/anexos/${anexo.id}`, { headers: { cookie: cliente.cookie } });
    assert.equal(doCliente.status, 404);
    const daEquipe = await fetch(`${base}/anexos/${anexo.id}`, { headers: { cookie: dev.cookie } });
    assert.equal(daEquipe.status, 200);
  });

  it('qualquer tecnico pode observar e atribuir o chamado', async () => {
    let r = await dev.post(`/chamados/${chamadoId}/observar`);
    assert.equal(r.status, 302);
    assert.ok(h.db.prepare('SELECT 1 FROM chamado_observadores WHERE chamado_id = ? AND usuario_id = ?')
      .get(chamadoId, idUsuario('lucas@empresa.com')));

    r = await dev.post(`/chamados/${chamadoId}/atribuir`, { responsavel_id: idUsuario('davi@empresa.com') });
    assert.equal(r.status, 302);
    assert.equal(h.db.prepare('SELECT responsavel_id FROM chamados WHERE id = ?').get(chamadoId).responsavel_id,
      idUsuario('davi@empresa.com'));
  });

  it('nao atribui chamado a um cliente', async () => {
    const r = await dev.post(`/chamados/${chamadoId}/atribuir`, { responsavel_id: idUsuario('cliente@empresa.com') });
    assert.equal(r.status, 400);
  });

  it('/solucao resolve o chamado; cliente recusa e ele reabre', async () => {
    await suporte.post(`/chamados/${chamadoId}/mensagem`, { mensagem: '/solucao reinicie o roteador' });
    assert.equal(h.db.prepare('SELECT status FROM chamados WHERE id = ?').get(chamadoId).status, 'resolvido');

    await cliente.abrir(`/chamados/${chamadoId}`);
    await cliente.post(`/chamados/${chamadoId}/solucao/recusar`, { motivo: 'continua sem internet' });
    const c = h.db.prepare('SELECT status, fechado_em FROM chamados WHERE id = ?').get(chamadoId);
    assert.equal(c.status, 'em_andamento');
    assert.equal(c.fechado_em, null);
  });

  it('cliente aprova a solucao e o chamado fecha', async () => {
    await suporte.post(`/chamados/${chamadoId}/mensagem`, { mensagem: '/solucao troquei o cabo' });
    await cliente.post(`/chamados/${chamadoId}/solucao/aprovar`);
    assert.equal(h.db.prepare('SELECT status FROM chamados WHERE id = ?').get(chamadoId).status, 'fechado');
  });

  it('tecnico nao pode aprovar a solucao no lugar do cliente', async () => {
    const outro = h.criarChamado({ setor_id: 1, cliente_id: idUsuario('cliente@empresa.com'), status: 'resolvido' });
    const r = await suporte.post(`/chamados/${outro}/solucao/aprovar`);
    assert.equal(r.status, 403);
  });

  it('chamado fechado nao aceita novas mensagens', async () => {
    const r = await suporte.post(`/chamados/${chamadoId}/mensagem`, { mensagem: 'mais uma' });
    assert.equal(r.status, 400);
  });

  it('cliente nao lista chamados de outros e equipe lista todos', async () => {
    const r = await suporte.abrir('/chamados');
    assert.match(r.html, /CH-T/);
  });
});

describe('seguranca', () => {
  let server, base;

  before(async () => {
    server = await h.iniciarServidor();
    base = `http://localhost:${server.address().port}`;
  });

  after(() => h.encerrar(server));

  it('envia cabecalhos de seguranca e esconde o x-powered-by', async () => {
    const r = await fetch(`${base}/login`);
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
  });

  it('troca o id da sessao no login (anti fixacao)', async () => {
    const c = new h.ClienteHttp(base);
    await c.abrir('/login');
    const antes = c.cookie;
    await c.post('/login', { email: 'cliente@empresa.com', senha: h.SENHA_PADRAO });
    assert.notEqual(c.cookie, antes);
  });

  it('bloqueia o login apos varias senhas erradas', async () => {
    h.criarUsuario({ nome: 'Alvo', email: 'alvo@teste.com' });
    const c = new h.ClienteHttp(base);
    await c.abrir('/login');
    for (let i = 0; i < 5; i++) await c.post('/login', { email: 'alvo@teste.com', senha: 'errada' });
    const r = await c.post('/login', { email: 'alvo@teste.com', senha: h.SENHA_PADRAO });
    assert.equal(r.status, 429);
  });

  it('usuario desativado perde a sessao imediatamente', async () => {
    const id = h.criarUsuario({ nome: 'Temp', email: 'temp@teste.com' });
    const c = new h.ClienteHttp(base);
    await c.logar('temp@teste.com');
    h.db.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?').run(id);
    const r = await fetch(`${base}/chamados`, { headers: { cookie: c.cookie }, redirect: 'manual' });
    assert.equal(r.status, 302);
  });
});
