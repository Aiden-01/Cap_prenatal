const pool = require('../db/pool');

async function listar() {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.username, u.activo, r.nombre AS rol,
            u.created_at, u.updated_at, u.created_by, u.updated_by
     FROM usuarios u JOIN roles r ON r.id = u.rol_id ORDER BY u.id`
  );
  return rows;
}

async function crear({ nombreCompleto, username, passwordHash, rol, createdBy = null }) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id, created_by)
     VALUES ($1, $2, $3, (SELECT id FROM roles WHERE nombre = $4), $5)
     RETURNING id, nombre_completo, username, activo, created_at, updated_at, created_by, updated_by`,
    [nombreCompleto, username, passwordHash, rol, createdBy]
  );
  return rows[0];
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.username, u.activo, r.nombre AS rol,
            u.created_at, u.updated_at, u.created_by, u.updated_by
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function contarAdminsActivos() {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE r.nombre = 'admin' AND u.activo = TRUE`
  );
  return parseInt(rows[0].count, 10);
}

async function actualizar({ id, nombreCompleto, activo, rol, passwordHash, updatedBy = null }) {
  if (passwordHash) {
    const { rows } = await pool.query(
      `UPDATE usuarios SET nombre_completo=$1, activo=$2,
       rol_id=(SELECT id FROM roles WHERE nombre=$3),
       password_hash=$4, updated_at=NOW(), updated_by=$5 WHERE id=$6
       RETURNING id, nombre_completo, username, activo, created_at, updated_at, created_by, updated_by`,
      [nombreCompleto, activo, rol, passwordHash, updatedBy, id]
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `UPDATE usuarios SET nombre_completo=$1, activo=$2,
     rol_id=(SELECT id FROM roles WHERE nombre=$3),
     updated_at=NOW(), updated_by=$4 WHERE id=$5
     RETURNING id, nombre_completo, username, activo, created_at, updated_at, created_by, updated_by`,
    [nombreCompleto, activo, rol, updatedBy, id]
  );
  return rows[0] || null;
}

async function eliminar(id) {
  await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
}

module.exports = {
  listar,
  crear,
  obtenerPorId,
  contarAdminsActivos,
  actualizar,
  eliminar,
};
