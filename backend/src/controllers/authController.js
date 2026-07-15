const authService = require('../services/authService');
const { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getCookieConfig } = require('../config/env');

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
  const { nodeEnv, sameSite, expiresIn } = getCookieConfig();

  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite,
    maxAge: parseDurationMs(expiresIn),
    path: '/',
  };
}

function csrfCookieOptions() {
  const { nodeEnv, sameSite, expiresIn } = getCookieConfig();

  return {
    httpOnly: false,
    secure: nodeEnv === 'production',
    sameSite,
    maxAge: parseDurationMs(expiresIn),
    path: '/',
  };
}

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    username: req.body.username,
    password: req.body.password,
    req,
  });

  res.cookie(AUTH_COOKIE_NAME, result.token, authCookieOptions());
  res.cookie(CSRF_COOKIE_NAME, result.csrfToken, csrfCookieOptions());

  return res.json({ usuario: result.usuario });
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(req);

  res.clearCookie(AUTH_COOKIE_NAME, {
    ...authCookieOptions(),
    maxAge: undefined,
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    ...csrfCookieOptions(),
    maxAge: undefined,
  });
  return res.json(result);
});

const me = asyncHandler(async (req, res) => {
  const usuario = await authService.me(req.usuario.id);
  return res.json(usuario || null);
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword({
    usuarioId: req.usuario.id,
    currentPassword: req.body.current_password,
    newPassword: req.body.new_password,
    req,
  });
  return res.json(result);
});

module.exports = { login, logout, me, changePassword };
