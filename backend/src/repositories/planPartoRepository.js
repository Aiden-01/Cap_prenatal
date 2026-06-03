const pool = require('../db/pool');

async function obtenerPorEmbarazo(embarazoId) {
  const { rows } = await pool.query(
    'SELECT * FROM planes_parto WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
    [embarazoId]
  );
  return rows[0] || null;
}

async function actualizar({ id, data, campos }) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(id);

  const { rows } = await pool.query(
    `UPDATE planes_parto SET ${sets}, updated_at = NOW()
     WHERE id = $${valores.length}
     RETURNING *`,
    valores
  );

  return rows[0] || null;
}

async function insertar(data) {
  const campos = Object.keys(data);
  const valores = campos.map((field) => data[field]);
  const placeholders = valores.map((_, index) => `$${index + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO planes_parto (${campos.join(', ')})
     VALUES (${placeholders})
     RETURNING *`,
    valores
  );

  return rows[0];
}

module.exports = {
  obtenerPorEmbarazo,
  actualizar,
  insertar,
};
