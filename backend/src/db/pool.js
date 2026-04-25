const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cap_prenatal',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ Conectado a PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('❌ Error en pool de PostgreSQL:', err.message);
});

module.exports = pool;
