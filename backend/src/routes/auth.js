// ============================================================
// RUTAS — Auth
// ============================================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  activity,
  changePassword,
  login,
  logout,
  logoutAll,
  me,
  refresh,
} = require('../controllers/authController');
const { authMiddleware, optionalLogoutClaims } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { changePasswordSchema, emptyBodySchema, loginSchema } = require('../validations/auth.schemas');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesion. Intenta nuevamente en 15 minutos.' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de renovacion de sesion.' },
});

router.post('/login', loginLimiter, validateBody(loginSchema), login);
router.post('/refresh', refreshLimiter, validateBody(emptyBodySchema), refresh);
router.post('/logout', optionalLogoutClaims, validateBody(emptyBodySchema), logout);
router.post('/logout-all', authMiddleware, validateBody(emptyBodySchema), logoutAll);
router.post('/activity', authMiddleware, validateBody(emptyBodySchema), activity);
router.get('/me', authMiddleware, me);
router.post('/cambiar-password', authMiddleware, validateBody(changePasswordSchema), changePassword);

module.exports = router;
