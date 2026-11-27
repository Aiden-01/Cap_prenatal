const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { clearAuthCookies } = require('../controllers/authController');
const { obtenerCorreoPropio } = require('../repositories/authRepository');
const { validateBody } = require('../middleware/validate');
const { z } = require('../validations/common.schemas');
const { emailSchema } = require('../validations/usuarios.schemas');
const { currentPasswordSchema } = require('../validations/auth.schemas');
const { asyncHandler } = require('../middleware/asyncHandler');
const { AppError } = require('../utils/appError');

const requestSchema = z.object({ email: emailSchema, current_password: currentPasswordSchema }).strict();
const confirmSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{8}$/, 'Ingresa los ocho dígitos.'),
  challenge_id: z.uuid(),
}).strict();

function createOwnEmailRouter(service, { authenticate = authMiddleware, readEmail = obtenerCorreoPropio } = {}) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  }, authenticate);

  router.get('/', asyncHandler(async (req, res) => {
    const email = await readEmail(req.usuario.id);
    res.json({ email, available: Boolean(service) });
  }));

  router.use((_req, _res, next) => next(service ? undefined : new AppError(
    503, 'El servicio de correo no está disponible.', { code: 'ACCOUNT_EMAIL_UNAVAILABLE' }
  )));

  router.post('/solicitar', validateBody(requestSchema), asyncHandler(async (req, res) => {
    const id = await service.requestEmailChange({ req, email: req.body.email, password: req.body.current_password });
    res.status(202).json({ challenge_id: id, resend_after: 60, expires_in: 900 });
  }));

  router.post('/confirmar', validateBody(confirmSchema), asyncHandler(async (req, res) => {
    await service.confirmEmailChange({ req, email: req.body.email, code: req.body.code, challengeId: req.body.challenge_id });
    clearAuthCookies(res);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createOwnEmailRouter };
