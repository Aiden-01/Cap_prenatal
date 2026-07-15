const jwt = require('jsonwebtoken');
const authSessionsRepository = require('../repositories/authSessionsRepository');
const { AppError } = require('../utils/appError');
const { ConfigError, getJwtConfig, getSessionConfig } = require('../config/env');
const sessionService = require('../services/sessionService');
const { stateOfSession } = sessionService;

const AUTH_COOKIE_NAME = 'cap_prenatal_token';
const REFRESH_COOKIE_NAME = 'cap_prenatal_refresh';
const CSRF_COOKIE_NAME = 'cap_prenatal_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

function readCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}

function readAccessToken(req) {
  const authHeader = req.headers.authorization;
  const bearerMatch = typeof authHeader === 'string'
    ? authHeader.match(/^Bearer\s+(.+)$/i)
    : null;
  return bearerMatch?.[1] || readCookie(req, AUTH_COOKIE_NAME);
}

function verifyAccessToken(token, { ignoreExpiration = false, jwtConfig = getJwtConfig() } = {}) {
  return jwt.verify(token, jwtConfig.secret, {
    algorithms: [jwtConfig.algorithm],
    audience: jwtConfig.audience,
    issuer: jwtConfig.issuer,
    ignoreExpiration,
  });
}

function authenticationError(code = 'AUTHENTICATION_REQUIRED') {
  const message = code === 'ACCESS_TOKEN_EXPIRED'
    ? 'La credencial de acceso expiro'
    : 'Autenticacion requerida';
  return new AppError(401, message, { code });
}

function hasRequiredClaims(payload) {
  return payload
    && typeof payload.sid === 'string'
    && typeof payload.sub === 'string'
    && typeof payload.jti === 'string';
}

function createAuthMiddleware({
  repository = authSessionsRepository,
  getJwt = getJwtConfig,
  getSession = getSessionConfig,
  clock = Date,
  invalidateSession = sessionService.invalidateSessionState,
} = {}) {
  return async function sessionAuthMiddleware(req, _res, next) {
    const token = readAccessToken(req);
    if (!token) return next(authenticationError());

    let payload;
    try {
      payload = verifyAccessToken(token, { jwtConfig: getJwt() });
    } catch (error) {
      if (error instanceof ConfigError) return next(error);
      if (error?.name === 'TokenExpiredError') {
        return next(authenticationError('ACCESS_TOKEN_EXPIRED'));
      }
      return next(authenticationError());
    }

    if (!hasRequiredClaims(payload)) return next(authenticationError());

    try {
      const record = await repository.obtenerConUsuarioPorId(payload.sid);
      if (!record || String(record.usuario_id) !== payload.sub) {
        return next(authenticationError());
      }

      const state = stateOfSession(record, getSession(), new Date(clock.now()));
      if (state) {
        if (!record.revoked_at && ['SESSION_INACTIVE', 'SESSION_EXPIRED', 'USER_INACTIVE'].includes(state.code)) {
          await invalidateSession({
            sessionId: record.id,
            req,
            dependencies: { repository, config: getSession(), clock },
          });
        }
        return next(authenticationError(state.code));
      }

      req.usuario = {
        id: record.usuario_id,
        nombre_completo: record.nombre_completo,
        username: record.username,
        rol: record.rol,
        activo: record.activo,
      };
      req.authSession = {
        id: record.id,
        usuario_id: record.usuario_id,
        created_at: record.created_at,
        last_activity_at: record.last_activity_at,
        absolute_expires_at: record.absolute_expires_at,
      };
      req.authToken = { jti: payload.jti };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function optionalLogoutClaims(req, _res, next) {
  const token = readAccessToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token, { ignoreExpiration: true });
    if (hasRequiredClaims(payload)) {
      req.logoutClaims = { sessionId: payload.sid, usuarioId: payload.sub };
    }
  } catch (error) {
    if (error instanceof ConfigError) return next(error);
  }
  return next();
}

const authMiddleware = createAuthMiddleware();

function csrfMiddleware(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  if (req.originalUrl === '/api/auth/login' || req.path === '/auth/login') return next();

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
  REFRESH_COOKIE_NAME,
  authMiddleware,
  authenticationError,
  createAuthMiddleware,
  csrfMiddleware,
  optionalLogoutClaims,
  permitirRoles,
  readAccessToken,
  readCookie,
  soloAdmin,
  verifyAccessToken,
};
