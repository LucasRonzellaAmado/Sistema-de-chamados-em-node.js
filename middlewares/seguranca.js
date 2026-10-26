const config = require('../config');
const { logger } = require('./logger');

// Cabecalhos HTTP de seguranca (equivalente ao que o helmet faria).
// A CSP so permite scripts do proprio site: nada de script inline nem onclick.
function cabecalhosSeguranca(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://cdnjs.cloudflare.com",
    "font-src 'self' https://cdnjs.cloudflare.com",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (config.isProducao) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// Paginas autenticadas nao devem ficar no cache do navegador (botao "voltar" apos logout)
function semCache(req, res, next) {
  if (req.session && req.session.usuario) res.setHeader('Cache-Control', 'no-store');
  next();
}

// Limite de tentativas de login falhas (em memoria): 5 por IP+e-mail e 30 por IP,
// para frear tanto o ataque a uma conta quanto a varredura de varias contas.
const MAX_FALHAS = 5;
const MAX_FALHAS_IP = 30;
const JANELA_MS = 15 * 60 * 1000;
const falhas = new Map();

function chavesLogin(req) {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  return [`ip:${req.ip}`, `conta:${req.ip}|${email}`];
}

function limparExpirados(agora) {
  for (const [chave, info] of falhas) {
    if (agora - info.inicio > JANELA_MS) falhas.delete(chave);
  }
}

function loginBloqueado(req) {
  const agora = Date.now();
  limparExpirados(agora);
  return chavesLogin(req).some(chave => {
    const info = falhas.get(chave);
    return info && info.total >= (chave.startsWith('ip:') ? MAX_FALHAS_IP : MAX_FALHAS);
  });
}

function registrarFalhaLogin(req) {
  const agora = Date.now();
  chavesLogin(req).forEach(chave => {
    const info = falhas.get(chave) || { total: 0, inicio: agora };
    info.total += 1;
    falhas.set(chave, info);
    if (info.total === (chave.startsWith('ip:') ? MAX_FALHAS_IP : MAX_FALHAS)) logger.aviso('LOGIN', `Bloqueio temporario de login para ${chave}`);
  });
}

function limparFalhasLogin(req) {
  falhas.delete(chavesLogin(req)[1]);
}

module.exports = {
  cabecalhosSeguranca,
  semCache,
  loginBloqueado,
  registrarFalhaLogin,
  limparFalhasLogin,
  MAX_FALHAS
};
