const h = require('./helpers');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const idUsuario = (email) => h.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email).id;
const idSetor = (nome) => h.db.prepare('SELECT id FROM setores WHERE nome = ?').get(nome).id;

describe('controle de acesso aos chamados', () => {
  let server, base, chamadoFinanceiro, cliente, outroCliente;

  before(async () => {
    server = await h.iniciarServidor();
    base = `http://localhost:${server.address().port}`;
    const idCliente = idUsuario('cliente@empresa.com');
    const idOutro = h.criarUsuario({ nome: 'Outro Cliente', email: 'outro@teste.com' });
    chamadoFinanceiro = h.criarChamado({ setor_id: idSetor('Financeiro'), cliente_id: idCliente });
    cliente = new h.ClienteHttp(base);
    outroCliente = new h.ClienteHttp(base);
    await cliente.logar('cliente@empresa.com');
    await outroCliente.logar('outro@teste.com');
  });

  after(() => h.encerrar(server));

  it('cliente dono posta mensagem no proprio chamado', async () => {
    const r = await cliente.post(`/chamados/${chamadoFinanceiro}/mensagem`, { mensagem: 'oi' });
    assert.equal(r.status, 302);
  });

  it('outro cliente nao posta mensagem em chamado alheio', async () => {
    const r = await outroCliente.post(`/chamados/${chamadoFinanceiro}/mensagem`, { mensagem: 'oi' });
    assert.equal(r.status, 403);
  });

  it('cliente nao ve a pagina de detalhe de chamado alheio', async () => {
    const r = await outroCliente.abrir(`/chamados/${chamadoFinanceiro}`);
    assert.equal(r.status, 403);
  });

  it('tecnico de outro setor tambem ajuda no chamado (modelo GLPI)', async () => {
    const agenteSuporte = new h.ClienteHttp(base);
    await agenteSuporte.logar('davi@empresa.com');
    const pagina = await agenteSuporte.abrir(`/chamados/${chamadoFinanceiro}`);
    assert.equal(pagina.status, 200);
    const r = await agenteSuporte.post(`/chamados/${chamadoFinanceiro}/mensagem`, { mensagem: 'posso ajudar' });
    assert.equal(r.status, 302);
  });

  it('agente do proprio setor muda status', async () => {
    const agenteFin = new h.ClienteHttp(base);
    await agenteFin.logar('financeiro@empresa.com');
    const r = await agenteFin.post(`/chamados/${chamadoFinanceiro}/status`, { status: 'em_andamento' });
    assert.equal(r.status, 302);
  });

  it('cliente nao transfere chamado (somente equipe)', async () => {
    const r = await cliente.post(`/chamados/${chamadoFinanceiro}/transferir`, { novo_setor_id: idSetor('Suporte') });
    assert.equal(r.status, 403);
  });

  it('admin transfere chamado', async () => {
    const admin = new h.ClienteHttp(base);
    await admin.logar('admin@empresa.com');
    const r = await admin.post(`/chamados/${chamadoFinanceiro}/transferir`, { novo_setor_id: idSetor('Suporte') });
    assert.equal(r.status, 302);
  });

  it('chamado inexistente retorna 404', async () => {
    const admin = new h.ClienteHttp(base);
    await admin.logar('admin@empresa.com');
    const r = await admin.post('/chamados/999999/status', { status: 'fechado' });
    assert.equal(r.status, 404);
  });
});
