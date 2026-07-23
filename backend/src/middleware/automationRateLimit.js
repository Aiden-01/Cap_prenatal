const { ipKeyGenerator, rateLimit } = require('express-rate-limit');
const { AppError } = require('../utils/appError');

function createAutomationRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator(req) {
      return ipKeyGenerator(req.automationOrigin);
    },
    handler(_req, _res, next) {
      return next(new AppError(
        429,
        'Demasiadas solicitudes de automatizacion',
        { code: 'AUTOMATION_RATE_LIMITED' }
      ));
    },
  });
}

module.exports = {
  createAutomationRateLimiter,
};
