const express = require('express');
const controlesPrenatalesController = require('../controllers/controlesPrenatalesController');
const planPartoController = require('../controllers/planPartoController');
const puerperioController = require('../controllers/puerperioController');
const { verificarPermiso } = require('../middleware/permisos');
const { validateBody, validateParams } = require('../middleware/validate');
const { nestedIdParams } = require('../validations/common.schemas');
const {
  controlCreateSchema,
  controlUpdateSchema,
  planPartoSchema,
  puerperioCreateSchema,
  puerperioUpdateSchema,
} = require('../validations/controles.schemas');

const router = express.Router({ mergeParams: true });

// Plan de parto (1 por embarazo activo)
router.get('/plan-parto', verificarPermiso('pacientes.ver'), planPartoController.obtenerPlanParto);
router.post(
  '/plan-parto',
  verificarPermiso('controles.crear'),
  verificarPermiso('controles.editar'),
  validateBody(planPartoSchema),
  planPartoController.guardarPlanParto
);

// Puerperio (1a y 2a atencion)
router.get('/puerperio',        verificarPermiso('pacientes.ver'), puerperioController.listarPuerperio);
router.post(
  '/puerperio',
  verificarPermiso('controles.crear'),
  verificarPermiso('controles.editar'),
  validateBody(puerperioCreateSchema),
  puerperioController.guardarPuerperio
);
router.get('/puerperio/:id',    verificarPermiso('pacientes.ver'), validateParams(nestedIdParams), puerperioController.obtenerPuerperio);
router.put('/puerperio/:id',    verificarPermiso('controles.editar'), validateParams(nestedIdParams), validateBody(puerperioUpdateSchema), puerperioController.actualizarPuerperio);
router.delete('/puerperio/:id', verificarPermiso('controles.editar'), validateParams(nestedIdParams), puerperioController.eliminarPuerperio);

// Controles prenatales
router.get('/',       verificarPermiso('pacientes.ver'), controlesPrenatalesController.listar);
router.post('/',      verificarPermiso('controles.crear'), validateBody(controlCreateSchema), controlesPrenatalesController.crear);
router.get('/:id',    verificarPermiso('pacientes.ver'), validateParams(nestedIdParams), controlesPrenatalesController.obtener);
router.put('/:id',    verificarPermiso('controles.editar'), validateParams(nestedIdParams), validateBody(controlUpdateSchema), controlesPrenatalesController.actualizar);
router.delete('/:id', verificarPermiso('controles.editar'), validateParams(nestedIdParams), controlesPrenatalesController.eliminar);

module.exports = router;
