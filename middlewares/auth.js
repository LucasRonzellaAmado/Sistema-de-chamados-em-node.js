const { logger } = require('./logger');
const db = require('../db/database');

// Equipe = tecnicos (agentes) e administradores. Clientes sao os solicitantes.
function ehEquipe(usuario) {
  return !!usuario && (usuario.tipo === 'agente' || usuario.tipo === 'admin');
}

// Exige sessao e recarrega o usuario do banco a cada requisicao: se ele foi
// desativado ou mudou de perfil, a sessao antiga deixa de valer na hora.
function exigirLogin(req, res, next) {
  const sessao = req.session.usuario;
  if (!sessao) {
    logger.aviso('AUTH', `Acesso negado (sem sessao) em ${req.originalUrl}`);
    return res.redirect('/login');
  }

  const atual = db.prepare('SELECT id, nome, email, tipo, setor_id FROM usuarios WHERE id = ? AND ativo = 1').get(sessao.id);
  if (!atual) {
    logger.aviso('AUTH', `Sessao de usuario inativo/removido encerrada: ${sessao.email}`);
    return req.session.destroy(() => res.redirect('/login'));
  }

  req.session.usuario = { ...atual };
  res.locals.usuarioLogado = req.session.usuario;
  next();
}

function exigirTI(req, res, next) {
  const usuario = req.session.usuario;
  if (!ehEquipe(usuario)) {
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

// Regra central de acesso a um chamado (modelo GLPI): toda a equipe enxerga e
// colabora em qualquer chamado; o cliente so enxerga os chamados que abriu.
function podeAcessarChamado(usuario, chamado) {
  if (ehEquipe(usuario)) return true;
  return chamado.cliente_id === usuario.id;
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
  res.locals.ehEquipe = ehEquipe;
  next();
}

module.exports = {
  ehEquipe,
  exigirLogin,
  exigirTI,
  exigirAdmin,
  injetarUsuarioNasViews,
  podeAcessarChamado,
  carregarChamadoAutorizado
};
