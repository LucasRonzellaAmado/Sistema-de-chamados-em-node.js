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

  campoCustomizado.style.display = 'none';
});

seletorAssunto.addEventListener('change', () => {
  if (seletorAssunto.value === 'outro') {
    campoCustomizado.style.display = 'block';
    inputCustomizado.required = true;
  } else {
    campoCustomizado.style.display = 'none';
    inputCustomizado.required = false;
  }
});
