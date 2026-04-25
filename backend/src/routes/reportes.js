const express = require('express');
const {
  censoMensual,
  estadisticas,
  pacientesConRiesgo,
  exportarCensoExcel
} = require('../controllers/reportesController');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/censo',            censoMensual);
router.get('/estadisticas',     estadisticas);
router.get('/pacientes-riesgo', pacientesConRiesgo);
router.get('/censo/excel',      exportarCensoExcel);

module.exports = router;