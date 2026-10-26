# 🎫 Help Desk Ticket Panel (Painel de Chamados)

<p align="center">
  A complete IT service desk for opening, tracking and solving support tickets, inspired by how <a href="https://glpi-project.org/">GLPI</a> works.
</p>

<p align="center">
  Built with Node.js, Express, SQLite and EJS. No external database server required.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22.5%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Express.js-Backend-000000?style=for-the-badge&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/EJS-Templates-8A2BE2?style=for-the-badge" />
</p>

---

## 📋 About

**Painel de Chamados** is a help desk system created as a college project. Requesters (clients) open tickets, and the whole IT team works on them together: anyone on the team can see every ticket, reply, assign it, follow it, and talk privately with colleagues through **private notes** the client never sees.

The workflow borrows the main ideas of GLPI:

| GLPI concept | In this project |
|---|---|
| Requester | **Client** (`cliente`): opens tickets and only sees their own |
| Technician | **Technician** (`agente`): sees and works on **every** ticket |
| Super-Admin | **Administrator** (`admin`): same permissions as a technician (ready for future admin-only pages via `exigirAdmin`) |
| Assigned to | **Responsible** (`responsavel`): one technician owning the ticket |
| Watcher | **Observers**: technicians following a ticket |
| Followup | **Reply** visible to the client |
| Private followup / task | **Private note**: visible only to the team |
| Solution + approval | **Solution**: ticket becomes *Resolved*; the client approves (closes) or refuses (reopens) |
| Ticket views | **Views**: All, Assigned to me, My sector, Unassigned, Following |

The database is a local SQLite file, created automatically on first run.

---

## ✨ Features

