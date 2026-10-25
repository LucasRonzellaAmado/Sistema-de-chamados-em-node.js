const h = require('./helpers');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const idUsuario = (email) => h.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email).id;

describe('anexos', () => {
  let server, base, chamadoId, cliente, outroCliente, suporte, anexoId;

  before(async () => {
    server = await h.iniciarServidor();
    base = `http://localhost:${server.address().port}`;
    const idDono = idUsuario('cliente@empresa.com');
    h.criarUsuario({ nome: 'Outro Cliente', email: 'outro-anexo@teste.com' });
    // Setor Financeiro (3): o agente do Suporte (davi) nao deve ter acesso
    chamadoId = h.criarChamado({ setor_id: 3, cliente_id: idDono });

    cliente = new h.ClienteHttp(base);
    outroCliente = new h.ClienteHttp(base);
    suporte = new h.ClienteHttp(base);
    await cliente.logar('cliente@empresa.com');
    await outroCliente.logar('outro-anexo@teste.com');
    await suporte.logar('davi@empresa.com');
  });

  after(() => h.encerrar(server));

  it('aceita PDF anexado a uma mensagem', async () => {
    const r = await cliente.postMultipart(`/chamados/${chamadoId}/mensagem`,
      { mensagem: 'segue arquivo' },
      [{ nome: 'doc.pdf', conteudo: '%PDF-1.4 conteudo de teste' }]);
    assert.equal(r.status, 302);
    anexoId = h.db.prepare('SELECT id FROM anexos WHERE chamado_id = ?').get(chamadoId).id;
    assert.ok(anexoId);
  });

  it('descarta arquivo com extensao nao permitida (.html)', async () => {
    const antes = h.db.prepare('SELECT COUNT(*) AS n FROM anexos').get().n;
    await cliente.postMultipart(`/chamados/${chamadoId}/mensagem`,
      { mensagem: 'tentativa' },
      [{ nome: 'malicioso.html', conteudo: '<script>alert(1)</script>' }]);
    const depois = h.db.prepare('SELECT COUNT(*) AS n FROM anexos').get().n;
    assert.equal(depois, antes);
  });

  it('grava o arquivo no disco com nome aleatorio, nao o original', () => {
    const { caminho_arquivo } = h.db.prepare('SELECT caminho_arquivo FROM anexos WHERE id = ?').get(anexoId);
    assert.notEqual(caminho_arquivo, 'doc.pdf');
    assert.match(caminho_arquivo, /\.pdf$/);
  });

  it('dono baixa o anexo com o conteudo correto', async () => {
    const r = await fetch(`${base}/anexos/${anexoId}`, { headers: { cookie: cliente.cookie } });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /conteudo de teste/);
  });

  it('outro cliente nao baixa o anexo (404)', async () => {
    const r = await fetch(`${base}/anexos/${anexoId}`, { headers: { cookie: outroCliente.cookie } });
    assert.equal(r.status, 404);
  });

  it('agente de outro setor nao baixa o anexo (404)', async () => {
    const r = await fetch(`${base}/anexos/${anexoId}`, { headers: { cookie: suporte.cookie } });
    assert.equal(r.status, 404);
  });

  it('sem login, o download redireciona para o login', async () => {
    const r = await fetch(`${base}/anexos/${anexoId}`, { redirect: 'manual' });
    assert.equal(r.status, 302);
  });

  it('pasta uploads nao e mais publica', async () => {
    const { caminho_arquivo } = h.db.prepare('SELECT caminho_arquivo FROM anexos WHERE id = ?').get(anexoId);
    const r = await fetch(`${base}/uploads/${caminho_arquivo}`);
    assert.equal(r.status, 404);
  });
});
