const path = require('path');

const isProducao = process.env.NODE_ENV === 'production';

if (isProducao && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET nao definido. Configure no .env antes de subir em producao.');
}

module.exports = {
  porta: process.env.PORTA || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret',
  isProducao,
  uploadsDir: path.join(__dirname, 'uploads'),
  dbPath: process.env.DB_PATH || path.join(__dirname, 'db', 'chamados.db')
};
