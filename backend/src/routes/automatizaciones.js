const express = require('express');
const defaultControllers = require('../controllers/automatizacionesController');
const { createAutomationRateLimiter } = require('../middleware/automationRateLimit');
const {
  createAutomationAuthentication,
  createAutomationOriginMiddleware,
  createAutomationRangeMiddleware,
} = require('../middleware/automationSecurity');

function automationNotFound(_req, res) {
  return res.status(404).json({
    ok: false,
    message: 'Ruta no encontrada',
    code: 'ROUTE_NOT_FOUND',
  });
}

function createAutomatizacionesRouter({
  config,
  controllers = defaultControllers,
  resolveOrigin,
  rateLimiter,
} = {}) {
  if (!config) throw new TypeError('La configuracion de automatizaciones es obligatoria');
  const router = express.Router();

  router.get('/proximas-citas', automationNotFound);

  if (!config.active) {
    router.get('/v1/proximas-citas', automationNotFound);
    return router;
  }

  const originMiddleware = createAutomationOriginMiddleware({
    allowedCidrs: config.allowedCidrs,
    resolveOrigin,
  });
  const limiter = rateLimiter || createAutomationRateLimiter({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
  });
  const authenticate = createAutomationAuthentication({
    currentHash: config.currentHash,
    nextHash: config.nextHash,
  });
  const validateRange = createAutomationRangeMiddleware(config);

  router.get(
    '/v1/proximas-citas',
    originMiddleware,
    limiter,
    authenticate,
    validateRange,
    controllers.proximasCitas
  );

  return router;
}

module.exports = {
  automationNotFound,
  createAutomatizacionesRouter,
};
