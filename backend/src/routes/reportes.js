const express = require('express');
const {
  censoMensual,
  censoMensualPrimerControl,
  estadisticas,
  pacientesConRiesgo,
  exportarCensoExcel,
  exportarCensoPrimerControlExcel,
  proximasAParir,
  sinControlReciente,
} = require('../controllers/reportesController');

const { authMiddleware } = require('../middleware/auth');
const { cargarPermisos, verificarPermiso } = require('../middleware/permisos');

const router = express.Router();
router.use(authMiddleware);
router.use(cargarPermisos);

router.get('/censo',            verificarPermiso('reportes.ver'), censoMensual);
router.get('/censo/primer-control', verificarPermiso('reportes.ver'), censoMensualPrimerControl);
router.get('/estadisticas',     verificarPermiso('reportes.ver'), estadisticas);
router.get('/pacientes-riesgo', verificarPermiso('reportes.ver'), pacientesConRiesgo);
router.get('/censo/excel',      verificarPermiso('reportes.exportar'), exportarCensoExcel);
router.get('/censo/primer-control/excel', verificarPermiso('reportes.exportar'), exportarCensoPrimerControlExcel);
router.get('/proximas-a-parir',    verificarPermiso('reportes.ver'), proximasAParir);
router.get('/sin-control-reciente',verificarPermiso('reportes.ver'), sinControlReciente);

module.exports = router;
