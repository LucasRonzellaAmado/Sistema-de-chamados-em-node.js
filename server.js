require('dotenv').config();
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');

const { injetarUsuarioNasViews } = require('./middlewares/auth');
const { logger, middlewareRequisicoes } = require('./middlewares/logger');
const rotasAuth = require('./routes/auth');
const rotasChamados = require('./routes/chamados');

const app = express();
const PORTA = process.env.PORTA || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(middlewareRequisicoes);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'troque-este-segredo-em-producao',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

app.use(injetarUsuarioNasViews);

app.get('/', (req, res) => res.redirect(req.session.usuario ? '/chamados' : '/login'));

app.use(rotasAuth);
app.use(rotasChamados);

app.use((req, res) => {
  logger.aviso('ROTA', `404 nao encontrado: ${req.originalUrl}`);
  res.status(404).render('erro', { titulo: 'Pagina nao encontrada', mensagem: 'A pagina que voce procura nao existe.' });
});

app.use((err, req, res, next) => {
  logger.erro('SERVIDOR', `${err.message}\n${err.stack}`);
  res.status(500).render('erro', { titulo: 'Erro interno', mensagem: 'Algo deu errado ao processar sua solicitacao.' });
});

app.listen(PORTA, () => {
  logger.sucesso('SERVIDOR', `Painel de Chamados rodando em http://localhost:${PORTA}`);
});
