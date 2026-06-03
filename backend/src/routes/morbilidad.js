const express = require('express');
const { listar, obtener, guardar, actualizar, eliminar } = require('../controllers/morbilidadController');
const { validateBody, validateParams } = require('../middleware/validate');
const { nestedIdParams } = require('../validations/common.schemas');
const {
  morbilidadCreateSchema,
  morbilidadUpdateSchema,
} = require('../validations/morbilidad.schemas');

const router = express.Router({ mergeParams: true });

router.get('/',      listar);
router.post('/',     validateBody(morbilidadCreateSchema), guardar);
router.get('/:id',   validateParams(nestedIdParams), obtener);
router.put('/:id',   validateParams(nestedIdParams), validateBody(morbilidadUpdateSchema), actualizar);
router.delete('/:id',validateParams(nestedIdParams), eliminar);

module.exports = router;
