const pool = require('../db/pool');
const { HttpError } = require('./httpError');

const ESTADOS_EDITABLES = ['activo', 'puerperio'];

function requerirEmbarazoId(embarazoId) {
  if (!embarazoId) {
    throw new HttpError(400, 'embarazo_id es obligatorio', {
      code: 'EMBARAZO_ID_REQUIRED',
    });
  }
  return embarazoId;
}

async function obtenerEmbarazoDePaciente({ pacienteId, embarazoId }) {
  if (!embarazoId) return null;
  if (!/^\d+$/.test(String(embarazoId))) {
    throw new HttpError(400, 'embarazo_id invalido', { code: 'INVALID_PREGNANCY_ID' });
  }
  const { rows } = await pool.query(
    'SELECT * FROM embarazos WHERE id = $1 AND paciente_id = $2',
    [embarazoId, pacienteId]
  );
  return rows[0] || null;
}

async function resolverEmbarazoParaLectura({ pacienteId, embarazoId = null }) {
  if (embarazoId) {
    const embarazo = await obtenerEmbarazoDePaciente({ pacienteId, embarazoId });
    if (!embarazo) {
      throw new HttpError(404, 'Embarazo no encontrado para esta paciente', {
        code: 'PREGNANCY_NOT_FOUND',
      });
    }
    return embarazo;
  }

  const { rows } = await pool.query(
    `SELECT * FROM embarazos
     WHERE paciente_id = $1
     ORDER BY
       CASE estado WHEN 'activo' THEN 1 WHEN 'puerperio' THEN 2 ELSE 3 END,
       numero_embarazo DESC
     LIMIT 1`,
    [pacienteId]
  );
  return rows[0] || null;
}

async function validarEmbarazoEditable({
  pacienteId,
  embarazoId,
  estadosPermitidos = ESTADOS_EDITABLES,
}) {
  const embarazo = await obtenerEmbarazoDePaciente({ pacienteId, embarazoId });
  if (!embarazo) {
    throw new HttpError(404, 'Embarazo no encontrado para esta paciente', {
      code: 'PREGNANCY_NOT_FOUND',
    });
  }
  if (!estadosPermitidos.includes(embarazo.estado)) {
    throw new HttpError(409, 'El embarazo esta cerrado y su expediente es de solo lectura', {
      code: 'PREGNANCY_READ_ONLY',
    });
  }
  return embarazo;
}

async function obtenerEmbarazoActivoId(pacienteId) {
  const { rows } = await pool.query(
    `SELECT id
     FROM embarazos
     WHERE paciente_id = $1 AND estado = 'activo'
     ORDER BY numero_embarazo DESC
     LIMIT 1`,
    [pacienteId]
  );

  return rows[0]?.id || null;
}

async function obtenerEmbarazoActivoRequeridoId(pacienteId) {
  const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
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

  return rows[0]?.id || null;
}

module.exports = {
  ESTADOS_EDITABLES,
  requerirEmbarazoId,
  obtenerEmbarazoDePaciente,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
  obtenerEmbarazoActivoId,
  obtenerEmbarazoActivoRequeridoId,
  obtenerEmbarazoSeguimientoId,
  obtenerEmbarazoVisibleId,
};
