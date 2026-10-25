const { logger } = require('./logger');
const db = require('../db/database');

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

// Regra central de acesso a um chamado: quem pode ver/agir sobre ele.
function podeAcessarChamado(usuario, chamado) {
  if (usuario.tipo === 'admin') return true;
  if (usuario.tipo === 'cliente') return chamado.cliente_id === usuario.id;
  return chamado.setor_id === usuario.setor_id; // agente
}

// Carrega o chamado pelo :id e bloqueia se o usuario nao tiver acesso.
function carregarChamadoAutorizado(req, res, next) {
  const chamado = db.prepare('SELECT * FROM chamados WHERE id = ?').get(req.params.id);

  if (!chamado) {
    return res.status(404).render('erro', { titulo: 'Nao encontrado', mensagem: 'Chamado nao existe.' });
  }

  if (!podeAcessarChamado(req.session.usuario, chamado)) {
    logger.aviso('AUTH', `Acesso negado ao chamado ${chamado.protocolo} para ${req.session.usuario.email}`);
    return res.status(403).render('erro', { titulo: 'Acesso negado', mensagem: 'Voce nao tem acesso a este chamado.' });
  }

  res.locals.chamado = chamado;
  next();
}

function injetarUsuarioNasViews(req, res, next) {
  res.locals.usuarioLogado = req.session.usuario || null;
  next();
}

module.exports = {
  exigirLogin,
  exigirTI,
  exigirAdmin,
  injetarUsuarioNasViews,
  podeAcessarChamado,
  carregarChamadoAutorizado
};
