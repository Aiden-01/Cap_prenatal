const pool = require('../db/pool');

async function obtenerUsuarioPorUsername(username) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.username, u.password_hash, u.activo,
            r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.username = $1`,
    [username]
  );
  return rows[0] || null;
}

async function obtenerUsuarioPorId(id) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.username, r.nombre AS rol
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function obtenerCredencialesPorId(id) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.username, u.password_hash, u.activo,
            r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function actualizarPassword({ id, passwordHash }) {
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET password_hash = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, nombre_completo, username`,
    [passwordHash, id]
  );
  return rows[0] || null;
}

module.exports = {
  obtenerUsuarioPorUsername,
  obtenerUsuarioPorId,
  obtenerCredencialesPorId,
  actualizarPassword,
};
