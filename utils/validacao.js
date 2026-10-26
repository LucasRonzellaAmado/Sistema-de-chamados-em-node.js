// Valores aceitos pelo sistema. Devem bater com os <option> das views.
const STATUS_VALIDOS = ['aberto', 'em_andamento', 'aguardando_cliente', 'resolvido', 'fechado'];
const PRIORIDADES_VALIDAS = ['baixa', 'media', 'alta', 'urgente'];

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAMANHO_MINIMO_SENHA = 8;

// Limites de tamanho dos textos livres
const LIMITES = {
  nome: 100,
  email: 254,
  senha: 128,
  titulo: 150,
  descricao: 10000,
  mensagem: 10000,
  motivo: 500
};

function normalizarEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Retorna a mensagem de erro, ou null se os dados forem validos
function validarCadastro({ nome, email, senha }) {
  if (!nome || nome.trim().length < 3) return 'Informe seu nome completo.';
  if (nome.length > LIMITES.nome) return `O nome deve ter no maximo ${LIMITES.nome} caracteres.`;
  if (!email || email.length > LIMITES.email || !REGEX_EMAIL.test(email)) return 'Informe um e-mail valido.';
  if (!senha || senha.length < TAMANHO_MINIMO_SENHA) {
    return `A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }
  if (senha.length > LIMITES.senha) return `A senha deve ter no maximo ${LIMITES.senha} caracteres.`;
  return null;
}

// Comandos aceitos no inicio de uma resposta (somente equipe):
//   /nota texto     -> nota privada (o cliente nao ve)
//   /privado texto  -> mesmo que /nota
//   /interno texto  -> mesmo que /nota
//   /solucao texto  -> registra a solucao e marca o chamado como resolvido
const COMANDOS = {
  '/nota': 'nota',
  '/privado': 'nota',
  '/interno': 'nota',
  '/solucao': 'solucao',
  '/solução': 'solucao'
};

// Interpreta o texto digitado. Retorna { tipo, texto }.
function interpretarComando(texto) {
  const limpo = String(texto || '').trim();
  const m = limpo.match(/^(\/\S+)\s*([\s\S]*)$/);
  if (m && COMANDOS[m[1].toLowerCase()]) {
    return { tipo: COMANDOS[m[1].toLowerCase()], texto: m[2].trim() };
  }
  return { tipo: 'acompanhamento', texto: limpo };
}

module.exports = {
  STATUS_VALIDOS,
  PRIORIDADES_VALIDAS,
  TAMANHO_MINIMO_SENHA,
  LIMITES,
  COMANDOS,
  normalizarEmail,
  validarCadastro,
  interpretarComando
};
