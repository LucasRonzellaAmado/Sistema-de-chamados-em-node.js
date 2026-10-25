const h = require('./helpers');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('validacao de entradas', () => {
  let server, base, chamadoId, cliente, agenteFin, admin;

  before(async () => {
    server = await h.iniciarServidor();
    base = `http://localhost:${server.address().port}`;
    const idCliente = h.db.prepare("SELECT id FROM usuarios WHERE email = 'cliente@empresa.com'").get().id;
    chamadoId = h.criarChamado({ setor_id: 3, cliente_id: idCliente });
    cliente = new h.ClienteHttp(base);
    agenteFin = new h.ClienteHttp(base);
    admin = new h.ClienteHttp(base);
    await cliente.logar('cliente@empresa.com');
    await agenteFin.logar('financeiro@empresa.com');
    await admin.logar('admin@empresa.com');
  });

  after(() => h.encerrar(server));

  describe('cadastro', () => {
    it('recusa e-mail invalido', async () => {
      const c = new h.ClienteHttp(base);
      await c.abrir('/cadastro');
      const r = await c.post('/cadastro', { nome: 'Fulano', email: 'sem-arroba', senha: '12345678' });
      assert.match(r.html, /e-mail valido/);
    });

    it('recusa senha com menos de 8 caracteres', async () => {
      const c = new h.ClienteHttp(base);
      await c.abrir('/cadastro');
      const r = await c.post('/cadastro', { nome: 'Fulano', email: 'curta@teste.com', senha: '1234' });
      assert.match(r.html, /pelo menos 8/);
    });

    it('aceita dados validos e grava o usuario', async () => {
      const c = new h.ClienteHttp(base);
      await c.abrir('/cadastro');
      const r = await c.post('/cadastro', { nome: 'Fulano', email: 'valido@teste.com', senha: '12345678' });
      assert.equal(r.status, 302);
      assert.ok(h.db.prepare("SELECT id FROM usuarios WHERE email = 'valido@teste.com'").get());
    });
  });

  describe('login', () => {
    it('recusa senha vazia com mensagem', async () => {
      const c = new h.ClienteHttp(base);
      await c.abrir('/login');
      const r = await c.post('/login', { email: 'cliente@empresa.com', senha: '' });
      assert.match(r.html, /Informe e-mail e senha/);
    });
  });

  describe('status, prioridade e transferencia', () => {
    it('status invalido retorna 400', async () => {
      const r = await agenteFin.post(`/chamados/${chamadoId}/status`, { status: 'inventado' });
      assert.equal(r.status, 400);
    });

    it('prioridade invalida retorna 400', async () => {
      const r = await agenteFin.post(`/chamados/${chamadoId}/prioridade`, { prioridade: 'mega' });
      assert.equal(r.status, 400);
    });

    it('transferir para setor inexistente retorna 400', async () => {
      const r = await admin.post(`/chamados/${chamadoId}/transferir`, { novo_setor_id: 999 });
      assert.equal(r.status, 400);
    });

    it('resolver grava fechado_em e reabrir limpa', async () => {
      await agenteFin.post(`/chamados/${chamadoId}/status`, { status: 'resolvido' });
      const resolvido = h.db.prepare('SELECT fechado_em FROM chamados WHERE id = ?').get(chamadoId);
      assert.notEqual(resolvido.fechado_em, null);

      await agenteFin.post(`/chamados/${chamadoId}/status`, { status: 'em_andamento' });
      const reaberto = h.db.prepare('SELECT fechado_em FROM chamados WHERE id = ?').get(chamadoId);
      assert.equal(reaberto.fechado_em, null);
    });
  });

  describe('abertura de chamado', () => {
    it('setor inexistente nao causa erro 500', async () => {
      const form = new FormData();
      form.append('setor_id', '999');
      form.append('titulo_customizado', 'Titulo');
      form.append('descricao', 'Descricao');
      form.append('_csrf', cliente.token);
      const r = await fetch(`${base}/chamados/novo`, {
        method: 'POST', redirect: 'manual',
        headers: { cookie: cliente.cookie },
        body: form
      });
      assert.notEqual(r.status, 500);
    });
  });
});
