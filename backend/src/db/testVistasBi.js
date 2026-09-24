const pool = require('./pool');
const { diagnosticCode } = require('../utils/safeErrorLog');

const queries = [
  {
    title: 'vw_censo_mensual',
    sql: `
      SELECT mes_registro, anio, mes, trimestre_embarazo, total_embarazadas
      FROM vw_censo_mensual
      ORDER BY mes_registro, trimestre_embarazo
    `,
  },
  {
    title: 'vw_cumplimiento_controles_prenatales',
    sql: `
      SELECT
        no_expediente,
        paciente,
        controles_realizados,
        controles_minimos_mspas,
        controles_faltantes,
        cumple_minimo
      FROM vw_cumplimiento_controles_prenatales
      ORDER BY no_expediente
    `,
  },
  {
    title: 'vw_riesgo_obstetrico',
    sql: `
      SELECT nivel_riesgo, total_pacientes
      FROM vw_riesgo_obstetrico
      ORDER BY nivel_riesgo
    `,
  },
];

async function testVistasBi() {
  try {
    for (const query of queries) {
      const { rows } = await pool.query(query.sql);
      console.log(`\n=== ${query.title} ===`);
      console.log(`Filas devueltas: ${rows.length}`);
    }
  } catch (error) {
    console.error('Error consultando vistas BI:', diagnosticCode(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testVistasBi();
