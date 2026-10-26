// Ambiente isolado para os testes: banco temporario, seed e servidor em porta livre.
// Deve ser o PRIMEIRO require de cada arquivo de teste.
const os = require('os');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DB_TESTE = path.join(os.tmpdir(), `chamados-teste-${process.pid}-${Date.now()}.db`);

process.env.DB_PATH = DB_TESTE;
process.env.SESSION_SECRET = 'segredo-de-teste';
process.env.NODE_ENV = 'test';

require(path.join(ROOT, 'db', 'seed.js'));
const db = require(path.join(ROOT, 'db', 'database.js'));
const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const app = require(path.join(ROOT, 'server.js'));

const SENHA_PADRAO = '123456';

function iniciarServidor() {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

// Fecha o servidor (inclusive conexoes keep-alive, senao o close nunca termina)
function encerrar(server) {
  return new Promise(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

// O banco temporario so pode ser apagado depois de fechado (no Windows o arquivo fica travado)
process.on('exit', () => {
  try { db.close(); } catch {}
  try { fs.rmSync(DB_TESTE, { force: true }); } catch {}
});

function criarUsuario({ nome, email, tipo = 'cliente', setor_id = null }) {
  db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, tipo, setor_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(nome, email, bcrypt.hashSync(SENHA_PADRAO, 4), tipo, setor_id);
  return db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email).id;
}

let contadorProtocolo = 0;
function criarChamado({ setor_id, cliente_id, status = 'aberto' }) {
  contadorProtocolo += 1;
  const protocolo = `CH-T${String(contadorProtocolo).padStart(4, '0')}`;
  db.prepare(`
    INSERT INTO chamados (protocolo, titulo, descricao, setor_id, cliente_id, status)
    VALUES (?, 'Chamado de teste', 'descricao', ?, ?, ?)
  `).run(protocolo, setor_id, cliente_id, status);
  return db.prepare('SELECT id FROM chamados WHERE protocolo = ?').get(protocolo).id;
}

// Cliente HTTP com cookie de sessao e token CSRF da ultima pagina aberta
class ClienteHttp {
  constructor(base) {
    this.base = base;
    this.cookie = '';
    this.token = null;
  }

  guardarRespostaBase(r, html) {
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const m = html.match(/name="_csrf" value="([^"]+)"/);
    if (m) this.token = m[1];
  }

  async abrir(caminho) {
    const r = await fetch(this.base + caminho, { headers: { cookie: this.cookie } });
    const html = await r.text();
    this.guardarRespostaBase(r, html);
    return { status: r.status, html };
  }

  // Envia formulario urlencoded. Inclui o token automaticamente, salvo se semToken=true.
  async post(caminho, campos = {}, { semToken = false } = {}) {
    const dados = { ...campos };
    if (!semToken) dados._csrf = this.token;
    const r = await fetch(this.base + caminho, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: this.cookie },
      body: new URLSearchParams(dados)
    });
    const html = await r.text();
    this.guardarRespostaBase(r, html);
    return { status: r.status, html };
  }

  // Envia formulario multipart (com anexos). Inclui o token automaticamente.
  async postMultipart(caminho, campos = {}, arquivos = [], { semToken = false } = {}) {
    const form = new FormData();
    Object.entries(campos).forEach(([k, v]) => form.append(k, v));
    if (!semToken) form.append('_csrf', this.token);
    arquivos.forEach(({ nome, conteudo }) => form.append('anexos', new Blob([conteudo]), nome));
    const r = await fetch(this.base + caminho, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: this.cookie },
      body: form
    });
    const html = await r.text();
    this.guardarRespostaBase(r, html);
    return { status: r.status, html };
  }

  async logar(email, senha = SENHA_PADRAO) {
    await this.abrir('/login');
    const r = await this.post('/login', { email, senha });
    await this.abrir('/chamados'); // atualiza o token para a sessao logada
    return r;
  }
}

module.exports = {
  db,
  app,
  ROOT,
  SENHA_PADRAO,
  iniciarServidor,
  encerrar,
  criarUsuario,
  criarChamado,
  ClienteHttp
};
