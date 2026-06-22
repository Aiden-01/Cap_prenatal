const pool = require('../db/pool');

async function obtenerPorEmbarazo(embarazoId) {
  const { rows } = await pool.query(
    'SELECT * FROM planes_parto WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
    [embarazoId]
  );
  return rows[0] || null;
}

async function actualizar({ id, embarazoId, pacienteId, data, campos, updatedBy = null }) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(updatedBy, id, embarazoId, pacienteId);

  const { rows } = await pool.query(
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

async function insertar(data) {
  const campos = Object.keys(data);
  const valores = campos.map((field) => data[field]);
  const placeholders = valores.map((_, index) => `$${index + 1}`).join(', ');
  const pacienteParam = campos.indexOf('paciente_id') + 1;
  const embarazoParam = campos.indexOf('embarazo_id') + 1;

  const { rows } = await pool.query(
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

module.exports = {
  obtenerPorEmbarazo,
  actualizar,
  insertar,
};
