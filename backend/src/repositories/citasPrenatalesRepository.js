const pool = require('../db/pool');

function fechaIso(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

async function crearProgramadaDesdeControl({
  embarazoId,
  controlOrigenId,
  fechaProgramada,
  usuarioId,
}, db = pool) {
  const params = [embarazoId, controlOrigenId, fechaProgramada, usuarioId];
  const { rows = [] } = await db.query(
    `INSERT INTO citas_prenatales (
       embarazo_id, control_origen_id, fecha_programada, estado,
       registrado_por, updated_by
     ) VALUES ($1, $2, $3, 'programada', $4, $4)
     ON CONFLICT (control_origen_id) WHERE reprogramada_desde_id IS NULL DO NOTHING
     RETURNING *`,
    params
  );
  if (rows[0]) return rows[0];

  const existing = await db.query(
     `SELECT *
     FROM citas_prenatales
     WHERE control_origen_id = $1
       AND reprogramada_desde_id IS NULL`,
    [controlOrigenId]
  );
  const cita = existing.rows?.[0];
  const coincide = cita
    && String(cita.embarazo_id) === String(embarazoId)
    && fechaIso(cita.fecha_programada) === fechaIso(fechaProgramada);
  if (!coincide) {
    const error = new Error('El control de origen ya tiene una cita incompatible');
    error.code = 'CITA_ORIGEN_CONFLICT';
    throw error;
  }
  return cita;
}

async function listarProgramadasVigentesPorEmbarazo(
  embarazoId,
  db = pool,
  { bloquear = false } = {}
) {
  const { rows = [] } = await db.query(
    `SELECT *
     FROM citas_prenatales
     WHERE embarazo_id = $1
       AND estado = 'programada'
       AND control_cumplimiento_id IS NULL
     ORDER BY created_at ASC, id ASC${bloquear ? '\n     FOR UPDATE' : ''}`,
    [embarazoId]
  );
  return rows;
}

async function obtenerPorIdYEmbarazo(id, embarazoId, db = pool, { bloquear = false } = {}) {
  const { rows = [] } = await db.query(
    `SELECT *
     FROM citas_prenatales
     WHERE id = $1 AND embarazo_id = $2${bloquear ? '\n     FOR UPDATE' : ''}`,
    [id, embarazoId]
  );
  return rows[0] || null;
}

async function listarCalendarioPorRango({ desde, hasta }, db = pool) {
  const { rows = [] } = await db.query(
    `SELECT
       cp.id::text AS id,
       TO_CHAR(cp.fecha_programada, 'YYYY-MM-DD') AS date,
       cp.estado AS status,
       p.id AS patient_id,
       cp.embarazo_id AS pregnancy_id,
       TRIM(CONCAT_WS(' ', p.nombres, p.apellidos)) AS patient_name,
       NULLIF(BTRIM(COALESCE(com.nombre, p.comunidad, '')), '') AS community,
       TO_CHAR(hija.fecha_programada, 'YYYY-MM-DD') AS rescheduled_to,
       (
         cp.estado = 'programada'
         AND cp.control_cumplimiento_id IS NULL
         AND e.estado IN ('activo', 'puerperio')
       ) AS editable
     FROM citas_prenatales cp
     JOIN embarazos e
       ON e.id = cp.embarazo_id
     JOIN pacientes p
       ON p.id = e.paciente_id
     LEFT JOIN comunidades com
       ON com.id = p.comunidad_id
     LEFT JOIN citas_prenatales hija
       ON hija.reprogramada_desde_id = cp.id
      AND hija.embarazo_id = cp.embarazo_id
     WHERE cp.fecha_programada BETWEEN $1::date AND $2::date
     ORDER BY
       cp.fecha_programada ASC,
       LOWER(p.apellidos) ASC,
       LOWER(p.nombres) ASC,
       cp.id ASC`,
    [desde, hasta]
  );
  return rows;
}

async function obtenerOriginadaPorControl(
  { controlId, embarazoId },
  db = pool,
  { bloquear = false } = {}
) {
  const { rows = [] } = await db.query(
    `SELECT *
     FROM citas_prenatales
     WHERE control_origen_id = $1
       AND embarazo_id = $2
       AND reprogramada_desde_id IS NULL
     ORDER BY id ASC
     LIMIT 1${bloquear ? '\n     FOR UPDATE' : ''}`,
    [controlId, embarazoId]
  );
  return rows[0] || null;
}

async function obtenerUltimaPorControl(
  { controlId, embarazoId },
  db = pool,
  { bloquear = false } = {}
) {
  const { rows = [] } = await db.query(
    `SELECT *
     FROM citas_prenatales
     WHERE control_origen_id = $1
       AND embarazo_id = $2
     ORDER BY created_at DESC, id DESC
     LIMIT 1${bloquear ? '\n     FOR UPDATE' : ''}`,
    [controlId, embarazoId]
  );
  return rows[0] || null;
}

async function marcarAtendida({ citaId, embarazoId, controlCumplimientoId, usuarioId }, db = pool) {
  const { rows = [] } = await db.query(
    `UPDATE citas_prenatales
     SET estado = 'atendida',
         control_cumplimiento_id = $3,
         updated_by = $4,
         updated_at = NOW()
     WHERE id = $1
       AND embarazo_id = $2
       AND estado = 'programada'
       AND control_cumplimiento_id IS NULL
     RETURNING *`,
    [citaId, embarazoId, controlCumplimientoId, usuarioId]
  );
  return rows[0] || null;
}

async function marcarReprogramada({ citaId, embarazoId, usuarioId }, db = pool) {
  const { rows = [] } = await db.query(
    `UPDATE citas_prenatales
     SET estado = 'reprogramada',
         updated_by = $3,
         updated_at = NOW()
     WHERE id = $1
       AND embarazo_id = $2
       AND estado = 'programada'
       AND control_cumplimiento_id IS NULL
     RETURNING *`,
    [citaId, embarazoId, usuarioId]
  );
  return rows[0] || null;
}

async function crearHijaReprogramada({ citaAnterior, fechaProgramada, usuarioId }, db = pool) {
  const { rows = [] } = await db.query(
    `INSERT INTO citas_prenatales (
       embarazo_id, control_origen_id, fecha_programada, estado,
       reprogramada_desde_id, registrado_por, updated_by
     ) VALUES ($1, $2, $3, 'programada', $4, $5, $5)
     RETURNING *`,
    [
      citaAnterior.embarazo_id,
      citaAnterior.control_origen_id,
      fechaProgramada,
      citaAnterior.id,
      usuarioId,
    ]
  );
  return rows[0] || null;
}

async function marcarCancelada({ citaId, embarazoId, usuarioId }, db = pool) {
  const { rows = [] } = await db.query(
    `UPDATE citas_prenatales
     SET estado = 'cancelada',
         updated_by = $3,
         updated_at = NOW()
     WHERE id = $1
       AND embarazo_id = $2
       AND estado = 'programada'
       AND control_cumplimiento_id IS NULL
     RETURNING *`,
    [citaId, embarazoId, usuarioId]
  );
  return rows[0] || null;
}

async function existeRelacionConControl({ controlId, embarazoId }, db = pool) {
  const { rows = [] } = await db.query(
    `SELECT EXISTS (
       SELECT 1
       FROM citas_prenatales
       WHERE embarazo_id = $2
         AND (control_origen_id = $1 OR control_cumplimiento_id = $1)
     ) AS existe`,
    [controlId, embarazoId]
  );
  return rows[0]?.existe === true;
}

async function enTransaccion(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  crearHijaReprogramada,
  crearProgramadaDesdeControl,
  enTransaccion,
  existeRelacionConControl,
  listarCalendarioPorRango,
  listarProgramadasVigentesPorEmbarazo,
  marcarAtendida,
  marcarCancelada,
  marcarReprogramada,
  obtenerOriginadaPorControl,
  obtenerUltimaPorControl,
  obtenerPorIdYEmbarazo,
};
