const express = require('express');
const defaultControllers = require('../controllers/automatizacionesController');
const { createAutomationRateLimiter } = require('../middleware/automationRateLimit');
const {
  createAutomationAuthentication,
  createAutomationCensusPeriodMiddleware,
  createAutomationDispatchConfirmationMiddleware,
  createAutomationDispatchResolutionMiddleware,
  createAutomationEmptyQueryMiddleware,
  createAutomationMissedAppointmentsPeriodMiddleware,
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
  router.get('/censo-primer-control', automationNotFound);
  router.get('/censo-primer-control/excel', automationNotFound);
  router.get('/inasistencias', automationNotFound);
  router.post('/inasistencias/preparar', automationNotFound);
  router.post('/inasistencias/confirmar', automationNotFound);
  router.post('/inasistencias/resolver', automationNotFound);

  if (!config.active) {
    router.get('/v1/proximas-citas', automationNotFound);
    router.get('/v1/censo-primer-control', automationNotFound);
    router.get('/v1/censo-primer-control/excel', automationNotFound);
    router.get('/v1/inasistencias', automationNotFound);
    router.post('/v1/inasistencias/preparar', automationNotFound);
    router.post('/v1/inasistencias/confirmar', automationNotFound);
    router.post('/v1/inasistencias/resolver', automationNotFound);
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
  const validateCensusPeriod = createAutomationCensusPeriodMiddleware();
  const validateMissedAppointmentsPeriod = createAutomationMissedAppointmentsPeriodMiddleware();
  const validateEmptyQuery = createAutomationEmptyQueryMiddleware();
  const validateDispatchConfirmation = createAutomationDispatchConfirmationMiddleware();
  const validateDispatchResolution = createAutomationDispatchResolutionMiddleware();

  router.get(
    '/v1/proximas-citas',
    originMiddleware,
    limiter,
    authenticate,
    validateRange,
    controllers.proximasCitas
  );

  router.get(
    '/v1/censo-primer-control',
    originMiddleware,
    limiter,
    authenticate,
    validateCensusPeriod,
    controllers.censoPrimerControl
  );

  router.get(
    '/v1/censo-primer-control/excel',
    originMiddleware,
    limiter,
    authenticate,
    validateCensusPeriod,
    controllers.censoPrimerControlExcel
  );

  router.get(
    '/v1/inasistencias',
    originMiddleware,
    limiter,
    authenticate,
    validateMissedAppointmentsPeriod,
    controllers.inasistencias
  );

  router.post(
    '/v1/inasistencias/preparar',
    originMiddleware,
    limiter,
    authenticate,
    validateEmptyQuery,
    controllers.prepararInasistencias
  );

  router.post(
    '/v1/inasistencias/confirmar',
    originMiddleware,
    limiter,
    authenticate,
    validateEmptyQuery,
    validateDispatchConfirmation,
    controllers.confirmarInasistencias
  );

  router.post(
    '/v1/inasistencias/resolver',
    originMiddleware,
    limiter,
    authenticate,
    validateEmptyQuery,
    validateDispatchResolution,
    controllers.resolverInasistencias
  );

  return router;
}

module.exports = {
  automationNotFound,
  createAutomatizacionesRouter,
};
