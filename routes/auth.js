const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const config = require('../config');
const { logger } = require('../middlewares/logger');
const { csrfProtection } = require('../middlewares/csrf');
const { loginBloqueado, registrarFalhaLogin, limparFalhasLogin } = require('../middlewares/seguranca');
const { validarCadastro, normalizarEmail } = require('../utils/validacao');

// Hash usado quando o e-mail nao existe, para o tempo de resposta ser parecido
// e nao revelar quais e-mails estao cadastrados.
const HASH_FALSO = bcrypt.hashSync('senha-que-nunca-sera-usada', 10);

const renderLogin = (res, erro, status = 200) =>
  res.status(status).render('login', { erro, mostrarUsuariosTeste: !config.isProducao });

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/chamados');
  renderLogin(res, null);
});

router.post('/login', csrfProtection, (req, res, next) => {
  const email = normalizarEmail(req.body.email);
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';

  if (!email || !senha) {
    return renderLogin(res, 'Informe e-mail e senha.');
  }

  if (loginBloqueado(req)) {
    logger.aviso('LOGIN', `Login bloqueado por excesso de tentativas: ${email}`);
    return renderLogin(res, 'Muitas tentativas invalidas. Aguarde 15 minutos e tente novamente.', 429);
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email);
  const senhaOk = bcrypt.compareSync(senha, usuario ? usuario.senha_hash : HASH_FALSO);

  if (!usuario || !senhaOk) {
    registrarFalhaLogin(req);
    logger.aviso('LOGIN', `Tentativa de login invalida para email=${email}`);
    return renderLogin(res, 'E-mail ou senha invalidos.');
  }

  limparFalhasLogin(req);

  // Nova sessao no login evita fixacao de sessao
  req.session.regenerate(err => {
    if (err) return next(err);
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
});

router.post('/logout', csrfProtection, (req, res) => {
  const email = req.session.usuario ? req.session.usuario.email : 'desconhecido';
  req.session.destroy(() => {
    res.clearCookie('sid');
    logger.info('LOGIN', `Logout: ${email}`);
    res.redirect('/login');
  });
});

router.get('/cadastro', (req, res) => {
  res.render('cadastro', { erro: null });
});

router.post('/cadastro', csrfProtection, (req, res) => {
  const nome = typeof req.body.nome === 'string' ? req.body.nome.trim() : '';
  const email = normalizarEmail(req.body.email);
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';

  const erroValidacao = validarCadastro({ nome, email, senha });
  if (erroValidacao) {
    return res.render('cadastro', { erro: erroValidacao });
  }

  const jaExiste = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (jaExiste) {
    logger.aviso('CADASTRO', `Tentativa de cadastro com email ja existente: ${email}`);
    return res.render('cadastro', { erro: 'Este e-mail ja esta cadastrado.' });
  }

  const senhaHash = bcrypt.hashSync(senha, 12);
  db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, tipo, setor_id)
    VALUES (?, ?, ?, 'cliente', NULL)
  `).run(nome, email, senhaHash);

  logger.sucesso('CADASTRO', `Novo cliente cadastrado: ${email}`);
  res.redirect('/login');
});

module.exports = router;
