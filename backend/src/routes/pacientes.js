const express = require('express');
const { listar, obtener, crear, actualizar, expedienteCompleto } = require('../controllers/pacientesController');
const { authMiddleware } = require('../middleware/auth');

// Sub-routers
const controlesRouter = require('./controles');
const riesgoRouter = require('./riesgo');
const laboratorioRouter = require('./laboratorio');

const router = express.Router();
router.use(authMiddleware);

router.get('/',        listar);
router.post('/',       crear);
router.get('/:id',     obtener);
router.put('/:id',     actualizar);
router.get('/:id/expediente', expedienteCompleto);

// Sub-rutas anidadas bajo /pacientes/:pacienteId/...
router.use('/:pacienteId/controles',   controlesRouter);
router.use('/:pacienteId/riesgo',      riesgoRouter);
router.use('/:pacienteId/laboratorio', laboratorioRouter);

module.exports = router;
