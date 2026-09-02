const { logger } = require('./logger');

function exigirLogin(req, res, next) {
  if (!req.session.usuario) {
    logger.aviso('AUTH', `Acesso negado (sem sessao) em ${req.originalUrl}`);
    return res.redirect('/login');
  }
  next();
}

function exigirTI(req, res, next) {
  const usuario = req.session.usuario;
  if (!usuario || (usuario.tipo !== 'agente' && usuario.tipo !== 'admin')) {
    logger.aviso('AUTH', `Acesso negado (nao-TI) usuario=${usuario ? usuario.email : 'anonimo'} em ${req.originalUrl}`);
    return res.status(403).render('erro', {
      titulo: 'Acesso negado',
      mensagem: 'Apenas a equipe de TI pode acessar esta pagina.'
    });
  }
  next();
}

function exigirAdmin(req, res, next) {
  const usuario = req.session.usuario;
  if (!usuario || usuario.tipo !== 'admin') {
    logger.aviso('AUTH', `Acesso negado (nao-admin) usuario=${usuario ? usuario.email : 'anonimo'} em ${req.originalUrl}`);
    return res.status(403).render('erro', {
      titulo: 'Acesso negado',
      mensagem: 'Apenas administradores podem acessar esta pagina.'
    });
  }
  next();
}

function injetarUsuarioNasViews(req, res, next) {
  res.locals.usuarioLogado = req.session.usuario || null;
  next();
}

module.exports = { exigirLogin, exigirTI, exigirAdmin, injetarUsuarioNasViews };
