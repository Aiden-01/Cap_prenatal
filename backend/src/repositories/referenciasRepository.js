const pool = require('../db/pool');

async function listarPorPaciente(pacienteId) {
  const { rows } = await pool.query(
    `SELECT * FROM referencias_efectuadas
     WHERE paciente_id = $1
     ORDER BY fecha DESC`,
    [pacienteId]
  );
  return rows;
}

async function obtenerPorIdYPaciente(id, pacienteId, db = pool) {
  const { rows } = await db.query(
    'SELECT * FROM referencias_efectuadas WHERE id = $1 AND paciente_id = $2',
    [id, pacienteId]
  );
  return rows[0] || null;
}

async function insertar(data, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO referencias_efectuadas (
      paciente_id, fecha, lugar_referencia, diagnostico, registrado_por, updated_by
    ) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *`,
    [
      data.paciente_id,
      data.fecha,
      data.lugar_referencia,
      data.diagnostico,
      data.registrado_por,
      data.updated_by,
    ]
  );
  return rows[0];
}

async function actualizar({ id, pacienteId, data, campos, updatedBy = null }, db = pool) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(updatedBy, id, pacienteId);

  const { rows, rowCount } = await db.query(
    `UPDATE referencias_efectuadas SET ${sets}, updated_at = NOW(), updated_by = $${valores.length - 2}
     WHERE id = $${valores.length - 1} AND paciente_id = $${valores.length}
     RETURNING *`,
    valores
  );
  return { referencia: rows[0] || null, rowCount };
}

async function eliminar({ id, pacienteId }, db = pool) {
  const { rows, rowCount } = await db.query(
    'DELETE FROM referencias_efectuadas WHERE id = $1 AND paciente_id = $2 RETURNING *',
    [id, pacienteId]
  );
  return { referencia: rows[0] || null, rowCount };
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

module.exports = {
  listarPorPaciente,
  obtenerPorIdYPaciente,
  insertar,
  actualizar,
  eliminar,
  enTransaccion,
};
