const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { diagnosticCode } = require('../utils/safeErrorLog');

async function migrateBiViews() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '005_vistas_bi.sql'),
    'utf8'
  );

  try {
    await pool.query(sql);
    console.log('Vistas BI creadas/actualizadas correctamente');
  } catch (error) {
    console.error('Error creando vistas BI:', diagnosticCode(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateBiViews();
