const CORES = {
  reset: '\x1b[0m',
  cinza: '\x1b[90m',
  azul: '\x1b[34m',
  verde: '\x1b[32m',
  amarelo: '\x1b[33m',
  vermelho: '\x1b[31m',
  ciano: '\x1b[36m',
  magenta: '\x1b[35m'
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function formatar(cor, nivel, modulo, mensagem) {
  return `${CORES.cinza}[${timestamp()}]${CORES.reset} ${cor}${nivel.padEnd(5)}${CORES.reset} ${CORES.magenta}[${modulo}]${CORES.reset} ${mensagem}`;
}

const logger = {
  info: (modulo, mensagem) => console.log(formatar(CORES.azul, 'INFO', modulo, mensagem)),
  sucesso: (modulo, mensagem) => console.log(formatar(CORES.verde, 'OK', modulo, mensagem)),
  aviso: (modulo, mensagem) => console.warn(formatar(CORES.amarelo, 'WARN', modulo, mensagem)),
  erro: (modulo, mensagem) => console.error(formatar(CORES.vermelho, 'ERRO', modulo, mensagem)),
  http: (modulo, mensagem) => console.log(formatar(CORES.ciano, 'HTTP', modulo, mensagem))
};

function middlewareRequisicoes(req, res, next) {
  const inicio = Date.now();
  res.on('finish', () => {
    const duracao = Date.now() - inicio;
    const usuario = req.session && req.session.usuario ? req.session.usuario.email : 'anonimo';
    logger.http('HTTP', `${req.method} ${req.originalUrl} -> ${res.statusCode} (${duracao}ms) usuario=${usuario}`);
  });
  next();
}

module.exports = { logger, middlewareRequisicoes };
