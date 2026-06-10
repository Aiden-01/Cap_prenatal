// ============================================================
// RUTAS — Auth
// ============================================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, logout, me, changePassword } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { loginSchema, changePasswordSchema } = require('../validations/auth.schemas');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesion. Intenta nuevamente en 15 minutos.' },
});

router.post('/login', loginLimiter, validateBody(loginSchema), login);
router.post('/logout', authMiddleware, logout);
router.get('/me', authMiddleware, me);
router.post('/cambiar-password', authMiddleware, validateBody(changePasswordSchema), changePassword);

module.exports = router;
