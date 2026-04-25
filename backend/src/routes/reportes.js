const express = require('express');
const { censoMensual, estadisticas, pacientesConRiesgo } = require('../controllers/reportesController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/censo',            censoMensual);       // ?mes=4&anio=2025
router.get('/estadisticas',     estadisticas);
router.get('/pacientes-riesgo', pacientesConRiesgo);

module.exports = router;
