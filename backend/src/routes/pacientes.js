const express = require('express');
const {
  listar,
  obtener,
  crear,
  actualizar,
  expedienteCompleto,
  completitudExpediente,
  nuevoEmbarazo,
  pasarAPuerperio,
  cerrarEmbarazo,
} =
  require('../controllers/pacientesController');
const { authMiddleware } = require('../middleware/auth');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { pacienteRootIdParam, pacienteIdParam } = require('../validations/common.schemas');
const {
  pacienteCreateSchema,
  pacienteUpdateSchema,
  pacienteListQuerySchema,
  embarazoBodySchema,
} = require('../validations/pacientes.schemas');

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
router.get('/', validateQuery(pacienteListQuerySchema), listar);
router.post('/', validateBody(pacienteCreateSchema), crear);
router.get('/:id', validateParams(pacienteRootIdParam), obtener);
router.put('/:id', validateParams(pacienteRootIdParam), validateBody(pacienteUpdateSchema), actualizar);
router.get('/:id/expediente', validateParams(pacienteRootIdParam), expedienteCompleto);
router.get('/:id/completitud', validateParams(pacienteRootIdParam), completitudExpediente);
router.post('/:id/embarazos', validateParams(pacienteRootIdParam), validateBody(embarazoBodySchema), nuevoEmbarazo);
router.post('/:id/embarazo/puerperio', validateParams(pacienteRootIdParam), validateBody(embarazoBodySchema), pasarAPuerperio);
router.post('/:id/embarazo/cerrar', validateParams(pacienteRootIdParam), validateBody(embarazoBodySchema), cerrarEmbarazo);

// Sub-rutas anidadas bajo /pacientes/:pacienteId/...
router.use('/:pacienteId/controles', validateParams(pacienteIdParam), controlesRouter);
router.use('/:pacienteId/riesgo', validateParams(pacienteIdParam), riesgoRouter);
router.use('/:pacienteId/morbilidad', validateParams(pacienteIdParam), morbilidadRouter);
router.use('/:pacienteId/vacunas', validateParams(pacienteIdParam), vacunasRouter);
router.use('/:pacienteId/referencias', validateParams(pacienteIdParam), referenciasRouter);
router.use('/:pacienteId',             pdfRouter);

module.exports = router;
