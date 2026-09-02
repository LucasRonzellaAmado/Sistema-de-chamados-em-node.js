const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'chamados.db'));

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS setores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    descricao TEXT
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'cliente',
    setor_id INTEGER,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (setor_id) REFERENCES setores(id)
  );

  CREATE TABLE IF NOT EXISTS assuntos_predefinidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setor_id INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    FOREIGN KEY (setor_id) REFERENCES setores(id)
  );

  CREATE TABLE IF NOT EXISTS chamados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocolo TEXT NOT NULL UNIQUE,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    setor_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    responsavel_id INTEGER,
    status TEXT NOT NULL DEFAULT 'aberto',
    prioridade TEXT NOT NULL DEFAULT 'media',
    criado_em TEXT DEFAULT (datetime('now')),
    atualizado_em TEXT DEFAULT (datetime('now')),
    fechado_em TEXT,
    FOREIGN KEY (setor_id) REFERENCES setores(id),
    FOREIGN KEY (cliente_id) REFERENCES usuarios(id),
    FOREIGN KEY (responsavel_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chamado_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    mensagem TEXT NOT NULL,
    interna INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (chamado_id) REFERENCES chamados(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS anexos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chamado_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    nome_original TEXT NOT NULL,
    caminho_arquivo TEXT NOT NULL,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (chamado_id) REFERENCES chamados(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chamado_id INTEGER NOT NULL,
    usuario_id INTEGER,
    tipo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (chamado_id) REFERENCES chamados(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`);

module.exports = db;
