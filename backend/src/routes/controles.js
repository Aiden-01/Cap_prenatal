const express = require('express');
const controlesPrenatalesController = require('../controllers/controlesPrenatalesController');
const planPartoController = require('../controllers/planPartoController');
const puerperioController = require('../controllers/puerperioController');
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

// Plan de parto (1 por paciente)
router.get('/plan-parto',  planPartoController.obtenerPlanParto);
router.post('/plan-parto', validateBody(planPartoSchema), planPartoController.guardarPlanParto);

// Puerperio (1a y 2a atencion)
router.get('/puerperio',        puerperioController.listarPuerperio);
router.post('/puerperio',       validateBody(puerperioCreateSchema), puerperioController.guardarPuerperio);
router.get('/puerperio/:id',    validateParams(nestedIdParams), puerperioController.obtenerPuerperio);
router.put('/puerperio/:id',    validateParams(nestedIdParams), validateBody(puerperioUpdateSchema), puerperioController.actualizarPuerperio);
router.delete('/puerperio/:id', validateParams(nestedIdParams), puerperioController.eliminarPuerperio);

// Controles prenatales
router.get('/',       controlesPrenatalesController.listar);
router.post('/',      validateBody(controlCreateSchema), controlesPrenatalesController.crear);
router.get('/:id',    validateParams(nestedIdParams), controlesPrenatalesController.obtener);
router.put('/:id',    validateParams(nestedIdParams), validateBody(controlUpdateSchema), controlesPrenatalesController.actualizar);
router.delete('/:id', validateParams(nestedIdParams), controlesPrenatalesController.eliminar);

module.exports = router;
