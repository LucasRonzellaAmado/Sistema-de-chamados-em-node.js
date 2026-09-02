# Painel de Chamados (Help Desk) — Node.js

Sistema completo de abertura e gestão de chamados de TI, feito em **Node.js + Express + SQLite + EJS**.
Sem dependências externas de banco de dados (nada de instalar MySQL/Postgres) — tudo roda com um único comando.

## Funcionalidades

- **Login e cadastro** com senha criptografada (bcrypt) e sessão persistente
- **3 tipos de usuário**: `cliente`, `agente` (TI) e `admin`
- **4 setores prontos**: Suporte, Infraestrutura, Financeiro e Desenvolvimento (fácil de adicionar mais)
- **Assuntos pré-prontos** por setor, para agilizar a abertura do chamado (com opção "Outro assunto")
- Abertura de chamado com **descrição livre + anexos/documentação** (prints, PDFs etc.)
- **Protocolo automático** (ex: `CH-000123`)
- **Prioridade** (baixa, média, alta, urgente) e **status** (aberto, em andamento, aguardando cliente, resolvido, fechado)
- **Conversa dentro do chamado** (respostas do cliente e da TI), com suporte a **notas internas** (visíveis só para a equipe de TI)
- **Transferência entre setores**, com motivo registrado
- **Assumir chamado** (define o agente responsável)
- **Histórico completo** de tudo que aconteceu no chamado (criação, transferências, mudanças de status/prioridade, atribuição)
- Filtro de chamados por status
- Interface inspirada no GLPI: sidebar de navegação, ícones (Font Awesome), tabelas densas
- Logs coloridos no terminal para cada evento importante (login, chamado aberto, transferência, mudança de status etc.)

## ️ Estrutura do projeto

```
painel-chamados/
├── server.js              # ponto de entrada do Express
├── setup.sh                # instala e inicia tudo automaticamente
├── package.json
├── .env                     # variáveis de ambiente (porta, segredo da sessão)
├── db/
│   ├── database.js          # conexão SQLite + criação das tabelas
│   ├── seed.js               # popula setores, assuntos e usuários padrão
│   └── chamados.db           # criado automaticamente na primeira execução
├── middlewares/
│   └── auth.js               # login obrigatório, permissões de TI/admin
├── routes/
│   ├── auth.js                # login, logout, cadastro
│   └── chamados.js            # abrir, listar, responder, transferir, status...
├── views/                    # páginas EJS (login, lista, novo, detalhe...)
├── public/
│   ├── css/estilo.css
│   └── js/novo-chamado.js
└── uploads/                  # anexos enviados nos chamados
```

## Como rodar

### Opção 1 — Automático (recomendado)

```bash
chmod +x setup.sh
./setup.sh
```

O script vai: verificar o Node.js, instalar as dependências, criar/popular o banco de dados e iniciar o servidor.

### Opção 2 — Manual

```bash
npm install
npm run seed     # cria o banco e os dados iniciais (só precisa rodar uma vez)
npm start
```

Depois acesse: **http://localhost:3000**

> Requisito: Node.js 18 ou superior instalado ([nodejs.org](https://nodejs.org/)).

## Usuários de teste (criados pelo seed)

Todos usam a senha **`123456`**.

| E-mail                     | Perfil                     |
|-----------------------------|-----------------------------|
| admin@empresa.com           | Administrador (vê tudo)     |
| suporte@empresa.com         | Agente — Suporte            |
| infra@empresa.com           | Agente — Infraestrutura     |
| financeiro@empresa.com      | Agente — Financeiro         |
| dev@empresa.com             | Agente — Desenvolvimento    |
| cliente@empresa.com         | Cliente                     |

Novos clientes também podem se cadastrar sozinhos pela tela `/cadastro`.

## Regras de permissão

- **Cliente**: só enxerga os próprios chamados; não vê notas internas; não pode transferir, mudar status/prioridade nem assumir chamado.
- **Agente**: enxerga os chamados do **seu setor**; pode responder, assumir, transferir, mudar status/prioridade e escrever notas internas.
- **Admin**: enxerga e gerencia **todos** os chamados, de todos os setores.

## Como adicionar um novo setor ou assunto pré-pronto

Edite `db/seed.js` e adicione o setor/assunto nas listas `setoresPadrao` / `assuntosPorSetor`, apague o arquivo `db/chamados.db` e rode `npm run seed` novamente. Ou, mais simples: insira diretamente no banco usando as tabelas `setores` e `assuntos_predefinidos`.

## Tecnologias usadas

- **Express** — servidor web e rotas
- **node:sqlite** (módulo nativo do Node.js 22.5+) — banco de dados em arquivo local, sem precisar compilar nada nem instalar Visual Studio/build tools
- **EJS** — templates das páginas (renderizadas no servidor)
- **bcryptjs** — criptografia de senha
- **express-session** — sessão de login (guardada em memória; reiniciar o servidor exige login novamente)
- **multer** — upload de anexos/documentação
- **Font Awesome** (via CDN) — ícones da interface
- Logger próprio (`middlewares/logger.js`) — imprime no terminal cada evento relevante (login, logout, chamado aberto, resposta enviada, transferência, mudança de status/prioridade, requisições HTTP) com data/hora e cores

> ️ Requer **Node.js 22.5 ou superior** (o projeto foi testado no Node 24). Rode `node -v` para conferir a sua versão.

## ️ Possíveis melhorias futuras

- Notificações por e-mail quando o chamado muda de status
- Dashboard com gráficos (chamados por setor, tempo médio de resolução)
- SLA por prioridade
- Avaliação de satisfação ao fechar o chamado
- API REST separada + front-end em React/Next.js
