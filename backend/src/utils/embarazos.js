const pool = require('../db/pool');

async function obtenerEmbarazoActivoId(pacienteId) {
  const { rows } = await pool.query(
    `SELECT id
     FROM embarazos
     WHERE paciente_id = $1 AND estado = 'activo'
     ORDER BY numero_embarazo DESC
     LIMIT 1`,
    [pacienteId]
  );

  if (rows[0]) return rows[0].id;

  const creado = await pool.query(
    `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur, fpp, fecha_inicio)
     SELECT id, 1, 'activo', fur, fpp, COALESCE(fur, CURRENT_DATE)
     FROM pacientes
     WHERE id = $1
     RETURNING id`,
    [pacienteId]
  );

  return creado.rows[0]?.id || null;
}

module.exports = { obtenerEmbarazoActivoId };
