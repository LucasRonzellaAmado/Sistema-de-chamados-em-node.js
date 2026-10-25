// Valores aceitos pelo sistema. Devem bater com os <option> das views.
const STATUS_VALIDOS = ['aberto', 'em_andamento', 'aguardando_cliente', 'resolvido', 'fechado'];
const PRIORIDADES_VALIDAS = ['baixa', 'media', 'alta', 'urgente'];

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAMANHO_MINIMO_SENHA = 8;

// Retorna a mensagem de erro, ou null se os dados forem validos
function validarCadastro({ nome, email, senha }) {
  if (!nome || nome.trim().length < 3) return 'Informe seu nome completo.';
  if (!email || !REGEX_EMAIL.test(email)) return 'Informe um e-mail valido.';
  if (!senha || senha.length < TAMANHO_MINIMO_SENHA) {
    return `A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }
  return null;
}

module.exports = {
  STATUS_VALIDOS,
  PRIORIDADES_VALIDAS,
  TAMANHO_MINIMO_SENHA,
  validarCadastro
};
