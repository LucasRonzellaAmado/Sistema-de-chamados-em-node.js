const TODOS_ASSUNTOS = JSON.parse(document.getElementById('dados-assuntos').textContent);
const seletorSetor = document.getElementById('setor_id');
const seletorAssunto = document.getElementById('assunto_predefinido');
const campoCustomizado = document.getElementById('campo-assunto-customizado');
const inputCustomizado = document.getElementById('titulo_customizado');

seletorSetor.addEventListener('change', () => {
  const setorId = seletorSetor.value;
  const assuntosDoSetor = TODOS_ASSUNTOS.filter(a => String(a.setor_id) === String(setorId));

  seletorAssunto.innerHTML = '<option value="">Selecione um assunto...</option>';
  assuntosDoSetor.forEach(a => {
    const opcao = document.createElement('option');
    opcao.value = a.titulo;
    opcao.textContent = a.titulo;
    seletorAssunto.appendChild(opcao);
  });

  const opcaoOutro = document.createElement('option');
  opcaoOutro.value = 'outro';
  opcaoOutro.textContent = 'Outro assunto (descrever abaixo)';
  seletorAssunto.appendChild(opcaoOutro);

  campoCustomizado.hidden = true;
});

seletorAssunto.addEventListener('change', () => {
  const outro = seletorAssunto.value === 'outro';
  campoCustomizado.hidden = !outro;
  inputCustomizado.required = outro;
});
