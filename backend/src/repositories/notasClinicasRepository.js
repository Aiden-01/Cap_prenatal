const pool = require('../db/pool');
const { diagnosticCode } = require('../utils/safeErrorLog');

// Campos internos de idempotencia solo aparecen en la consulta específica, nunca en respuestas generales.
const COLUMNAS_METADATA = `n.id, n.paciente_id, n.embarazo_id, n.control_prenatal_id, n.tipo,
  to_char(n.fecha_atencion, 'YYYY-MM-DD') AS fecha_atencion, n.hora_atencion::text AS hora_atencion,
  n.estado, n.es_principal, n.responsable_usuario_id, n.responsable_snapshot,
  n.capturista_usuario_id, n.finalizador_usuario_id, n.created_at, n.updated_at, n.finalizada_at, n.version`;
const COLUMNAS_DETALLE = `${COLUMNAS_METADATA}, n.contenido`;

async function enTransaccion(callback) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await callback(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    try { await db.query('ROLLBACK'); }
    catch (rollbackError) { console.warn('[notas] No se pudo revertir la transacción:', diagnosticCode(rollbackError)); }
    throw error;
  } finally { db.release(); }
}

async function obtenerPorId(id, db = pool, { bloquear = false } = {}) {
  const { rows } = await db.query(`SELECT ${COLUMNAS_DETALLE} FROM notas_clinicas n
    WHERE n.id = $1${bloquear ? ' FOR UPDATE OF n' : ''}`, [id]);
  return rows[0] || null;
}

async function obtenerPorClaveIdempotencia(capturistaId, clave, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUMNAS_DETALLE}, n.clave_idempotencia, n.solicitud_hash
    FROM notas_clinicas n WHERE n.capturista_usuario_id = $1 AND n.clave_idempotencia = $2`, [capturistaId, clave]);
  return rows[0] || null;
}

async function crear(data, db = pool) {
  const { rows } = await db.query(`INSERT INTO notas_clinicas AS n
    (paciente_id, embarazo_id, control_prenatal_id, tipo, fecha_atencion, hora_atencion, contenido,
      es_principal, responsable_usuario_id, responsable_snapshot, capturista_usuario_id, clave_idempotencia, solicitud_hash)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
    ON CONFLICT (capturista_usuario_id, clave_idempotencia) DO NOTHING RETURNING ${COLUMNAS_DETALLE}`,
  [data.paciente_id, data.embarazo_id ?? null, data.control_prenatal_id ?? null, data.tipo,
    data.fecha_atencion ?? null, data.hora_atencion ?? null, data.contenido ?? '', data.es_principal ?? false,
    data.responsable_usuario_id ?? null, JSON.stringify(data.responsable_snapshot), data.capturista_usuario_id,
    data.clave_idempotencia, data.solicitud_hash]);
  return rows[0] || null;
}

async function actualizarBorrador({ id, version, ...data }, db = pool) {
  const campos = ['fecha_atencion', 'hora_atencion', 'contenido', 'responsable_usuario_id', 'responsable_snapshot'];
  const params = [id, version];
  const sets = campos.map(campo => {
    const presente = Object.hasOwn(data, campo);
    params.push(presente, presente && campo === 'responsable_snapshot' ? JSON.stringify(data[campo]) : data[campo] ?? null);
    return `${campo} = CASE WHEN $${params.length - 1}::boolean THEN $${params.length} ELSE n.${campo} END`;
  });
  const { rows } = await db.query(`UPDATE notas_clinicas AS n SET ${sets.join(', ')}, version = n.version + 1
    WHERE n.id = $1 AND n.version = $2 AND n.estado = 'borrador' RETURNING ${COLUMNAS_DETALLE}`, params);
  return rows[0] || null;
}

async function finalizarCaptura({ id, version, finalizadorUsuarioId }, db = pool) {
  const { rows } = await db.query(`UPDATE notas_clinicas AS n
    SET estado = 'captura_finalizada', finalizador_usuario_id = $3,
      finalizada_at = clock_timestamp(), version = n.version + 1
    WHERE n.id = $1 AND n.version = $2 AND n.estado = 'borrador' RETURNING ${COLUMNAS_DETALLE}`,
  [id, version, finalizadorUsuarioId]);
  return rows[0] || null;
}

async function listarPorPaciente({ pacienteId, tipos = [], embarazoId, controlPrenatalId, estado, pagina = 1, limite = 20 }, db = pool) {
  const { rows } = await db.query(`WITH elegibles AS (
      SELECT ${COLUMNAS_METADATA} FROM notas_clinicas n WHERE n.paciente_id = $1 AND n.tipo = ANY($2::text[])
        AND ($3::integer IS NULL OR n.embarazo_id = $3)
        AND ($4::integer IS NULL OR n.control_prenatal_id = $4)
        AND ($5::text IS NULL OR n.estado = $5)
    ), pagina AS (
      SELECT * FROM elegibles ORDER BY fecha_atencion DESC NULLS LAST, id DESC LIMIT $6 OFFSET $7
    ) SELECT (SELECT count(*)::integer FROM elegibles) AS total,
      COALESCE((SELECT json_agg(pagina ORDER BY fecha_atencion DESC NULLS LAST, id DESC) FROM pagina), '[]'::json) AS data`,
  [pacienteId, tipos, embarazoId ?? null, controlPrenatalId ?? null, estado ?? null, limite, (pagina - 1) * limite]);
  return { data: rows[0].data, total: rows[0].total, pagina, limite };
}

async function obtenerPaciente(id, db = pool, { bloquear = true } = {}) {
  const { rows } = await db.query(`SELECT id FROM pacientes WHERE id = $1${bloquear ? ' FOR SHARE' : ''}`, [id]);
  return rows[0] || null;
}

async function obtenerEmbarazo(id, db = pool, { bloquear = true } = {}) {
  const { rows } = await db.query(`SELECT id, paciente_id, estado FROM embarazos WHERE id = $1${bloquear ? ' FOR SHARE' : ''}`, [id]);
  return rows[0] || null;
}

async function obtenerControl(id, db = pool, { bloquear = false } = {}) {
  const { rows } = await db.query(`SELECT id, paciente_id, embarazo_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, hora::text AS hora
    FROM controles_prenatales WHERE id = $1${bloquear ? ' FOR SHARE' : ''}`, [id]);
  return rows[0] || null;
}

module.exports = {
  enTransaccion,
  obtenerPorId,
  obtenerPorClaveIdempotencia,
  crear,
  actualizarBorrador,
  finalizarCaptura,
  listarPorPaciente,
  obtenerPaciente,
  obtenerEmbarazo,
  obtenerControl,
};
