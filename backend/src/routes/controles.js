const express = require('express');
const {
  obtenerPlanParto, guardarPlanParto,
  listarPuerperio, obtenerPuerperio, guardarPuerperio, actualizarPuerperio, eliminarPuerperio,
} = require('../controllers/controlesController');
const controlesPrenatalesController = require('../controllers/controlesPrenatalesController');
const { validateBody, validateParams } = require('../middleware/validate');
const { nestedIdParams } = require('../validations/common.schemas');
const {
  controlCreateSchema,
  controlUpdateSchema,
  puerperioCreateSchema,
  puerperioUpdateSchema,
} = require('../validations/controles.schemas');

const router = express.Router({ mergeParams: true });

// Plan de parto (1 por paciente)
router.get('/plan-parto',  obtenerPlanParto);
router.post('/plan-parto', guardarPlanParto);

// Puerperio (1a y 2a atencion)
router.get('/puerperio',        listarPuerperio);
router.post('/puerperio',       validateBody(puerperioCreateSchema), guardarPuerperio);
router.get('/puerperio/:id',    validateParams(nestedIdParams), obtenerPuerperio);
router.put('/puerperio/:id',    validateParams(nestedIdParams), validateBody(puerperioUpdateSchema), actualizarPuerperio);
router.delete('/puerperio/:id', validateParams(nestedIdParams), eliminarPuerperio);

// Controles prenatales
router.get('/',       controlesPrenatalesController.listar);
router.post('/',      validateBody(controlCreateSchema), controlesPrenatalesController.crear);
router.get('/:id',    validateParams(nestedIdParams), controlesPrenatalesController.obtener);
router.put('/:id',    validateParams(nestedIdParams), validateBody(controlUpdateSchema), controlesPrenatalesController.actualizar);
router.delete('/:id', validateParams(nestedIdParams), controlesPrenatalesController.eliminar);

module.exports = router;
