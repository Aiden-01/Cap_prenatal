const express = require('express');
const defaultControllers = require('../controllers/reportesController');
const { authMiddleware } = require('../middleware/auth');
const { cargarPermisos, verificarPermiso } = require('../middleware/permisos');
const { validateQuery } = require('../middleware/validate');
const { periodoReportesQuerySchema } = require('../validations/reportes.schemas');

function createReportesRouter({
  controllers = defaultControllers,
  authenticate = authMiddleware,
  loadPermissions = cargarPermisos,
  checkPermission = verificarPermiso,
} = {}) {
  const router = express.Router();
  router.use(authenticate);
  router.use(loadPermissions);

  router.get('/censo/primer-control',
    checkPermission('reportes.ver'),
    validateQuery(periodoReportesQuerySchema),
    controllers.censoMensualPrimerControl);
  router.get('/censo/primer-control/excel',
    checkPermission('reportes.exportar'),
    validateQuery(periodoReportesQuerySchema),
    controllers.exportarCensoPrimerControlExcel);
  router.get('/censo/primer-control/pdf',
    checkPermission('reportes.exportar'),
    validateQuery(periodoReportesQuerySchema),
    controllers.exportarCensoPrimerControlPdf);

  router.get('/censo', checkPermission('reportes.ver'), controllers.censoMensual);
  router.get('/censo/excel', checkPermission('reportes.exportar'), controllers.exportarCensoExcel);
  router.get('/estadisticas', checkPermission('reportes.ver'), controllers.estadisticas);
  router.get('/pacientes-riesgo', checkPermission('reportes.ver'), controllers.pacientesConRiesgo);
  router.get('/proximas-a-parir', checkPermission('reportes.ver'), controllers.proximasAParir);
  router.get('/sin-control-reciente', checkPermission('reportes.ver'), controllers.sinControlReciente);
  router.get('/resumen-comunidades', checkPermission('reportes.ver'), controllers.resumenPorComunidad);
  return router;
}

const router = createReportesRouter();
module.exports = router;
module.exports.createReportesRouter = createReportesRouter;
