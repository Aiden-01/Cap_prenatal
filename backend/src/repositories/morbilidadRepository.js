const pool = require('../db/pool');

async function listarPorEmbarazo(embarazoId) {
  const { rows } = await pool.query(
    `SELECT * FROM morbilidad_embarazo
     WHERE embarazo_id = $1
     ORDER BY fecha DESC`,
    [embarazoId]
  );
  return rows;
}

async function obtenerPorIdYEmbarazo(id, embarazoId, db = pool) {
  const { rows } = await db.query(
    'SELECT * FROM morbilidad_embarazo WHERE id = $1 AND embarazo_id = $2',
    [id, embarazoId]
  );
  return rows[0] || null;
}

async function obtenerPorId(id, db = pool) {
  const { rows } = await db.query('SELECT * FROM morbilidad_embarazo WHERE id = $1', [id]);
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
     INSERT INTO morbilidad_embarazo (${campos.join(', ')})
     SELECT ${placeholders} FROM embarazo_editable
     RETURNING *`,
    valores
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

  const { rows, rowCount } = await db.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos
       WHERE id = $${valores.length - 1} AND paciente_id = $${valores.length}
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     UPDATE morbilidad_embarazo SET ${sets}, updated_at = NOW(), updated_by = $${valores.length - 3}
     WHERE id = $${valores.length - 2} AND embarazo_id = $${valores.length - 1}
       AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    valores
  );

  return { registro: rows[0] || null, rowCount };
}

async function eliminar({ id, embarazoId, pacienteId }, db = pool) {
  const { rows, rowCount } = await db.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos WHERE id = $2 AND paciente_id = $3
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     DELETE FROM morbilidad_embarazo
     WHERE id = $1 AND embarazo_id = $2 AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    [id, embarazoId, pacienteId]
  );
  return { registro: rows[0] || null, rowCount };
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
  insertar,
  actualizar,
  eliminar,
  enTransaccion,
};
