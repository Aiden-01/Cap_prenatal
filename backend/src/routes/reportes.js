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

const router = express.Router();
router.use(authMiddleware);

router.get('/censo',            censoMensual);
router.get('/censo/primer-control', censoMensualPrimerControl);
router.get('/estadisticas',     estadisticas);
router.get('/pacientes-riesgo', pacientesConRiesgo);
router.get('/censo/excel',      exportarCensoExcel);
router.get('/censo/primer-control/excel', exportarCensoPrimerControlExcel);
router.get('/proximas-a-parir',    proximasAParir);
router.get('/sin-control-reciente',sinControlReciente);

module.exports = router;
