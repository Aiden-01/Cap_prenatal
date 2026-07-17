const pool = require('../db/pool');

async function obtenerPorEmbarazo(embarazoId, db = pool) {
  const { rows } = await db.query(
    'SELECT * FROM planes_parto WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
    [embarazoId]
  );
  return rows[0] || null;
}

async function actualizar(
  { id, embarazoId, pacienteId, data, campos, updatedBy = null },
  db = pool
) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(updatedBy, id, embarazoId, pacienteId);

  const { rows } = await db.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos
       WHERE id=$${valores.length - 1} AND paciente_id=$${valores.length}
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     UPDATE planes_parto SET ${sets}, updated_at = NOW(), updated_by = $${valores.length - 3}
     WHERE id = $${valores.length - 2} AND embarazo_id=$${valores.length - 1}
       AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    valores
  );

  return rows[0] || null;
}

async function insertar(data, db = pool) {
  const campos = Object.keys(data);
  const valores = campos.map((field) => data[field]);
  const placeholders = valores.map((_, index) => `$${index + 1}`).join(', ');
  const pacienteParam = campos.indexOf('paciente_id') + 1;
  const embarazoParam = campos.indexOf('embarazo_id') + 1;

  const { rows } = await db.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos
       WHERE id=$${embarazoParam} AND paciente_id=$${pacienteParam}
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     INSERT INTO planes_parto (${campos.join(', ')})
     SELECT ${placeholders} FROM embarazo_editable
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
  obtenerPorEmbarazo,
  actualizar,
  insertar,
  enTransaccion,
};
