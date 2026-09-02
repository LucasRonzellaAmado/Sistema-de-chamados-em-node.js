# 🎫 Painel de Chamados (Help Desk)

<p align="center">
  Sistema completo para abertura, gerenciamento e acompanhamento de chamados de TI.
</p>

<p align="center">
  Desenvolvido com Node.js, Express, SQLite e EJS.
</p>

<p align="center">

  <img src="https://img.shields.io/badge/Node.js-22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" />

  <img src="https://img.shields.io/badge/Express.js-Backend-000000?style=for-the-badge&logo=express&logoColor=white" />

  <img src="https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />

  <img src="https://img.shields.io/badge/EJS-Template-8A2BE2?style=for-the-badge" />

</p>

---

## 📋 Sobre o Projeto

O **Painel de Chamados** é um sistema completo de **Help Desk**, desenvolvido para facilitar a abertura, organização e gerenciamento de solicitações de TI.

O sistema possui diferentes níveis de acesso, permitindo que clientes, agentes de TI e administradores tenham permissões específicas dentro da plataforma.

Um dos principais objetivos do projeto é oferecer uma solução simples de executar, sem depender de servidores externos de banco de dados como MySQL ou PostgreSQL.

Todo o sistema utiliza um banco SQLite local, criado automaticamente na primeira execução.

---

## ✨ Funcionalidades

### 🔐 Autenticação

- Login e cadastro de usuários
- Senhas criptografadas com bcrypt
- Sessão persistente
- Controle de permissões por perfil

### 👥 Tipos de Usuário

O sistema possui três níveis de acesso:

| Perfil | Permissões |
|---|---|
| 👤 Cliente | Visualiza e acompanha apenas seus próprios chamados |
| 🛠️ Agente | Gerencia chamados relacionados ao seu setor |
| 👑 Administrador | Gerencia todos os chamados e setores |

### 🎫 Gerenciamento de Chamados

- Abertura de chamados
- Protocolo automático (`CH-000123`)
- Definição de prioridade
- Controle de status
- Transferência entre setores
- Atribuição de responsável
- Histórico completo de atividades
- Conversa entre cliente e equipe de TI
- Notas internas para agentes
- Upload de anexos e documentação

### 🏢 Setores

O sistema possui setores pré-configurados:

- 🛠️ Suporte
- 🖥️ Infraestrutura
- 💰 Financeiro
- 💻 Desenvolvimento

Também é possível adicionar novos setores facilmente.

### 📊 Administração

Administradores possuem acesso completo ao sistema, incluindo:

- Visualização de todos os chamados
- Controle de responsáveis
- Alteração de prioridade
- Alteração de status
- Transferência entre setores
- Acompanhamento do tempo dos chamados

---

## 🖥️ Interface

A interface foi inspirada em sistemas profissionais de Help Desk, como o GLPI.

Principais características:

- Sidebar de navegação
- Interface organizada
- Tabelas para visualização de chamados
- Ícones utilizando Font Awesome
- Filtros por status
- Tela detalhada para acompanhamento do chamado

---

## 📁 Estrutura do Projeto

```text
painel-chamados/
│
├── server.js                 # Ponto de entrada da aplicação
├── setup.sh                  # Script automático de instalação
├── package.json              # Dependências e scripts
├── .env                      # Variáveis de ambiente
│
├── db/
│   ├── database.js           # Conexão SQLite e criação das tabelas
│   ├── seed.js               # Dados iniciais do sistema
│   └── chamados.db           # Banco criado automaticamente
│
├── middlewares/
│   ├── auth.js               # Autenticação e permissões
│   └── logger.js             # Logger de eventos do sistema
│
├── routes/
│   ├── auth.js               # Login, logout e cadastro
│   └── chamados.js           # Gerenciamento dos chamados
│
├── views/                    # Templates EJS
│
├── public/
│   ├── css/
│   │   └── estilo.css
│   │
│   └── js/
│       └── novo-chamado.js
│
└── uploads/                  # Arquivos enviados nos chamados