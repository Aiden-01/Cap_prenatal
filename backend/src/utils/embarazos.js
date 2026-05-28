const pool = require('../db/pool');

async function obtenerEmbarazoActivoId(pacienteId, options = {}) {
  const { crearSiNoExiste = false } = options;
  const { rows } = await pool.query(
    `SELECT id
     FROM embarazos
     WHERE paciente_id = $1 AND estado = 'activo'
     ORDER BY numero_embarazo DESC
     LIMIT 1`,
    [pacienteId]
  );

  if (rows[0]) return rows[0].id;
  if (!crearSiNoExiste) return null;

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

async function obtenerEmbarazoActivoRequeridoId(pacienteId) {
  const embarazoId = await obtenerEmbarazoActivoId(pacienteId, { crearSiNoExiste: false });
  if (!embarazoId) {
    const error = new Error('No hay embarazo activo para registrar controles prenatales');
    error.status = 409;
    error.code = 'NO_ACTIVE_PREGNANCY';
    throw error;
  }
  return embarazoId;
}

async function obtenerEmbarazoSeguimientoId(pacienteId) {
  const { rows } = await pool.query(
    `SELECT id
     FROM embarazos
     WHERE paciente_id = $1 AND estado IN ('activo', 'puerperio')
     ORDER BY
       CASE estado
         WHEN 'activo' THEN 1
         WHEN 'puerperio' THEN 2
       END,
       numero_embarazo DESC
     LIMIT 1`,
    [pacienteId]
  );

  return rows[0]?.id || null;
}

async function obtenerEmbarazoVisibleId(pacienteId) {
  const { rows } = await pool.query(
    `SELECT id
     FROM embarazos
     WHERE paciente_id = $1
     ORDER BY
       CASE estado
         WHEN 'activo' THEN 1
         WHEN 'puerperio' THEN 2
         ELSE 3
       END,
       numero_embarazo DESC
     LIMIT 1`,
    [pacienteId]
  );

  if (rows[0]) return rows[0].id;
  return obtenerEmbarazoActivoId(pacienteId, { crearSiNoExiste: true });
}

module.exports = {
  obtenerEmbarazoActivoId,
  obtenerEmbarazoActivoRequeridoId,
  obtenerEmbarazoSeguimientoId,
  obtenerEmbarazoVisibleId,
};
