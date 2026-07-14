const express = require('express');
const { listar, obtener, guardar, actualizar, eliminar } = require('../controllers/morbilidadController');
const { verificarPermiso } = require('../middleware/permisos');
const { validateBody, validateParams } = require('../middleware/validate');
const { nestedIdParams } = require('../validations/common.schemas');
const {
  morbilidadCreateSchema,
  morbilidadUpdateSchema,
} = require('../validations/morbilidad.schemas');

const router = express.Router({ mergeParams: true });

router.get('/',      verificarPermiso('pacientes.ver'), listar);
router.post('/',     verificarPermiso('controles.crear'), validateBody(morbilidadCreateSchema), guardar);
router.get('/:id',   verificarPermiso('pacientes.ver'), validateParams(nestedIdParams), obtener);
router.put('/:id',   verificarPermiso('controles.editar'), validateParams(nestedIdParams), validateBody(morbilidadUpdateSchema), actualizar);
router.delete('/:id',verificarPermiso('controles.editar'), validateParams(nestedIdParams), eliminar);

module.exports = router;
