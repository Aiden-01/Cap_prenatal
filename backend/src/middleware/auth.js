const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/appError');

const AUTH_COOKIE_NAME = 'cap_prenatal_token';
const CSRF_COOKIE_NAME = 'cap_prenatal_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

function readCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function authMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.split(' ')[1];
  const token = bearerToken || readCookie(req, AUTH_COOKIE_NAME);

  if (!token) {
    return next(new AppError(401, 'Token requerido', { code: 'TOKEN_REQUIRED' }));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload;
    return next();
  } catch {
    return next(new AppError(401, 'Token invalido o expirado', { code: 'TOKEN_INVALID' }));
  }
}

function csrfMiddleware(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if (req.originalUrl === '/api/auth/login' || req.path === '/auth/login') {
    return next();
  }

  const csrfCookie = readCookie(req, CSRF_COOKIE_NAME);
  const csrfHeader = req.headers[CSRF_HEADER_NAME];

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return next(new AppError(403, 'Token CSRF invalido', { code: 'CSRF_INVALID' }));
  }

  return next();
}

function soloAdmin(req, _res, next) {
  if (req.usuario?.rol !== 'admin') {
    return next(new AppError(403, 'Acceso restringido a administradores', { code: 'ADMIN_ONLY' }));
  }

  return next();
}

function permitirRoles(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return next(new AppError(403, 'Acceso restringido', { code: 'ROL_REQUERIDO' }));
    }

    return next();
  };
}

module.exports = {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  authMiddleware,
  csrfMiddleware,
  permitirRoles,
  readCookie,
  soloAdmin,
};
