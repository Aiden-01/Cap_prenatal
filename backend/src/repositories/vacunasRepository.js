const pool = require('../db/pool');

async function listarPorEmbarazo(embarazoId) {
  const { rows } = await pool.query(
    `SELECT * FROM vacunas_paciente
     WHERE embarazo_id = $1
     ORDER BY tipo_vacuna, momento, numero_dosis`,
    [embarazoId]
  );
  return rows;
}

async function obtenerPorIdYEmbarazo(id, embarazoId) {
  const { rows } = await pool.query(
    'SELECT * FROM vacunas_paciente WHERE id = $1 AND embarazo_id = $2',
    [id, embarazoId]
  );
  return rows[0] || null;
}

async function obtenerPorDosis({ embarazoId, tipoVacuna, momento, numeroDosis }) {
  const { rows } = await pool.query(
    `SELECT * FROM vacunas_paciente
     WHERE embarazo_id = $1 AND tipo_vacuna = $2 AND momento = $3 AND numero_dosis = $4`,
    [embarazoId, tipoVacuna, momento, numeroDosis]
  );
  return rows[0] || null;
}

async function upsert(data) {
  const { rows } = await pool.query(
    `INSERT INTO vacunas_paciente (
      paciente_id, embarazo_id, tipo_vacuna, momento, numero_dosis, fecha_dosis, registrado_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (embarazo_id, tipo_vacuna, momento, numero_dosis)
    DO UPDATE SET
      fecha_dosis = EXCLUDED.fecha_dosis,
      registrado_por = EXCLUDED.registrado_por
    RETURNING *`,
    [
      data.paciente_id,
      data.embarazo_id,
      data.tipo_vacuna,
      data.momento,
      data.numero_dosis,
      data.fecha_dosis,
      data.registrado_por,
    ]
  );
  return rows[0];
}

async function actualizar({ id, embarazoId, data }) {
  const { rows } = await pool.query(
    `UPDATE vacunas_paciente SET
      tipo_vacuna=$1, momento=$2, numero_dosis=$3, fecha_dosis=$4, registrado_por=$5
     WHERE id=$6 AND embarazo_id=$7
     RETURNING *`,
    [
      data.tipo_vacuna,
      data.momento,
      data.numero_dosis,
      data.fecha_dosis,
      data.registrado_por,
      id,
      embarazoId,
    ]
  );
  return rows[0] || null;
}

async function eliminar({ id, embarazoId }) {
  const { rows, rowCount } = await pool.query(
    'DELETE FROM vacunas_paciente WHERE id = $1 AND embarazo_id = $2 RETURNING *',
    [id, embarazoId]
  );
  return { vacuna: rows[0] || null, rowCount };
}

module.exports = {
  listarPorEmbarazo,
  obtenerPorIdYEmbarazo,
  obtenerPorDosis,
  upsert,
  actualizar,
  eliminar,
};
