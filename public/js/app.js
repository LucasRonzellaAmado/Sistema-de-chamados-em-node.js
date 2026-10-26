// Comportamentos gerais da interface. Nada de JS inline nas views (a CSP bloqueia).

// Linhas de tabela clicaveis
document.querySelectorAll('[data-href]').forEach(el => {
  el.addEventListener('click', (e) => {
    if (e.target.closest('a, button, input, select')) return;
    window.location = el.dataset.href;
  });
});

// Selects que enviam o formulario ao mudar
document.querySelectorAll('select[data-autosubmit]').forEach(sel => {
  sel.addEventListener('change', () => sel.form.submit());
});

// Confirmacao antes de enviar formularios sensiveis
document.querySelectorAll('form[data-confirmar]').forEach(form => {
  form.addEventListener('submit', (e) => {
    if (!window.confirm(form.dataset.confirmar)) e.preventDefault();
  });
});

// Menu lateral no celular
const botaoMenu = document.querySelector('[data-abrir-menu]');
if (botaoMenu) {
  botaoMenu.addEventListener('click', () => document.body.classList.toggle('menu-aberto'));
}

// Caixa de resposta: abas (resposta / nota privada / solucao) e comandos digitados
const formResposta = document.querySelector('[data-form-resposta]');
if (formResposta) {
  const campoTipo = formResposta.querySelector('input[name="tipo"]');
  const textarea = formResposta.querySelector('textarea');
  const abas = formResposta.querySelectorAll('[data-tipo]');
  const aviso = formResposta.querySelector('[data-aviso-comando]');
  const botao = formResposta.querySelector('button[type="submit"]');

  const TEXTOS = {
    acompanhamento: { botao: 'Enviar resposta', placeholder: 'Escreva uma resposta para o cliente...' },
    nota: { botao: 'Salvar nota privada', placeholder: 'Nota visível somente para a equipe. O cliente não verá.' },
    solucao: { botao: 'Registrar solução', placeholder: 'Descreva a solução. O chamado ficará como Resolvido até o cliente aprovar.' }
  };
  const COMANDOS = { '/nota': 'nota', '/privado': 'nota', '/interno': 'nota', '/solucao': 'solucao', '/solução': 'solucao' };

  function aplicarTipo(tipo) {
    campoTipo.value = tipo;
    formResposta.dataset.modo = tipo;
    abas.forEach(a => a.classList.toggle('ativo', a.dataset.tipo === tipo));
    botao.querySelector('span').textContent = TEXTOS[tipo].botao;
    textarea.placeholder = TEXTOS[tipo].placeholder;
  }

  abas.forEach(a => a.addEventListener('click', () => { aplicarTipo(a.dataset.tipo); textarea.focus(); }));

  textarea.addEventListener('input', () => {
    if (!aviso) return;
    const m = textarea.value.match(/^\s*(\/\S+)/);
    const tipo = m && COMANDOS[m[1].toLowerCase()];
    aviso.hidden = !tipo;
    if (tipo) {
      aviso.textContent = tipo === 'nota'
        ? 'Comando detectado: esta mensagem será salva como NOTA PRIVADA (o cliente não verá).'
        : 'Comando detectado: esta mensagem será registrada como SOLUÇÃO.';
      aviso.className = 'aviso-comando aviso-' + tipo;
    }
  });

  aplicarTipo(campoTipo.value || 'acompanhamento');
}
