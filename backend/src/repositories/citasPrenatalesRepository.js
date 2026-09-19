const pool = require('../db/pool');

function seguimientoPendienteSql(citaAlias = 'cp', embarazoAlias = 'e') {
  return `(
    ${citaAlias}.estado = 'inasistente'
    AND ${embarazoAlias}.estado IN ('activo', 'puerperio')
    AND NOT EXISTS (
      SELECT 1 FROM citas_prenatales hija_seguimiento
      WHERE hija_seguimiento.seguimiento_inasistencia_desde_id = ${citaAlias}.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM controles_prenatales control_posterior
      WHERE control_posterior.embarazo_id = ${citaAlias}.embarazo_id
        AND control_posterior.fecha > ${citaAlias}.fecha_programada
    )
  )`;
}

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
     ON CONFLICT (control_origen_id) WHERE reprogramada_desde_id IS NULL
       AND seguimiento_inasistencia_desde_id IS NULL DO NOTHING
     RETURNING *`,
    params
  );
  if (rows[0]) return rows[0];

  const existing = await db.query(
     `SELECT *
     FROM citas_prenatales
     WHERE control_origen_id = $1
       AND reprogramada_desde_id IS NULL
       AND seguimiento_inasistencia_desde_id IS NULL`,
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
       CASE WHEN cp.estado = 'inasistente'
         THEN TO_CHAR(seguimiento.fecha_programada, 'YYYY-MM-DD')
         ELSE NULL
       END AS follow_up_date,
       ${seguimientoPendienteSql()} AS follow_up_pending,
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
    LEFT JOIN citas_prenatales seguimiento
      ON seguimiento.seguimiento_inasistencia_desde_id = cp.id
     AND seguimiento.embarazo_id = cp.embarazo_id
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

async function listarSinProximaCita(db = pool) {
  const { rows = [] } = await db.query(
    `SELECT
       p.id AS paciente_id,
       e.id AS embarazo_id,
       TRIM(CONCAT_WS(' ', p.nombres, p.apellidos)) AS paciente_nombre,
       NULLIF(BTRIM(COALESCE(com.nombre, p.comunidad, '')), '') AS comunidad,
       TO_CHAR(ultimo_control.fecha, 'YYYY-MM-DD') AS ultimo_control_fecha,
       ultimo_control.id AS ultimo_control_id,
       CASE
         WHEN ultima_cita.estado = 'cancelada' THEN 'cita_cancelada'
         WHEN ultimo_control.cita_siguiente IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM citas_prenatales cita_control
             WHERE cita_control.embarazo_id = e.id
               AND cita_control.control_origen_id = ultimo_control.id
           ) THEN 'ultimo_control_sin_cita'
         ELSE 'sin_cita_previa'
       END AS motivo
     FROM embarazos e
     JOIN pacientes p ON p.id = e.paciente_id
     LEFT JOIN comunidades com ON com.id = p.comunidad_id
     JOIN LATERAL (
       SELECT c.id, c.fecha, c.numero_control, c.cita_siguiente
       FROM controles_prenatales c
       WHERE c.embarazo_id = e.id
       ORDER BY c.numero_control DESC, c.fecha DESC, c.id DESC
       LIMIT 1
     ) ultimo_control ON TRUE
     LEFT JOIN LATERAL (
       SELECT cp.estado
       FROM citas_prenatales cp
       WHERE cp.embarazo_id = e.id
       ORDER BY cp.created_at DESC, cp.id DESC
       LIMIT 1
     ) ultima_cita ON TRUE
     WHERE e.estado = 'activo'
       AND NOT EXISTS (
         SELECT 1
         FROM citas_prenatales vigente
         WHERE vigente.embarazo_id = e.id
           AND vigente.estado = 'programada'
           AND vigente.control_cumplimiento_id IS NULL
       )
     ORDER BY ultimo_control.fecha ASC, LOWER(p.apellidos) ASC, LOWER(p.nombres) ASC, e.id ASC`
  );
  return rows;
}

async function obtenerUltimoControlElegible(
  embarazoId,
  db = pool,
  { bloquear = false } = {}
) {
  const { rows = [] } = await db.query(
    `SELECT *
     FROM controles_prenatales
     WHERE embarazo_id = $1
     ORDER BY numero_control DESC, fecha DESC, id DESC
     LIMIT 1${bloquear ? '\n     FOR UPDATE' : ''}`,
    [embarazoId]
  );
  return rows[0] || null;
}

async function crearProgramadaComoContinuacion({
  citaAnterior,
  fechaProgramada,
  usuarioId,
}, db = pool) {
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

async function crearSeguimientoDeInasistencia({ citaAnterior, fechaProgramada, usuarioId }, db = pool) {
  const { rows = [] } = await db.query(
    `INSERT INTO citas_prenatales (
       embarazo_id, control_origen_id, fecha_programada, estado,
       seguimiento_inasistencia_desde_id, registrado_por, updated_by
     )
     SELECT $1, $2, $3, 'programada', $4, $5, $5
     WHERE $3::date > $6::date
     RETURNING *`,
    [
      citaAnterior.embarazo_id,
      citaAnterior.control_origen_id,
      fechaProgramada,
      citaAnterior.id,
      usuarioId,
      citaAnterior.fecha_programada,
    ]
  );
  return rows[0] || null;
}

async function adquirirBloqueoMaterializacion(db = pool) {
  const { rows = [] } = await db.query(
    `SELECT pg_try_advisory_xact_lock(701202601)::boolean AS adquirido`
  );
  return rows[0]?.adquirido === true;
}

async function listarProgramadasVencidas({ fechaOperativa, embarazoId = null }, db = pool) {
  const { rows = [] } = await db.query(
    `SELECT *
     FROM citas_prenatales
     WHERE estado = 'programada'
       AND control_cumplimiento_id IS NULL
       AND fecha_programada < $1::date
       AND ($2::integer IS NULL OR embarazo_id = $2)
     ORDER BY fecha_programada ASC, id ASC
     FOR UPDATE`,
    [fechaOperativa, embarazoId]
  );
  return rows;
}

async function listarControlesCoincidentes(cita, db = pool) {
  const { rows = [] } = await db.query(
    `SELECT c.*
     FROM controles_prenatales c
     WHERE c.embarazo_id = $1
       AND c.fecha = $2::date
     ORDER BY c.id ASC
     FOR UPDATE`,
    [cita.embarazo_id, cita.fecha_programada]
  );
  return rows;
}

async function marcarInasistente({ citaId, embarazoId, usuarioId = null }, db = pool) {
  const { rows = [] } = await db.query(
    `UPDATE citas_prenatales
     SET estado = 'inasistente', updated_by = COALESCE($3, updated_by), updated_at = NOW()
     WHERE id = $1 AND embarazo_id = $2
       AND estado = 'programada' AND control_cumplimiento_id IS NULL
     RETURNING *`,
    [citaId, embarazoId, usuarioId]
  );
  return rows[0] || null;
}

async function reconciliarAsistenciaTardia({ citaId, embarazoId, controlCumplimientoId, usuarioId }, db = pool) {
  const { rows = [] } = await db.query(
    `UPDATE citas_prenatales
     SET estado = 'atendida', control_cumplimiento_id = $3,
         updated_by = $4, updated_at = NOW()
     WHERE id = $1 AND embarazo_id = $2
       AND estado = 'inasistente' AND control_cumplimiento_id IS NULL
     RETURNING *`,
    [citaId, embarazoId, controlCumplimientoId, usuarioId]
  );
  return rows[0] || null;
}

async function existeSeguimientoDerivado(citaId, db = pool) {
  const { rows = [] } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM citas_prenatales
       WHERE seguimiento_inasistencia_desde_id = $1
     ) AS existe`,
    [citaId]
  );
  return rows[0]?.existe === true;
}

