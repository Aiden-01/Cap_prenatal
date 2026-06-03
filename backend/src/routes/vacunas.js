const express = require('express');
const { listar, obtener, guardar, actualizar, eliminar } = require('../controllers/vacunasController');
const { validateBody, validateParams } = require('../middleware/validate');
const { nestedIdParams } = require('../validations/common.schemas');
const { vacunaSchema, vacunaUpdateSchema } = require('../validations/vacunas.schemas');

const router = express.Router({ mergeParams: true });

router.get('/',       listar);
router.post('/',      validateBody(vacunaSchema), guardar);
router.get('/:id',    validateParams(nestedIdParams), obtener);
router.put('/:id',    validateParams(nestedIdParams), validateBody(vacunaUpdateSchema), actualizar);
router.delete('/:id', validateParams(nestedIdParams), eliminar);

module.exports = router;
