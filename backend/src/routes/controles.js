const express = require('express');
const {
  listar, obtener, crear, actualizar, eliminar,
  obtenerPlanParto, guardarPlanParto,
  listarPuerperio, obtenerPuerperio, guardarPuerperio, actualizarPuerperio, eliminarPuerperio,
} = require('../controllers/controlesController');
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
router.get('/',       listar);
router.post('/',      validateBody(controlCreateSchema), crear);
router.get('/:id',    validateParams(nestedIdParams), obtener);
router.put('/:id',    validateParams(nestedIdParams), validateBody(controlUpdateSchema), actualizar);
router.delete('/:id', validateParams(nestedIdParams), eliminar);

module.exports = router;
