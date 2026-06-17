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

async function obtenerPorNumeroYEmbarazo(embarazoId, numeroAtencion) {
  const { rows } = await pool.query(
    'SELECT * FROM controles_puerperio WHERE embarazo_id = $1 AND numero_atencion = $2',
    [embarazoId, numeroAtencion]
  );
  return rows[0] || null;
}

async function obtenerEmbarazoPorId(id) {
  const { rows } = await pool.query('SELECT * FROM embarazos WHERE id = $1', [id]);
  return rows[0] || null;
}

async function marcarEmbarazoEnPuerperio({ embarazoId, fechaCierre, updatedBy = null }) {
  const { rows } = await pool.query(
    `UPDATE embarazos
     SET estado = 'puerperio',
         fecha_cierre = COALESCE(fecha_cierre, $2),
         updated_at = NOW(),
         updated_by = $3
     WHERE id = $1 AND estado = 'activo'
     RETURNING *`,
    [embarazoId, fechaCierre, updatedBy]
  );
  return rows[0] || null;
}

async function upsert({ data, updateFields }) {
  const campos = Object.keys(data);
  const valores = campos.map((field) => data[field]);
  const placeholders = valores.map((_, index) => `$${index + 1}`).join(', ');
  const updateSet = updateFields
    .map((field) => `${field} = EXCLUDED.${field}`)
    .join(',\n        ');

  const { rows } = await pool.query(
    `INSERT INTO controles_puerperio (${campos.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (embarazo_id, numero_atencion) DO UPDATE SET
        ${updateSet},
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
     RETURNING *`,
    valores
  );

  return rows[0];
}

async function actualizar({ id, embarazoId, data, campos, updatedBy = null }) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(updatedBy, id, embarazoId);

  const { rows } = await pool.query(
    `UPDATE controles_puerperio SET ${sets}, updated_at = NOW(), updated_by = $${valores.length - 2}
     WHERE id = $${valores.length - 1} AND embarazo_id = $${valores.length}
     RETURNING *`,
    valores
  );

  return rows[0] || null;
}

async function eliminar({ id, embarazoId }) {
  const { rows, rowCount } = await pool.query(
    'DELETE FROM controles_puerperio WHERE id = $1 AND embarazo_id = $2 RETURNING *',
    [id, embarazoId]
  );

  return { control: rows[0] || null, rowCount };
}

module.exports = {
  listarPorEmbarazo,
  obtenerPorIdYEmbarazo,
  obtenerPorNumeroYEmbarazo,
  obtenerEmbarazoPorId,
  marcarEmbarazoEnPuerperio,
  upsert,
  actualizar,
  eliminar,
};