async function obtenerInasistentePorFecha({ embarazoId, fecha }, db = pool, { bloquear = false } = {}) {
  const { rows = [] } = await db.query(
    `SELECT * FROM citas_prenatales
     WHERE embarazo_id = $1 AND fecha_programada = $2::date AND estado = 'inasistente'
     ORDER BY id ASC
     LIMIT 2${bloquear ? '\n     FOR UPDATE' : ''}`,
    [embarazoId, fecha]
  );
  return rows;
}

async function listarInasistenciasConSeguimiento(embarazoId, db = pool) {
  const { rows = [] } = await db.query(
    `SELECT cp.*,
       ${seguimientoPendienteSql()} AS seguimiento_pendiente
     FROM citas_prenatales cp
     JOIN embarazos e ON e.id = cp.embarazo_id
     WHERE cp.embarazo_id = $1 AND cp.estado = 'inasistente'
     ORDER BY cp.fecha_programada DESC, cp.id DESC`,
    [embarazoId]
  );
  return rows;
}

async function obtenerEstadoSeguimientoInasistencia(citaId, embarazoId, db = pool) {
  const { rows = [] } = await db.query(
    `SELECT ${seguimientoPendienteSql()} AS seguimiento_pendiente,
       TO_CHAR(seguimiento.fecha_programada, 'YYYY-MM-DD') AS fecha_seguimiento
     FROM citas_prenatales cp
     JOIN embarazos e ON e.id = cp.embarazo_id
     LEFT JOIN citas_prenatales seguimiento
       ON seguimiento.seguimiento_inasistencia_desde_id = cp.id
      AND seguimiento.embarazo_id = cp.embarazo_id
     WHERE cp.id = $1 AND cp.embarazo_id = $2`,
    [citaId, embarazoId]
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
  adquirirBloqueoMaterializacion,
  crearHijaReprogramada,
  crearSeguimientoDeInasistencia,
  crearProgramadaComoContinuacion,
  crearProgramadaDesdeControl,
  enTransaccion,
  existeRelacionConControl,
  existeSeguimientoDerivado,
  listarCalendarioPorRango,
  listarControlesCoincidentes,
  listarInasistenciasConSeguimiento,
  listarSinProximaCita,
  listarProgramadasVencidas,
  listarProgramadasVigentesPorEmbarazo,
  marcarAtendida,
  marcarCancelada,
  marcarInasistente,
  marcarReprogramada,
  seguimientoPendienteSql,
  obtenerInasistentePorFecha,
  obtenerEstadoSeguimientoInasistencia,
  obtenerOriginadaPorControl,
  obtenerUltimoControlElegible,
  obtenerUltimaPorControl,
  obtenerPorIdYEmbarazo,
  reconciliarAsistenciaTardia,
};
