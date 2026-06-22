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

async function obtenerPorId(id) {
  const { rows } = await pool.query('SELECT * FROM vacunas_paciente WHERE id = $1', [id]);
  return rows[0] || null;
}

async function listarAntecedentes({ pacienteId, excluirEmbarazoId = null }) {
  const { rows } = await pool.query(
    `SELECT v.*, e.numero_embarazo AS embarazo_origen_numero, e.estado AS embarazo_origen_estado
     FROM vacunas_paciente v
     LEFT JOIN embarazos e ON e.id = v.embarazo_id
     WHERE v.paciente_id = $1
       AND ($2::integer IS NULL OR v.embarazo_id IS NULL OR v.embarazo_id <> $2)
     ORDER BY v.fecha_dosis DESC NULLS LAST, v.id DESC`,
    [pacienteId, excluirEmbarazoId]
  );
  return rows;
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
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos WHERE id=$2 AND paciente_id=$1
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     INSERT INTO vacunas_paciente (
      paciente_id, embarazo_id, tipo_vacuna, momento, numero_dosis, fecha_dosis, registrado_por, updated_by
    ) SELECT $1,$2,$3,$4,$5,$6,$7,$8 FROM embarazo_editable
    ON CONFLICT (embarazo_id, tipo_vacuna, momento, numero_dosis)
    DO UPDATE SET
      fecha_dosis = EXCLUDED.fecha_dosis,
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by
    RETURNING *`,
    [
      data.paciente_id,
      data.embarazo_id,
      data.tipo_vacuna,
      data.momento,
      data.numero_dosis,
      data.fecha_dosis,
      data.registrado_por,
      data.updated_by,
    ]
  );
  return rows[0] || null;
}

async function actualizar({ id, embarazoId, pacienteId, data }) {
  const { rows } = await pool.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos WHERE id=$7 AND paciente_id=$8
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     UPDATE vacunas_paciente SET
      tipo_vacuna=$1, momento=$2, numero_dosis=$3, fecha_dosis=$4,
      updated_at=NOW(), updated_by=$5
     WHERE id=$6 AND embarazo_id=$7 AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    [
      data.tipo_vacuna,
      data.momento,
      data.numero_dosis,
      data.fecha_dosis,
      data.updated_by,
      id,
      embarazoId,
      pacienteId,
    ]
  );
  return rows[0] || null;
}

async function eliminar({ id, embarazoId, pacienteId }) {
  const { rows, rowCount } = await pool.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos WHERE id=$2 AND paciente_id=$3
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     DELETE FROM vacunas_paciente
     WHERE id = $1 AND embarazo_id = $2 AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    [id, embarazoId, pacienteId]
  );
  return { vacuna: rows[0] || null, rowCount };
}

module.exports = {
  listarPorEmbarazo,
  obtenerPorIdYEmbarazo,
  obtenerPorId,
  listarAntecedentes,
  obtenerPorDosis,
  upsert,
  actualizar,
  eliminar,
};
