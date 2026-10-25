const { csrfSync } = require('csrf-sync');

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  // Le o token do campo oculto _csrf dos formularios, ou do header x-csrf-token
  getTokenFromRequest: (req) => (req.body && req.body._csrf) || req.headers['x-csrf-token']
});

// Disponibiliza o token para as views (campo oculto dos formularios)
function disponibilizarTokenCSRF(req, res, next) {
  res.locals.csrfToken = generateToken(req);
  next();
}

// Protege uma rota POST. Em rotas com upload (multipart), deve vir depois do multer.
const csrfProtection = csrfSynchronisedProtection;

module.exports = { csrfProtection, disponibilizarTokenCSRF };
