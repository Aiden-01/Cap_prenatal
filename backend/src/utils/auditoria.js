const pool = require('../db/pool');

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'csrfToken',
  'csrf_token',
]);

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEYS.has(key) ? '[REDACTED]' : sanitize(entry),
    ])
  );
}

function requestMeta(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

async function registrarAuditoria(req, {
  accion,
  tabla,
  registroId = null,
  pacienteId = null,
  embarazoId = null,
  usuarioId = req.usuario?.id || null,
  datosAnteriores = null,
  datosNuevos = null,
  descripcion = null,
}) {
  const { ip, userAgent } = requestMeta(req);

  try {
    await pool.query(
      `INSERT INTO auditoria_eventos (
        usuario_id, accion, tabla, registro_id, paciente_id, embarazo_id,
        datos_anteriores, datos_nuevos, ip, user_agent, descripcion
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        usuarioId,
        accion,
        tabla,
        registroId,
        pacienteId,
        embarazoId,
        datosAnteriores ? sanitize(datosAnteriores) : null,
        datosNuevos ? sanitize(datosNuevos) : null,
        ip,
        userAgent,
        descripcion,
      ]
    );
  } catch (err) {
    console.error('Error registrando auditoria:', err.message);
  }
}

module.exports = { registrarAuditoria };
