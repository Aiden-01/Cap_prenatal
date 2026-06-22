const pool = require('../db/pool');

async function listarPorEmbarazo(embarazoId) {
  const { rows } = await pool.query(
    'SELECT * FROM controles_puerperio WHERE embarazo_id = $1 ORDER BY numero_atencion',
    [embarazoId]
  );
  return rows;
}

async function obtenerPorIdYEmbarazo(id, embarazoId) {
  const { rows } = await pool.query(
    'SELECT * FROM controles_puerperio WHERE id = $1 AND embarazo_id = $2',
    [id, embarazoId]
  );
  return rows[0] || null;
}

async function obtenerPorId(id) {
  const { rows } = await pool.query('SELECT * FROM controles_puerperio WHERE id = $1', [id]);
  return rows[0] || null;
}

async function obtenerPorNumeroYEmbarazo(embarazoId, numeroAtencion, db = pool) {
  const { rows } = await db.query(
    'SELECT * FROM controles_puerperio WHERE embarazo_id = $1 AND numero_atencion = $2',
    [embarazoId, numeroAtencion]
  );
  return rows[0] || null;
}

async function obtenerEmbarazoParaActualizar({ embarazoId, pacienteId }, db = pool) {
  const { rows } = await db.query(
    `SELECT * FROM embarazos
     WHERE id = $1 AND paciente_id = $2
     FOR UPDATE`,
    [embarazoId, pacienteId]
  );
  return rows[0] || null;
}

async function marcarEmbarazoEnPuerperio({ embarazoId, pacienteId, fechaCierre, updatedBy = null }, db = pool) {
  const { rows } = await db.query(
    `UPDATE embarazos
     SET estado = 'puerperio',
         fecha_cierre = COALESCE(fecha_cierre, $2),
         updated_at = NOW(),
         updated_by = $3
     WHERE id = $1 AND paciente_id = $4 AND estado = 'activo'
     RETURNING *`,
    [embarazoId, fechaCierre, updatedBy, pacienteId]
  );
  return rows[0] || null;
}

async function upsert({ data, updateFields }, db = pool) {
  const campos = Object.keys(data);
  const valores = campos.map((field) => data[field]);
  const placeholders = valores.map((_, index) => `$${index + 1}`).join(', ');
  const updateSet = updateFields
    .map((field) => `${field} = EXCLUDED.${field}`)
    .join(',\n        ');
  const pacienteParam = campos.indexOf('paciente_id') + 1;
  const embarazoParam = campos.indexOf('embarazo_id') + 1;

  const { rows } = await db.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos
       WHERE id=$${embarazoParam} AND paciente_id=$${pacienteParam}
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     INSERT INTO controles_puerperio (${campos.join(', ')})
     SELECT ${placeholders} FROM embarazo_editable
     ON CONFLICT (embarazo_id, numero_atencion) DO UPDATE SET
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
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function actualizar({ id, embarazoId, pacienteId, data, campos, updatedBy = null }) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(updatedBy, id, embarazoId, pacienteId);

  const { rows } = await pool.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos
       WHERE id = $${valores.length - 1} AND paciente_id = $${valores.length}
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     UPDATE controles_puerperio SET ${sets}, updated_at = NOW(), updated_by = $${valores.length - 3}
     WHERE id = $${valores.length - 2} AND embarazo_id = $${valores.length - 1}
       AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    valores
  );

  return rows[0] || null;
}

async function eliminar({ id, embarazoId, pacienteId }) {
  const { rows, rowCount } = await pool.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos WHERE id = $2 AND paciente_id = $3
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     DELETE FROM controles_puerperio
     WHERE id = $1 AND embarazo_id = $2 AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    [id, embarazoId, pacienteId]
  );

  return { control: rows[0] || null, rowCount };
}

module.exports = {
  listarPorEmbarazo,
  obtenerPorIdYEmbarazo,
  obtenerPorId,
  obtenerPorNumeroYEmbarazo,
  obtenerEmbarazoParaActualizar,
  marcarEmbarazoEnPuerperio,
  upsert,
  enTransaccion,
  actualizar,
  eliminar,
};
