const jwt = require('jsonwebtoken');

const AUTH_COOKIE_NAME = 'cap_prenatal_token';

function readCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  const token = bearerToken || readCookie(req, AUTH_COOKIE_NAME);

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload; // { id, username, rol }
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
}

module.exports = { AUTH_COOKIE_NAME, authMiddleware, soloAdmin };
