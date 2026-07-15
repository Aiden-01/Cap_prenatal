const authService = require('../services/authService');
const {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  readCookie,
} = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getCookieConfig } = require('../config/env');

const REFRESH_COOKIE_PATH = '/api/auth';

function baseCookieOptions({ httpOnly, path }) {
  const { nodeEnv, sameSite } = getCookieConfig();
  return {
    httpOnly,
    secure: nodeEnv === 'production',
    sameSite,
    path,
  };
}

function remainingAbsoluteMs(absoluteExpiresAt) {
  return Math.max(0, new Date(absoluteExpiresAt).getTime() - Date.now());
}

function accessCookieOptions(absoluteExpiresAt = null) {
  const { session } = getCookieConfig();
  return {
    ...baseCookieOptions({ httpOnly: true, path: '/' }),
    // La cookie vive hasta el limite absoluto para que el backend pueda
    // distinguir un JWT expirado y permitir el flujo de refresh controlado.
    maxAge: absoluteExpiresAt
      ? remainingAbsoluteMs(absoluteExpiresAt)
      : session.absoluteHours * 60 * 60 * 1000,
  };
}

function refreshCookieOptions(absoluteExpiresAt = null) {
  const { session } = getCookieConfig();
  return {
    ...baseCookieOptions({ httpOnly: true, path: REFRESH_COOKIE_PATH }),
    maxAge: absoluteExpiresAt
      ? remainingAbsoluteMs(absoluteExpiresAt)
      : session.absoluteHours * 60 * 60 * 1000,
  };
}

function csrfCookieOptions(absoluteExpiresAt = null) {
  const { session } = getCookieConfig();
  return {
    ...baseCookieOptions({ httpOnly: false, path: '/' }),
    maxAge: absoluteExpiresAt
      ? remainingAbsoluteMs(absoluteExpiresAt)
      : session.absoluteHours * 60 * 60 * 1000,
  };
}

function clearCookieOptions(options) {
  const { maxAge: _maxAge, ...rest } = options;
  return rest;
}

function clearAuthCookies(res) {
  res.clearCookie(AUTH_COOKIE_NAME, clearCookieOptions(accessCookieOptions()));
  res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions(refreshCookieOptions()));
  res.clearCookie(CSRF_COOKIE_NAME, clearCookieOptions(csrfCookieOptions()));
}

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    username: req.body.username,
    password: req.body.password,
    req,
  });
  res.cookie(AUTH_COOKIE_NAME, result.accessToken, accessCookieOptions(result.absoluteExpiresAt));
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(result.absoluteExpiresAt));
  res.cookie(CSRF_COOKIE_NAME, result.csrfToken, csrfCookieOptions(result.absoluteExpiresAt));
  return res.json({ usuario: result.usuario });
});

const refresh = asyncHandler(async (req, res) => {
  try {
    const result = await authService.refresh({
      refreshToken: readCookie(req, REFRESH_COOKIE_NAME),
      req,
    });
    res.cookie(AUTH_COOKIE_NAME, result.accessToken, accessCookieOptions(result.absoluteExpiresAt));
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(result.absoluteExpiresAt));
    return res.status(204).end();
  } catch (error) {
    clearAuthCookies(res);
    throw error;
  }
});

const logout = asyncHandler(async (req, res) => {
  req.logoutRefreshToken = readCookie(req, REFRESH_COOKIE_NAME);
  const result = await authService.logout(req);
  clearAuthCookies(res);
  return res.json(result);
});

const logoutAll = asyncHandler(async (req, res) => {
  const result = await authService.logoutAll({ req });
  clearAuthCookies(res);
  return res.json(result);
});

const me = asyncHandler(async (req, res) => {
  const usuario = await authService.me({
    usuario: req.usuario,
    authSession: req.authSession,
  });
  return res.json(usuario);
});

const activity = asyncHandler(async (req, res) => {
  await authService.activity({ req });
  return res.status(204).end();
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword({
    usuarioId: req.usuario.id,
    currentPassword: req.body.current_password,
    newPassword: req.body.new_password,
    req,
  });
  clearAuthCookies(res);
  return res.json(result);
});

module.exports = {
  REFRESH_COOKIE_PATH,
  accessCookieOptions,
  activity,
  changePassword,
  clearAuthCookies,
  csrfCookieOptions,
  login,
  logout,
  logoutAll,
  me,
  refresh,
  refreshCookieOptions,
};
