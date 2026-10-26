require('dotenv').config();
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');

const config = require('./config');
const { injetarUsuarioNasViews } = require('./middlewares/auth');
const { disponibilizarTokenCSRF } = require('./middlewares/csrf');
const { logger, middlewareRequisicoes } = require('./middlewares/logger');
const { cabecalhosSeguranca, semCache } = require('./middlewares/seguranca');
const rotasAuth = require('./routes/auth');
const rotasChamados = require('./routes/chamados');

fs.mkdirSync(config.uploadsDir, { recursive: true });

const app = express();
app.disable('x-powered-by');
if (config.isProducao) app.set('trust proxy', 1); // atras de proxy reverso (HTTPS)

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(middlewareRequisicoes);
app.use(cabecalhosSeguranca);
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  name: 'sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProducao
  }
}));

app.use(semCache);
app.use(injetarUsuarioNasViews);
app.use(disponibilizarTokenCSRF);

app.get('/', (req, res) => res.redirect(req.session.usuario ? '/chamados' : '/login'));

app.use(rotasAuth);
app.use(rotasChamados);

app.use((req, res) => {
  logger.aviso('ROTA', `404 nao encontrado: ${req.originalUrl}`);
  res.status(404).render('erro', { titulo: 'Pagina nao encontrada', mensagem: 'A pagina que voce procura nao existe.' });
});

app.use((err, req, res, next) => {
  // Erros que acontecem antes dos middlewares de view ainda precisam renderizar a pagina
  if (res.locals.usuarioLogado === undefined) injetarUsuarioNasViews(req, res, () => {});
  if (res.locals.csrfToken === undefined) res.locals.csrfToken = '';
  if (err.type === 'entity.too.large') {
    return res.status(413).render('erro', { titulo: 'Envio muito grande', mensagem: 'O formulario enviado excede o tamanho permitido.' });
  }
  if (err.code === 'EBADCSRFTOKEN') {
    logger.aviso('CSRF', `Token invalido em ${req.method} ${req.originalUrl}`);
    return res.status(403).render('erro', {
      titulo: 'Sessao expirada',
      mensagem: 'Sua sessao expirou ou o formulario e invalido. Recarregue a pagina e tente novamente.'
    });
  }
  if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).render('erro', { titulo: 'Anexo recusado', mensagem: 'Envie no maximo 5 arquivos de ate 15 MB cada.' });
  }
  logger.erro('SERVIDOR', `${err.message}\n${err.stack}`);
  res.status(500).render('erro', { titulo: 'Erro interno', mensagem: 'Algo deu errado ao processar sua solicitacao.' });
});

if (require.main === module) {
  app.listen(config.porta, () => {
    logger.sucesso('SERVIDOR', `Painel de Chamados rodando em http://localhost:${config.porta}`);
  });
}

module.exports = app;
