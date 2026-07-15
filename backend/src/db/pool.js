const { Pool } = require('pg');
const {
  loadEnvironmentFile,
  nodeEnvForValidation,
  validateDatabaseConfig,
} = require('../config/env');

let activePool = null;

function getPool() {
  if (activePool) return activePool;

  loadEnvironmentFile();
  const nodeEnv = nodeEnvForValidation(process.env);
  const dbConfig = validateDatabaseConfig(process.env, { nodeEnv });
  activePool = new Pool(dbConfig);

  activePool.on('connect', () => {
    if (nodeEnv !== 'test') console.log('Conectado a PostgreSQL');
  });
  activePool.on('error', (error) => {
    console.error('Error en pool de PostgreSQL:', error.message);
  });

  return activePool;
}

module.exports = {
  query(...args) {
    return getPool().query(...args);
  },
  connect(...args) {
    return getPool().connect(...args);
  },
  async end() {
    if (!activePool) return;
    const pool = activePool;
    activePool = null;
    await pool.end();
  },
};
