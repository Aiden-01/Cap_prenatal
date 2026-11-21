const express = require('express');
const { setTimeout: delay } = require('node:timers/promises');
const { performance } = require('node:perf_hooks');
const { z } = require('../validations/common.schemas');
const { emailSchema } = require('../validations/usuarios.schemas');
const { passwordSchema } = require('../security/passwordPolicy');
const { validateBody } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/asyncHandler');
const { readCookie } = require('../middleware/auth');
const { AppError } = require('../utils/appError');
const { grantLifetime } = require('../services/accountEmailService');

const recoveryPath = '/api/auth/recuperacion';
const challengeCookie = 'cap_email_desafio';
const grantCookie = 'cap_email_restablecer';
const codeSchema = z.string().regex(/^\d{8}$/, 'Ingresa los ocho dígitos.');
const resetSchema = z.object({ new_password: passwordSchema, confirm_password: z.string().max(72) }).strict()
  .refine(body => body.new_password === body.confirm_password, { path: ['confirm_password'], message: 'Las contraseñas no coinciden.' });
const badCode = () => new AppError(400, 'El código no es válido o ya venció.', { code: 'ACCOUNT_CODE_INVALID' });

function createPasswordRecoveryRouter(config, service = null) {
  const recovery = express.Router();
  const cookie = path => ({ path, httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'strict' });
  const resetCookie = cookie(`${recoveryPath}/restablecer`);

  function noStore(_req, res, next) { res.set('Cache-Control', 'no-store'); next(); }
  function enabled(_req, _res, next) {
    if (!service) return next(new AppError(503, 'El servicio de correo no está disponible. Comunícate con administración.', { code: 'ACCOUNT_EMAIL_UNAVAILABLE' }));
    return next();
  }
  recovery.use(noStore, (req, _res, next) => {
    const origin = req.get('Origin');
    if (!req.is('application/json') || req.get('X-CAP-Recovery') !== '1' || !origin || !config.frontendOrigins.includes(origin)) {
      return next(new AppError(403, 'Solicitud de recuperación no válida.', { code: 'CSRF_INVALID' }));
    }
    return next();
  }, enabled);

  // Ambos resultados de una solicitud pública comparten estado, cuerpo, cookies
  // y una espera mínima. No se espera a Resend en el camino de la respuesta.
  const publicStep = action => asyncHandler(async (req, res) => {
    const start = performance.now();
    let result;
    try { result = await action(req); }
    finally { await delay(Math.max(0, 300 - (performance.now() - start))); }
    return result(res);
  });
  recovery.post('/solicitar', validateBody(z.object({ email: emailSchema }).strict()), publicStep(async req => {
    const id = await service.issue({ req, email: req.body.email });
    return res => res.cookie(challengeCookie, id, { ...cookie(recoveryPath), maxAge: 15 * 60 * 1000 })
      .status(202).json({ message: 'Si el correo corresponde a una cuenta activa, recibirás un código.', resend_after: 60, expires_in: 900 });
  }));
  recovery.post('/validar', validateBody(z.object({ email: emailSchema, code: codeSchema }).strict()), publicStep(async req => {
    const id = readCookie(req, challengeCookie);
    const challengeId = typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id) ? id : null;
    const grant = await service.verify({ req, email: req.body.email, code: req.body.code, challengeId });
    if (!grant) throw badCode();
    return res => res.clearCookie(challengeCookie, cookie(recoveryPath))
      .cookie(grantCookie, grant.token, { ...resetCookie, maxAge: grantLifetime }).json({ csrf: grant.csrf });
  }));
  recovery.post('/restablecer', validateBody(resetSchema), asyncHandler(async (req, res) => {
    const ok = await service.reset({ token: readCookie(req, grantCookie), csrf: req.get('X-Recovery-CSRF'), password: req.body.new_password, req });
    if (!ok) throw new AppError(403, 'La autorización no es válida o ya venció. Solicita un código nuevo.', { code: 'ACCOUNT_GRANT_INVALID' });
    res.clearCookie(grantCookie, resetCookie).json({ ok: true });
  }));

  return recovery;
}

module.exports = { createPasswordRecoveryRouter };
