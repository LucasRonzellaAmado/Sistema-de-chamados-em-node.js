const h = require('./helpers');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('protecao CSRF', () => {
  let server, base, chamadoId;

  before(async () => {
    server = await h.iniciarServidor();
    base = `http://localhost:${server.address().port}`;
    const idCliente = h.db.prepare("SELECT id FROM usuarios WHERE email = 'cliente@empresa.com'").get().id;
    chamadoId = h.criarChamado({ setor_id: 3, cliente_id: idCliente });
  });

  after(() => h.encerrar(server));

  it('pagina de login traz token', async () => {
    const c = new h.ClienteHttp(base);
    await c.abrir('/login');
    assert.ok(c.token);
  });

  it('login sem token e bloqueado (403)', async () => {
    const c = new h.ClienteHttp(base);
    await c.abrir('/login');
    const r = await c.post('/login', { email: 'cliente@empresa.com', senha: '123456' }, { semToken: true });
    assert.equal(r.status, 403);
  });

  it('login com token funciona (302)', async () => {
    const c = new h.ClienteHttp(base);
    await c.abrir('/login');
    const r = await c.post('/login', { email: 'cliente@empresa.com', senha: '123456' });
    assert.equal(r.status, 302);
  });

  it('mensagem multipart sem token e bloqueada, com token e aceita', async () => {
    const c = new h.ClienteHttp(base);
    await c.logar('cliente@empresa.com');
    const semToken = await c.postMultipart(`/chamados/${chamadoId}/mensagem`, { mensagem: 'oi' }, [], { semToken: true });
    assert.equal(semToken.status, 403);
    const comToken = await c.postMultipart(`/chamados/${chamadoId}/mensagem`, { mensagem: 'oi' });
    assert.equal(comToken.status, 302);
  });

  it('status sem token e bloqueado, com token e aceito', async () => {
    const agente = new h.ClienteHttp(base);
    await agente.logar('financeiro@empresa.com');
    const semToken = await agente.post(`/chamados/${chamadoId}/status`, { status: 'em_andamento' }, { semToken: true });
    assert.equal(semToken.status, 403);
    const comToken = await agente.post(`/chamados/${chamadoId}/status`, { status: 'em_andamento' });
    assert.equal(comToken.status, 302);
  });

  it('token de outra sessao e recusado', async () => {
    const a = new h.ClienteHttp(base);
    const b = new h.ClienteHttp(base);
    await a.logar('cliente@empresa.com');
    await b.logar('financeiro@empresa.com');
    const r = await b.post(`/chamados/${chamadoId}/status`, { status: 'fechado' }, { semToken: true });
    // reaproveita o token da sessao A na requisicao da sessao B
    const r2 = await fetch(`${base}/chamados/${chamadoId}/status`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: b.cookie },
      body: new URLSearchParams({ status: 'fechado', _csrf: a.token })
    });
    assert.equal(r.status, 403);
    assert.equal(r2.status, 403);
  });

  it('logout sem token e bloqueado, com token e aceito', async () => {
    const c = new h.ClienteHttp(base);
    await c.logar('cliente@empresa.com');
    const semToken = await c.post('/logout', {}, { semToken: true });
    assert.equal(semToken.status, 403);
    const comToken = await c.post('/logout', {});
    assert.equal(comToken.status, 302);
  });
});
