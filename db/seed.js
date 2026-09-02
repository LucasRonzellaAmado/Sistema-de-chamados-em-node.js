const db = require('./database');
const bcrypt = require('bcryptjs');
const { logger } = require('../middlewares/logger');

const totalSetores = db.prepare('SELECT COUNT(*) as total FROM setores').get().total;

if (totalSetores === 0) {
  const inserirSetor = db.prepare('INSERT INTO setores (nome, descricao) VALUES (?, ?)');
  const setoresPadrao = [
    ['Suporte', 'Duvidas gerais, problemas de sistema e atendimento ao usuario'],
    ['Infraestrutura', 'Redes, servidores, internet, hardware e acessos'],
    ['Financeiro', 'Cobrancas, notas fiscais, reembolsos e pagamentos'],
    ['Desenvolvimento', 'Bugs, melhorias e solicitacoes de novas funcionalidades']
  ];
  setoresPadrao.forEach(([nome, descricao]) => inserirSetor.run(nome, descricao));
  logger.sucesso('SEED', 'Setores criados.');
}

const setores = db.prepare('SELECT id, nome FROM setores').all();
const idSetor = (nome) => setores.find(s => s.nome === nome).id;

const totalAssuntos = db.prepare('SELECT COUNT(*) as total FROM assuntos_predefinidos').get().total;

if (totalAssuntos === 0) {
  const inserirAssunto = db.prepare('INSERT INTO assuntos_predefinidos (setor_id, titulo) VALUES (?, ?)');

  const assuntosPorSetor = {
    'Suporte': [
      'Computador nao liga',
      'Sistema travando ou lento',
      'Erro ao fazer login',
      'Duvida sobre uso do sistema',
      'Instalacao de programa'
    ],
    'Infraestrutura': [
      'Internet fora do ar',
      'Solicitacao de acesso a rede/VPN',
      'Problema com impressora',
      'Configuracao de e-mail corporativo',
      'Solicitacao de novo equipamento'
    ],
    'Financeiro': [
      'Solicitacao de nota fiscal',
      'Duvida sobre cobranca',
      'Solicitacao de reembolso',
      'Atualizacao de dados de pagamento',
      'Cancelamento de servico/contrato'
    ],
    'Desenvolvimento': [
      'Relato de bug/erro no sistema',
      'Solicitacao de nova funcionalidade',
      'Integracao com outro sistema (API)',
      'Melhoria de performance',
      'Duvida tecnica sobre o produto'
    ]
  };

  Object.entries(assuntosPorSetor).forEach(([setor, assuntos]) => {
    assuntos.forEach(titulo => inserirAssunto.run(idSetor(setor), titulo));
  });
  logger.sucesso('SEED', 'Assuntos pre-prontos criados.');
}

const totalUsuarios = db.prepare('SELECT COUNT(*) as total FROM usuarios').get().total;

if (totalUsuarios === 0) {
  const inserirUsuario = db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, tipo, setor_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  const senhaPadrao = bcrypt.hashSync('123456', 10);

  inserirUsuario.run('Administrador', 'admin@empresa.com', senhaPadrao, 'admin', null);
  inserirUsuario.run('Agente Suporte', 'davi@empresa.com', senhaPadrao, 'agente', idSetor('Suporte'));
  inserirUsuario.run('Agente Infra', 'phenrir@empresa.com', senhaPadrao, 'agente', idSetor('Infraestrutura'));
  inserirUsuario.run('Agente Financeiro', 'financeiro@empresa.com', senhaPadrao, 'agente', idSetor('Financeiro'));
  inserirUsuario.run('Agente Dev', 'lucas@empresa.com', senhaPadrao, 'agente', idSetor('Desenvolvimento'));
  inserirUsuario.run('Cliente Exemplo', 'cliente@empresa.com', senhaPadrao, 'cliente', null);

  logger.sucesso('SEED', 'Usuarios padrao criados. Senha de todos: 123456');
}

logger.sucesso('SEED', 'Seed finalizado com sucesso.');
