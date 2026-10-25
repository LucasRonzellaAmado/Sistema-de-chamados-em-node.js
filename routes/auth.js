const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { logger } = require('../middlewares/logger');
const { csrfProtection } = require('../middlewares/csrf');
const { validarCadastro } = require('../utils/validacao');

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/chamados');
  res.render('login', { erro: null });
});

router.post('/login', csrfProtection, (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.render('login', { erro: 'Informe e-mail e senha.' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email);

  if (!usuario || !bcrypt.compareSync(senha, usuario.senha_hash)) {
    logger.aviso('LOGIN', `Tentativa de login invalida para email=${email}`);
    return res.render('login', { erro: 'E-mail ou senha invalidos.' });
  }

  req.session.usuario = {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    tipo: usuario.tipo,
    setor_id: usuario.setor_id
  };

  logger.sucesso('LOGIN', `Login bem-sucedido: ${usuario.email} (${usuario.tipo})`);
  res.redirect('/chamados');
});

router.post('/logout', csrfProtection, (req, res) => {
  const email = req.session.usuario ? req.session.usuario.email : 'desconhecido';
  req.session.destroy(() => {
    logger.info('LOGIN', `Logout: ${email}`);
    res.redirect('/login');
  });
});

router.get('/cadastro', (req, res) => {
  res.render('cadastro', { erro: null });
});

router.post('/cadastro', csrfProtection, (req, res) => {
  const { nome, email, senha } = req.body;

  const erroValidacao = validarCadastro({ nome, email, senha });
  if (erroValidacao) {
    return res.render('cadastro', { erro: erroValidacao });
  }

  const jaExiste = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (jaExiste) {
    logger.aviso('CADASTRO', `Tentativa de cadastro com email ja existente: ${email}`);
    return res.render('cadastro', { erro: 'Este e-mail ja esta cadastrado.' });
  }

  const senhaHash = bcrypt.hashSync(senha, 10);
  db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, tipo, setor_id)
    VALUES (?, ?, ?, 'cliente', NULL)
  `).run(nome, email, senhaHash);

  logger.sucesso('CADASTRO', `Novo cliente cadastrado: ${email}`);
  res.redirect('/login');
});

module.exports = router;
