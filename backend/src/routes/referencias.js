const express = require('express');
const { listar, guardar, actualizar, eliminar } = require('../controllers/referenciasController');
const { validateBody, validateParams } = require('../middleware/validate');
const { nestedIdParams } = require('../validations/common.schemas');
const {
  referenciaCreateSchema,
  referenciaUpdateSchema,
} = require('../validations/referencias.schemas');

const router = express.Router({ mergeParams: true });

router.get('/',       listar);
router.post('/',      validateBody(referenciaCreateSchema), guardar);
router.put('/:id',    validateParams(nestedIdParams), validateBody(referenciaUpdateSchema), actualizar);
router.delete('/:id', validateParams(nestedIdParams), eliminar);

module.exports = router;
