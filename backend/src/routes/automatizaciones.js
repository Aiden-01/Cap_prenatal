const crypto = require('crypto');
const express = require('express');
const reportesService = require('../services/reportesService');
const { asyncHandler } = require('../middleware/asyncHandler');
const { AppError } = require('../utils/appError');

const router = express.Router();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function automationSecretMiddleware(req, _res, next) {
  const expected = process.env.AUTOMATION_SECRET || process.env.N8N_WEBHOOK_SECRET;
  const received = req.headers['x-cap-prenatal-secret'];

  if (!expected) {
    return next(new AppError(503, 'Automatizaciones no configuradas', {
      code: 'AUTOMATION_SECRET_MISSING',
    }));
  }

  if (!safeEqual(received, expected)) {
    return next(new AppError(401, 'Secreto de automatizacion invalido', {
      code: 'AUTOMATION_SECRET_INVALID',
    }));
  }

  return next();
}

router.use(automationSecretMiddleware);

router.get('/proximas-citas', asyncHandler(async (req, res) => {
  const dias = Number.parseInt(req.query.dias || '1', 10);
  const safeDias = Number.isInteger(dias) && dias >= 0 && dias <= 30 ? dias : 1;
  const result = await reportesService.proximasCitasAutomatizacion({ dias: safeDias });

  return res.json(result);
}));

module.exports = router;
