const pool = require('../db/pool');

async function listarPorEmbarazo(embarazoId) {
  const { rows } = await pool.query(
    `SELECT
       c.*,
       ROW_NUMBER() OVER (ORDER BY c.fecha ASC, c.id ASC) AS numero_control,
       c.fecha AS fecha_control,
       c.edad_gestacional_semanas AS semana_gestacional,
       c.peso_kg AS peso,
       CASE
         WHEN c.pa_sistolica IS NOT NULL OR c.pa_diastolica IS NOT NULL
           THEN CONCAT_WS('/', c.pa_sistolica::text, c.pa_diastolica::text)
         ELSE NULL
       END AS presion_arterial,
       c.fcf AS frecuencia_cardiaca_fetal,
       c.presentacion_fetal AS presentacion,
       c.situacion_fetal AS situacion,
       c.impresion_clinica AS observaciones,
       (
         COALESCE(c.pa_sistolica > 140, FALSE)
         OR COALESCE(c.pa_sistolica < 90, FALSE)
         OR COALESCE(c.pa_diastolica > 90, FALSE)
         OR COALESCE(c.pa_diastolica < 60, FALSE)
         OR COALESCE(c.fcf < 110, FALSE)
         OR COALESCE(c.fcf > 160, FALSE)
         OR COALESCE(c.peligro_hemorragia_vaginal, FALSE)
         OR COALESCE(c.peligro_palidez, FALSE)
         OR COALESCE(c.peligro_dolor_cabeza, FALSE)
         OR COALESCE(c.peligro_hipertension, FALSE)
         OR COALESCE(c.peligro_dolor_epigastrico, FALSE)
         OR COALESCE(c.peligro_trastornos_visuales, FALSE)
         OR COALESCE(c.peligro_fiebre, FALSE)
         OR NULLIF(BTRIM(COALESCE(c.peligro_otro, '')), '') IS NOT NULL
       ) AS tiene_hallazgo
     FROM controles_prenatales c
     WHERE embarazo_id = $1
     ORDER BY c.fecha ASC, c.id ASC`,
    [embarazoId]
  );
  return rows;
}

async function obtenerPorIdYEmbarazo(id, embarazoId, db = pool) {
  const { rows } = await db.query(
    'SELECT * FROM controles_prenatales WHERE id = $1 AND embarazo_id = $2',
    [id, embarazoId]
  );
  return rows[0] || null;
}

async function obtenerPorId(id, db = pool, { bloquear = false } = {}) {
  const { rows } = await db.query(
    `SELECT *
     FROM controles_prenatales
     WHERE id = $1${bloquear ? '\n     FOR UPDATE' : ''}`,
    [id]
  );
  return rows[0] || null;
}

async function existeControlPosterior({
  embarazoId,
  controlId,
  numeroControl,
  fecha,
}, db = pool) {
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1
       FROM controles_prenatales
       WHERE embarazo_id = $1
         AND id <> $2
         AND (
           numero_control > $3
           OR fecha > $4::date
           OR (numero_control = $3 AND fecha = $4::date AND id > $2)
         )
     ) AS existe`,
    [embarazoId, controlId, numeroControl, fecha]
  );
  return rows[0]?.existe === true;
}

async function obtenerPorNumeroYEmbarazo(embarazoId, numeroControl, db = pool) {
  const { rows } = await db.query(
    'SELECT * FROM controles_prenatales WHERE embarazo_id = $1 AND numero_control = $2',
    [embarazoId, numeroControl]
  );
  return rows[0] || null;
}

async function actualizar({ id, embarazoId, pacienteId, data, campos, updatedBy = null }, db = pool) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(updatedBy, id, embarazoId, pacienteId);

  const { rows } = await db.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos
       WHERE id = $${valores.length - 1} AND paciente_id = $${valores.length}
         AND estado = 'activo'
       FOR UPDATE
     )
     UPDATE controles_prenatales SET ${sets}, updated_at = NOW(), updated_by = $${valores.length - 3}
     WHERE id = $${valores.length - 2} AND embarazo_id = $${valores.length - 1}
       AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    valores
  );

  return rows[0] || null;
}

async function eliminar({ id, embarazoId, pacienteId }, db = pool) {
  const { rows, rowCount } = await db.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos WHERE id = $2 AND paciente_id = $3
         AND estado = 'activo' FOR UPDATE
     )
     DELETE FROM controles_prenatales
     WHERE id = $1 AND embarazo_id = $2 AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    [id, embarazoId, pacienteId]
  );

  return { control: rows[0] || null, rowCount };
}

async function upsert({ data, updateFields }, db = pool) {
  const campos = Object.keys(data);
  const placeholders = campos.map((_, index) => `$${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  const updateSet = updateFields
    .map((field) => `${field} = EXCLUDED.${field}`)
    .join(',\n        ');
  const pacienteParam = campos.indexOf('paciente_id') + 1;
  const embarazoParam = campos.indexOf('embarazo_id') + 1;

  const { rows } = await db.query(
    `WITH embarazo_activo AS (
       SELECT id FROM embarazos
       WHERE id=$${embarazoParam} AND paciente_id=$${pacienteParam}
         AND estado = 'activo' FOR UPDATE
     )
     INSERT INTO controles_prenatales (${campos.join(', ')})
     SELECT ${placeholders} FROM embarazo_activo
     ON CONFLICT (embarazo_id, numero_control) DO UPDATE SET
        ${updateSet},
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
     RETURNING *`,
    valores
  );

  return rows[0] || null;
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
  listarPorEmbarazo,
  obtenerPorIdYEmbarazo,
  obtenerPorId,
  obtenerPorNumeroYEmbarazo,
  actualizar,
  eliminar,
  existeControlPosterior,
  upsert,
  enTransaccion,
};
