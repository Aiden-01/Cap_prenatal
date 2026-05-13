const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } = require('../middleware/auth');

function parseDurationMs(value = '8h') {
  const match = String(value).trim().match(/^(\d+)([smhd])$/i);
  if (!match) return 8 * 60 * 60 * 1000;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
}

function authCookieOptions() {
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite,
    maxAge: parseDurationMs(process.env.JWT_EXPIRES_IN || '8h'),
    path: '/',
  };
}

function csrfCookieOptions() {
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();

  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite,
    maxAge: parseDurationMs(process.env.JWT_EXPIRES_IN || '8h'),
    path: '/',
  };
}

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  try {
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET no configurado');
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre_completo, u.username, u.password_hash, u.activo,
              r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.username = $1`,
      [username]
    );

    const usuario = rows[0];

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (!usuario.activo) {
      return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: usuario.id, username: usuario.username, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    const csrfToken = crypto.randomBytes(32).toString('hex');
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());

    return res.json({
      usuario: {
        id: usuario.id,
        nombre_completo: usuario.nombre_completo,
        username: usuario.username,
        rol: usuario.rol,
      },
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function logout(_req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...authCookieOptions(),
    maxAge: undefined,
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    ...csrfCookieOptions(),
    maxAge: undefined,
  });
  return res.json({ ok: true });
}

async function me(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre_completo, u.username, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE u.id = $1`,
      [req.usuario.id]
    );
    return res.json(rows[0] || null);
  } catch (err) {
    return res.status(500).json({ error: 'Error interno' });
  }
}

module.exports = { login, logout, me };
