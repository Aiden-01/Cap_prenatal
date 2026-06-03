const pool = require('../db/pool');

async function listarPorEmbarazo(embarazoId) {
  const { rows } = await pool.query(
    `SELECT * FROM controles_prenatales
     WHERE embarazo_id = $1
     ORDER BY numero_control`,
    [embarazoId]
  );
  return rows;
}

async function obtenerPorIdYEmbarazo(id, embarazoId) {
  const { rows } = await pool.query(
    'SELECT * FROM controles_prenatales WHERE id = $1 AND embarazo_id = $2',
    [id, embarazoId]
  );
  return rows[0] || null;
}

async function obtenerPorNumeroYEmbarazo(embarazoId, numeroControl) {
  const { rows } = await pool.query(
    'SELECT * FROM controles_prenatales WHERE embarazo_id = $1 AND numero_control = $2',
    [embarazoId, numeroControl]
  );
  return rows[0] || null;
}

async function actualizar({ id, embarazoId, data, campos }) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(id, embarazoId);

  const { rows } = await pool.query(
    `UPDATE controles_prenatales SET ${sets}, updated_at = NOW()
     WHERE id = $${valores.length - 1} AND embarazo_id = $${valores.length}
     RETURNING *`,
    valores
  );

  return rows[0] || null;
}

async function eliminar({ id, embarazoId }) {
  const { rows, rowCount } = await pool.query(
    'DELETE FROM controles_prenatales WHERE id = $1 AND embarazo_id = $2 RETURNING *',
    [id, embarazoId]
  );

  return { control: rows[0] || null, rowCount };
}

async function upsert({ data, updateFields }) {
  const campos = Object.keys(data);
  const placeholders = campos.map((_, index) => `$${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  const updateSet = updateFields
    .map((field) => `${field} = EXCLUDED.${field}`)
    .join(',\n        ');

  const { rows } = await pool.query(
    `INSERT INTO controles_prenatales (${campos.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (embarazo_id, numero_control) DO UPDATE SET
        ${updateSet},
        updated_at = NOW()
     RETURNING *`,
    valores
  );

  return rows[0];
}

module.exports = {
  listarPorEmbarazo,
  obtenerPorIdYEmbarazo,
  obtenerPorNumeroYEmbarazo,
  actualizar,
  eliminar,
  upsert,
};
