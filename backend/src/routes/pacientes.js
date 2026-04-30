const express = require('express');
const { listar, obtener, crear, actualizar, expedienteCompleto, nuevoEmbarazo } =
  require('../controllers/pacientesController');
const { authMiddleware } = require('../middleware/auth');

// Sub-routers
const controlesRouter    = require('./controles');
const riesgoRouter       = require('./riesgo');
const morbilidadRouter   = require('./morbilidad');
const vacunasRouter      = require('./vacunas');
const referenciasRouter  = require('./referencias');
const pdfRouter          = require('./pdf');

const router = express.Router();
router.use(authMiddleware);

// Rutas de pacientes
router.get('/',                   listar);
router.post('/',                  crear);
router.get('/:id',                obtener);
router.put('/:id',                actualizar);
router.get('/:id/expediente',     expedienteCompleto);
router.post('/:id/embarazos',     nuevoEmbarazo);

// Sub-rutas anidadas bajo /pacientes/:pacienteId/...
router.use('/:pacienteId/controles',   controlesRouter);
router.use('/:pacienteId/riesgo',      riesgoRouter);
router.use('/:pacienteId/morbilidad',  morbilidadRouter);
router.use('/:pacienteId/vacunas',     vacunasRouter);
router.use('/:pacienteId/referencias', referenciasRouter);
router.use('/:pacienteId',             pdfRouter);

module.exports = router;
