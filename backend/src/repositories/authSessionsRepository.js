const pool = require('../db/pool');

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
      console.warn('[auth_sessions] No se pudo revertir la transaccion:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function crear({
  id,
  usuarioId,
  refreshTokenHash,
  createdAt,
  absoluteExpiresAt,
}, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO auth_sessions (
       id, usuario_id, refresh_token_hash, created_at,
       last_activity_at, absolute_expires_at, updated_at
     ) VALUES ($1, $2, $3, $4, $4, $5, $4)
     RETURNING id, usuario_id, created_at, last_activity_at,
               absolute_expires_at, revoked_at, revoked_reason`,
    [id, usuarioId, refreshTokenHash, createdAt, absoluteExpiresAt]
  );
  return rows[0];
}

async function obtenerConUsuarioPorId(id, db = pool, { bloquear = false } = {}) {
  const lock = bloquear ? ' FOR UPDATE OF s' : '';
  const { rows } = await db.query(
    `SELECT s.id, s.usuario_id, s.refresh_token_hash,
            s.previous_refresh_token_hash, s.created_at, s.last_activity_at,
            s.absolute_expires_at, s.revoked_at, s.revoked_reason,
            u.nombre_completo, u.username, u.activo, r.nombre AS rol
     FROM auth_sessions s
     JOIN usuarios u ON u.id = s.usuario_id
     JOIN roles r ON r.id = u.rol_id
     WHERE s.id = $1${lock}`,
    [id]
  );
  return rows[0] || null;
}

async function rotarRefresh({ id, refreshTokenHash, previousRefreshTokenHash, updatedAt }, db = pool) {
  const { rows } = await db.query(
    `UPDATE auth_sessions
     SET refresh_token_hash = $1,
         previous_refresh_token_hash = $2,
         updated_at = $3
     WHERE id = $4 AND revoked_at IS NULL
     RETURNING id, usuario_id, created_at, last_activity_at, absolute_expires_at`,
    [refreshTokenHash, previousRefreshTokenHash, updatedAt, id]
  );
  return rows[0] || null;
}

async function revocar({ id, usuarioId = null, reason, revokedAt }, db = pool) {
  const params = [revokedAt, reason, id];
  const usuarioClause = usuarioId === null ? '' : ' AND usuario_id = $4';
  if (usuarioId !== null) params.push(usuarioId);
  const { rowCount } = await db.query(
    `UPDATE auth_sessions
     SET revoked_at = $1, revoked_reason = $2, updated_at = $1
     WHERE id = $3 AND revoked_at IS NULL${usuarioClause}`,
    params
  );
  return rowCount;
}

async function revocarTodasPorUsuario({ usuarioId, reason, revokedAt }, db = pool) {
  const { rowCount } = await db.query(
    `UPDATE auth_sessions
     SET revoked_at = $1, revoked_reason = $2, updated_at = $1
     WHERE usuario_id = $3 AND revoked_at IS NULL`,
    [revokedAt, reason, usuarioId]
  );
  return rowCount;
}

async function actualizarActividad({ id, usuarioId, now, minIntervalSeconds }, db = pool) {
  const { rows } = await db.query(
    `UPDATE auth_sessions
     SET last_activity_at = $1, updated_at = $1
     WHERE id = $2
       AND usuario_id = $3
       AND revoked_at IS NULL
       AND last_activity_at <= $1 - ($4 * INTERVAL '1 second')
     RETURNING last_activity_at`,
    [now, id, usuarioId, minIntervalSeconds]
  );
  return rows[0] || null;
}

async function eliminarAntiguas({ before }, db = pool) {
  const { rowCount } = await db.query(
    `DELETE FROM auth_sessions
     WHERE (revoked_at IS NOT NULL AND revoked_at < $1)
        OR (absolute_expires_at < $1)`,
    [before]
  );
  return rowCount;
}

module.exports = {
  actualizarActividad,
  crear,
  eliminarAntiguas,
  enTransaccion,
  obtenerConUsuarioPorId,
  revocar,
  revocarTodasPorUsuario,
  rotarRefresh,
};
