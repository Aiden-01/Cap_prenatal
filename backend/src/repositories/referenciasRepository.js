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

async function obtenerPorIdYPaciente(id, pacienteId) {
  const { rows } = await pool.query(
    'SELECT * FROM referencias_efectuadas WHERE id = $1 AND paciente_id = $2',
    [id, pacienteId]
  );
  return rows[0] || null;
}

async function insertar(data) {
  const { rows } = await pool.query(
    `INSERT INTO referencias_efectuadas (
      paciente_id, fecha, lugar_referencia, diagnostico, registrado_por
    ) VALUES ($1,$2,$3,$4,$5)
    RETURNING *`,
    [
      data.paciente_id,
      data.fecha,
      data.lugar_referencia,
      data.diagnostico,
      data.registrado_por,
    ]
  );
  return rows[0];
}

async function actualizar({ id, pacienteId, data, campos }) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(id, pacienteId);

  const { rows, rowCount } = await pool.query(
    `UPDATE referencias_efectuadas SET ${sets}, updated_at = NOW()
     WHERE id = $${valores.length - 1} AND paciente_id = $${valores.length}
     RETURNING *`,
    valores
  );
  return { referencia: rows[0] || null, rowCount };
}

async function eliminar({ id, pacienteId }) {
  const { rows, rowCount } = await pool.query(
    'DELETE FROM referencias_efectuadas WHERE id = $1 AND paciente_id = $2 RETURNING *',
    [id, pacienteId]
  );
  return { referencia: rows[0] || null, rowCount };
}

module.exports = {
  listarPorPaciente,
  obtenerPorIdYPaciente,
  insertar,
  actualizar,
  eliminar,
};
