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

async function obtenerPorIdYEmbarazo(id, embarazoId, db = pool) {
  const { rows } = await db.query(
    'SELECT * FROM vacunas_paciente WHERE id = $1 AND embarazo_id = $2',
    [id, embarazoId]
  );
  return rows[0] || null;
}

async function obtenerPorId(id, db = pool) {
  const { rows } = await db.query('SELECT * FROM vacunas_paciente WHERE id = $1', [id]);
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

async function obtenerPorDosis({ embarazoId, tipoVacuna, momento, numeroDosis }, db = pool) {
  const { rows } = await db.query(
    `SELECT * FROM vacunas_paciente
     WHERE embarazo_id = $1 AND tipo_vacuna = $2 AND momento = $3 AND numero_dosis = $4`,
    [embarazoId, tipoVacuna, momento, numeroDosis]
  );
  return rows[0] || null;
}

async function upsert(data, db = pool) {
  const { rows } = await db.query(
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

async function actualizar({
  id,
  embarazoId,
  pacienteId,
  data,
  campos = ['tipo_vacuna', 'momento', 'numero_dosis', 'fecha_dosis'],
}, db = pool) {
  const sets = campos.map((field, index) => `${field}=$${index + 1}`).join(', ');
  const valores = campos.map((field) => data[field]);
  valores.push(data.updated_by, id, embarazoId, pacienteId);

  const { rows } = await db.query(
    `WITH embarazo_editable AS (
       SELECT id FROM embarazos
       WHERE id=$${valores.length - 1} AND paciente_id=$${valores.length}
         AND estado IN ('activo', 'puerperio') FOR UPDATE
     )
     UPDATE vacunas_paciente SET
      ${sets}, updated_at=NOW(), updated_by=$${valores.length - 3}
     WHERE id=$${valores.length - 2} AND embarazo_id=$${valores.length - 1}
       AND EXISTS (SELECT 1 FROM embarazo_editable)
     RETURNING *`,
    valores
  );
  return rows[0] || null;
}

async function eliminar({ id, embarazoId, pacienteId }, db = pool) {
  const { rows, rowCount } = await db.query(
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

async function enTransaccion(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
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
  enTransaccion,
};
