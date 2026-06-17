const pool = require('../db/pool');

async function obtenerPorEmbarazo(embarazoId) {
  const { rows } = await pool.query(
    'SELECT * FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
    [embarazoId]
  );
  return rows[0] || null;
}

async function insertar(data) {
  const campos = Object.keys(data);
  const valores = campos.map((field) => data[field]);
  const placeholders = valores.map((_, index) => `$${index + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO fichas_riesgo_obstetrico (${campos.join(', ')})
     VALUES (${placeholders})
     RETURNING *, tiene_riesgo`,
    valores
  );

  return rows[0];
}

async function actualizarPorEmbarazo({ embarazoId, data, campos, updatedBy = null }) {
  const sets = campos.map((field, index) => `${field}=$${index + 2}`).join(', ');
  const valores = [embarazoId, ...campos.map((field) => data[field]), updatedBy];

  const { rows } = await pool.query(
    `UPDATE fichas_riesgo_obstetrico SET
       ${sets}, updated_at=NOW(), updated_by=$${valores.length}
     WHERE embarazo_id=$1
     RETURNING *, tiene_riesgo`,
    valores
  );

  return rows[0] || null;
}

async function eliminarPorEmbarazo(embarazoId) {
  const { rows, rowCount } = await pool.query(
    'DELETE FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1 RETURNING *',
    [embarazoId]
  );

  return { ficha: rows[0] || null, rowCount };
}

module.exports = {
  obtenerPorEmbarazo,
  insertar,
  actualizarPorEmbarazo,
  eliminarPorEmbarazo,
};