### 👥 Shared team workspace
- Every technician and admin sees **all tickets**, regardless of sector, and can help on any of them.
- Ticket list with status counters, team **views** (all / assigned to me / my sector / unassigned / following) and **search** by protocol or subject.
- **Take** a ticket, or **assign** it to any team member (people from the ticket's sector are listed first).
- **Follow / unfollow** a ticket as an observer.
- **Transfer** a ticket to another sector (with a reason, saved in the history).
- Change **status** and **priority**.
- Time metrics: time until the ticket was taken and total open time.

### 🔒 Private team conversation (commands)
Inside a ticket, a team member can choose the reply type using the tabs above the text box, **or type a command at the start of the message**:

| Command | Effect |
|---|---|
| `/nota <text>` | Saves a **private note**. Only the team sees it. |
| `/privado <text>` | Same as `/nota` |
| `/interno <text>` | Same as `/nota` |
| `/solucao <text>` | Registers the **solution** and marks the ticket as *Resolved* |

Example:

```
/nota Davi, I think this is the same switch issue from last week (port 12).
```

- The command itself is removed; only the text is stored.
- The page shows a warning while you type a command, so you know the message will be private.
- Private notes are shown with a yellow dashed style and a 🔒 "Nota privada" tag.
- **Files attached to a private note are private too**: the client can neither see nor download them.
- Commands only work for the team. If a client types `/nota ...`, it is posted as a normal public message (clients can't hide anything from the team).

### ✅ Solution approval (GLPI style)
1. A technician posts a solution (`/solucao ...` or the *Solução* tab). The ticket becomes **Resolved**.
2. The client sees a banner asking whether the problem was solved:
   - **Approve** → ticket is **Closed**.
   - **Refuse** (with an optional comment) → ticket goes back to **In progress**.
3. Only the client who opened the ticket can approve or refuse.
4. Closed tickets no longer accept replies.

### 🎫 Tickets
- Automatic protocol (`CH-000123`).
- Sector, predefined subjects per sector (or a custom subject), priority and description.
- Up to 5 attachments per message (PDF, PNG, JPG, TXT, DOCX, XLSX; 15 MB each).
- Full history of every action (creation, assignment, status, priority, transfer, solution, observers).

### 🎨 Interface
- Modern layout with a sidebar, sticky top bar with search, status counter cards, color-coded badges and chat-style conversation.
- Different colors for client replies, team replies, private notes and solutions.
- Responsive: on phones the sidebar becomes a slide-in menu.

---

## 🛡️ Security

| Protection | How |
|---|---|
| Password hashing | bcrypt (cost 12 for new accounts) |
| CSRF | `csrf-sync` token on every form (synchronizer token pattern) |
| Session fixation | Session ID is regenerated on login |
| Session cookie | `httpOnly`, `sameSite=lax`, `secure` in production, custom name (`sid`), 8h lifetime |
| Brute force | Login is blocked for 15 min after 5 failures per IP+e-mail (30 per IP) |
| User enumeration | Same error message and similar response time for unknown e-mails |
| Deactivated users | User is reloaded from the DB on every request, so a deactivated account or role change takes effect immediately |
| Security headers | Content-Security-Policy (no inline scripts), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production; `X-Powered-By` removed |
| Authorization | Central rule (`podeAcessarChamado`): team sees all, clients only their own tickets; team-only routes protected by `exigirTI` |
| Private data | Private notes and their attachments are filtered on the server, not just hidden in the HTML |
| Uploads | Extension allow-list, random file names on disk, size/count limits, files served only through an authorized download route (never as static files) with a sandbox CSP |
| Input validation | Allowed values for status/priority, length limits for every text field, body size limit |
| XSS | EJS escapes all output (`<%= %>`); JSON embedded in pages is escaped |
| SQL injection | Only prepared statements with parameters |
| Caching | `Cache-Control: no-store` on authenticated pages |
| Secrets | `SESSION_SECRET` is mandatory in production; test users are only listed on the login page outside production |

> ⚠️ The seed creates demo users with the password `123456`. Change or remove them before using the system for real.

---

## 🚀 Getting started

### Requirements
- **Node.js 22.5+** (uses the built-in `node:sqlite` module)

### Install and run

```bash
npm install
```

```bash
npm run seed
```

```bash
npm start
```

Open <http://localhost:3000>.

On Linux/macOS you can also run `./setup.sh`, which does all three steps.

### Environment variables (`.env`)

Copy `.env.example` to `.env`:

| Variable | Description | Default |
|---|---|---|
| `PORTA` | HTTP port | `3000` |
| `NODE_ENV` | `production` enables secure cookies, HSTS and requires `SESSION_SECRET` | `development` |
| `SESSION_SECRET` | Secret used to sign the session cookie | dev-only value |
| `DB_PATH` | Path of the SQLite file | `db/chamados.db` |

Generate a strong secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

When running behind a reverse proxy with HTTPS in production, the app trusts the first proxy (`trust proxy = 1`) so secure cookies work.

### Demo users (password `123456`)

| E-mail | Role | Sector |
|---|---|---|
| admin@empresa.com | Administrator | — |
| davi@empresa.com | Technician | Suporte |
| phenrir@empresa.com | Technician | Infraestrutura |
| financeiro@empresa.com | Technician | Financeiro |
| lucas@empresa.com | Technician | Desenvolvimento |
| cliente@empresa.com | Client | — |

New sign-ups through `/cadastro` are always created as **clients**.

---

## 🧪 Tests

```bash
npm test
```

The suite uses Node's built-in test runner. Each test file starts the app on a free port with a temporary database and covers:

- `autorizacao.test.js`: who can see and act on each ticket
- `colaboracao.test.js`: shared team access, private notes and commands, hidden private attachments, observers, assignment, solution approval/refusal, security headers, session regeneration, login lockout, deactivated users
- `anexos.test.js`: upload allow-list, random file names, authorized downloads
- `csrf.test.js`: CSRF protection on forms
- `validacao.test.js`: input validation

---

## 🗂️ Project structure

```
├── server.js              # Express app: middlewares, routes, error handling
├── config.js              # Settings read from environment variables
├── db/
│   ├── database.js        # SQLite connection, tables and simple migrations
│   └── seed.js            # Default sectors, subjects and demo users
├── middlewares/
│   ├── auth.js            # Login, roles and ticket access rules
│   ├── csrf.js            # CSRF token
│   ├── seguranca.js       # Security headers and login rate limiting
│   └── logger.js          # Colored request/event logs
├── routes/
│   ├── auth.js            # Login, logout, sign-up
│   └── chamados.js        # Tickets, replies, notes, solution, assignment, attachments
├── utils/validacao.js     # Allowed values, limits, reply command parser
├── views/                 # EJS templates (login, sign-up, list, detail, new ticket, error)
├── public/
│   ├── css/estilo.css     # Styles
│   └── js/                # app.js (UI behavior), novo-chamado.js (subject picker)
└── tests/                 # Automated tests
```

### Database tables

| Table | Purpose |
|---|---|
| `setores` | Sectors (Suporte, Infraestrutura, Financeiro, Desenvolvimento) |
| `usuarios` | Users with role (`cliente`, `agente`, `admin`) and sector |
| `assuntos_predefinidos` | Predefined subjects per sector |
| `chamados` | Tickets |
| `mensagens` | Replies; `tipo` is `acompanhamento` (public), `nota` (private) or `solucao` |
| `anexos` | Attachments, linked to the ticket and optionally to a message |
| `historico` | Audit trail of every action |
| `chamado_observadores` | Technicians following a ticket |

Existing databases are migrated automatically on startup (new columns/tables are added).

---

## 🔁 Ticket lifecycle

```
Aberto ──take/assign──▶ Em andamento ◀──────────────┐
   │                        │   ▲                   │ client refuses
   │                        ▼   │ client replies    │
   │               Aguardando cliente               │
   │                        │                       │
   └────────────── /solucao ▼ ──────────────▶ Resolvido ──client approves──▶ Fechado
```

Technicians can also set any status manually from the ticket sidebar.

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
