const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Migración completada exitosamente');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
