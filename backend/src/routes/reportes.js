const express = require('express');
const defaultControllers = require('../controllers/reportesController');
const { authMiddleware } = require('../middleware/auth');
const { cargarPermisos, verificarPermiso } = require('../middleware/permisos');
const { validateQuery } = require('../middleware/validate');
const { periodoReportesQuerySchema, exportReportQuerySchema, exportPrimerControlQuerySchema } = require('../validations/reportes.schemas');

function createReportesRouter({
  controllers = defaultControllers,
  authenticate = authMiddleware,
  loadPermissions = cargarPermisos,
  checkPermission = verificarPermiso,
} = {}) {
  const router = express.Router();
  const exportHandler = (name, legacyName, viewName) => (
    controllers[name] || controllers[legacyName] || controllers[viewName]
  );
  router.use(authenticate);
  router.use(loadPermissions);

  router.get('/censo/primer-control',
    checkPermission('reportes.ver'),
    validateQuery(periodoReportesQuerySchema),
    controllers.censoMensualPrimerControl);
  router.get('/censo/primer-control/excel',
    checkPermission('reportes.exportar'),
    validateQuery(exportPrimerControlQuerySchema),
    exportHandler('exportarPrimerControlExcel', 'exportarCensoPrimerControlExcel', 'censoMensualPrimerControl'));
  router.get('/censo/primer-control/pdf',
    checkPermission('reportes.exportar'),
    validateQuery(exportPrimerControlQuerySchema),
    exportHandler('exportarPrimerControlPdf', 'exportarCensoPrimerControlPdf', 'censoMensualPrimerControl'));

  router.get('/censo', checkPermission('reportes.ver'), controllers.censoMensual);
  router.get('/censo/excel', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarActivosExcel', 'exportarCensoExcel', 'censoMensual'));
  router.get('/censo/pdf', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarActivosPdf', null, 'censoMensual'));
  router.get('/estadisticas', checkPermission('reportes.ver'), controllers.estadisticas);
  router.get('/pacientes-riesgo', checkPermission('reportes.ver'), controllers.pacientesConRiesgo);
  router.get('/pacientes-riesgo/excel', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarRiesgoExcel', null, 'pacientesConRiesgo'));
  router.get('/pacientes-riesgo/pdf', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarRiesgoPdf', null, 'pacientesConRiesgo'));
  router.get('/proximas-a-parir', checkPermission('reportes.ver'), controllers.proximasAParir);
  router.get('/proximas-a-parir/excel', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarProximasPartoExcel', null, 'proximasAParir'));
  router.get('/proximas-a-parir/pdf', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarProximasPartoPdf', null, 'proximasAParir'));
  router.get('/sin-control-reciente', checkPermission('reportes.ver'), controllers.sinControlReciente);
  router.get('/sin-control-reciente/excel', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarSinControlExcel', null, 'sinControlReciente'));
  router.get('/sin-control-reciente/pdf', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarSinControlPdf', null, 'sinControlReciente'));
  router.get('/resumen-comunidades', checkPermission('reportes.ver'), controllers.resumenPorComunidad);
  router.get('/resumen-comunidades/excel', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarComunidadesExcel', null, 'resumenPorComunidad'));
  router.get('/resumen-comunidades/pdf', checkPermission('reportes.exportar'), validateQuery(exportReportQuerySchema), exportHandler('exportarComunidadesPdf', null, 'resumenPorComunidad'));
  return router;
}

const router = createReportesRouter();
module.exports = router;
module.exports.createReportesRouter = createReportesRouter;
