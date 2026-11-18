const pool = require('../db/pool');

async function obtenerUsuarioPorUsername(username) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.username, u.password_hash, u.activo, u.requiere_cambio_password,
            r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.username = $1`,
    [username]
  );
  return rows[0] || null;
}

async function obtenerUsuarioPorId(id, db = pool) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre_completo, u.username, u.activo, u.requiere_cambio_password, r.nombre AS rol
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function obtenerCredencialesPorId(id, db = pool, { bloquear = false } = {}) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre_completo, u.username, u.password_hash, u.activo, u.requiere_cambio_password,
            r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1${bloquear ? " FOR UPDATE OF u" : ""}`,
    [id]
  );
  return rows[0] || null;
}

async function actualizarPassword({ id, passwordHash, updatedBy = null }, db = pool) {
  const { rows } = await db.query(
    `UPDATE usuarios
     SET password_hash = $1, requiere_cambio_password = FALSE, updated_at = NOW(), updated_by = $2
     WHERE id = $3
     RETURNING id, nombre_completo, username`,
    [passwordHash, updatedBy, id]
  );
  return rows[0] || null;
}

module.exports = {
  obtenerUsuarioPorUsername,
  obtenerUsuarioPorId,
  obtenerCredencialesPorId,
  actualizarPassword,
};
