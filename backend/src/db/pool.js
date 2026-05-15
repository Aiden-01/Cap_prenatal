const { Pool } = require('pg');
require('dotenv').config();

const useSsl = process.env.DB_SSL === 'true';
const ssl = useSsl ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' } : false;

const dbConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl,
} : {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cap_prenatal',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl,
};

const pool = new Pool(dbConfig);

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ Conectado a PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('❌ Error en pool de PostgreSQL:', err.message);
});

module.exports = pool;
