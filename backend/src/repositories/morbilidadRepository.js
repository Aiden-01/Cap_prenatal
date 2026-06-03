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

async function obtenerPorIdYEmbarazo(id, embarazoId) {
  const { rows } = await pool.query(
    'SELECT * FROM morbilidad_embarazo WHERE id = $1 AND embarazo_id = $2',
    [id, embarazoId]
  );
  return rows[0] || null;
}

async function insertar(data) {
  const campos = Object.keys(data);
  const valores = campos.map((field) => data[field]);
  const placeholders = valores.map((_, index) => `$${index + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO morbilidad_embarazo (${campos.join(', ')})
     VALUES (${placeholders})
     RETURNING *`,
    valores
  );
  return rows[0];
}

async function actualizar({ id, embarazoId, data, campos }) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(id, embarazoId);

  const { rows, rowCount } = await pool.query(
    `UPDATE morbilidad_embarazo SET ${sets}, updated_at = NOW()
     WHERE id = $${valores.length - 1} AND embarazo_id = $${valores.length}
     RETURNING *`,
    valores
  );

  return { registro: rows[0] || null, rowCount };
}

async function eliminar({ id, embarazoId }) {
  const { rows, rowCount } = await pool.query(
    'DELETE FROM morbilidad_embarazo WHERE id = $1 AND embarazo_id = $2 RETURNING *',
    [id, embarazoId]
  );
  return { registro: rows[0] || null, rowCount };
}

module.exports = {
  listarPorEmbarazo,
  obtenerPorIdYEmbarazo,
  insertar,
  actualizar,
  eliminar,
};
