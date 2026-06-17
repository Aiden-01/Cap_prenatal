const pool = require('../db/pool');

async function listarPorEmbarazo(embarazoId) {
  const { rows } = await pool.query(
    `SELECT
       c.*,
       ROW_NUMBER() OVER (ORDER BY c.fecha ASC, c.id ASC) AS numero_control,
       c.fecha AS fecha_control,
       c.edad_gestacional_semanas AS semana_gestacional,
       c.peso_kg AS peso,
       CASE
         WHEN c.pa_sistolica IS NOT NULL OR c.pa_diastolica IS NOT NULL
           THEN CONCAT_WS('/', c.pa_sistolica::text, c.pa_diastolica::text)
         ELSE NULL
       END AS presion_arterial,
       c.fcf AS frecuencia_cardiaca_fetal,
       c.presentacion_fetal AS presentacion,
       c.situacion_fetal AS situacion,
       c.impresion_clinica AS observaciones,
       (
         COALESCE(c.pa_sistolica > 140, FALSE)
         OR COALESCE(c.pa_sistolica < 90, FALSE)
         OR COALESCE(c.pa_diastolica > 90, FALSE)
         OR COALESCE(c.pa_diastolica < 60, FALSE)
         OR COALESCE(c.fcf < 110, FALSE)
         OR COALESCE(c.fcf > 160, FALSE)
         OR COALESCE(c.peligro_hemorragia_vaginal, FALSE)
         OR COALESCE(c.peligro_palidez, FALSE)
         OR COALESCE(c.peligro_dolor_cabeza, FALSE)
         OR COALESCE(c.peligro_hipertension, FALSE)
         OR COALESCE(c.peligro_dolor_epigastrico, FALSE)
         OR COALESCE(c.peligro_trastornos_visuales, FALSE)
         OR COALESCE(c.peligro_fiebre, FALSE)
         OR NULLIF(BTRIM(COALESCE(c.peligro_otro, '')), '') IS NOT NULL
       ) AS tiene_hallazgo
     FROM controles_prenatales c
     WHERE embarazo_id = $1
     ORDER BY c.fecha ASC, c.id ASC`,
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

async function actualizar({ id, embarazoId, data, campos, updatedBy = null }) {
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(updatedBy, id, embarazoId);

  const { rows } = await pool.query(
    `UPDATE controles_prenatales SET ${sets}, updated_at = NOW(), updated_by = $${valores.length - 2}
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
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
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
