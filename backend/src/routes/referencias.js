const express = require('express');
const { listar, guardar, actualizar, eliminar } = require('../controllers/referenciasController');
const { verificarPermiso } = require('../middleware/permisos');
const { validateBody, validateParams } = require('../middleware/validate');
const { nestedIdParams } = require('../validations/common.schemas');
const {
  referenciaCreateSchema,
  referenciaUpdateSchema,
} = require('../validations/referencias.schemas');

const router = express.Router({ mergeParams: true });

// Pendiente de dominio: las referencias pertenecen a la paciente, no a un
// embarazo especifico. Esta tarea no agrega embarazo_id ni cambia la tabla.
router.get('/',       verificarPermiso('pacientes.ver'), listar);
router.post('/',      verificarPermiso('controles.crear'), validateBody(referenciaCreateSchema), guardar);
router.put('/:id',    verificarPermiso('controles.editar'), validateParams(nestedIdParams), validateBody(referenciaUpdateSchema), actualizar);
router.delete('/:id', verificarPermiso('controles.editar'), validateParams(nestedIdParams), eliminar);

module.exports = router;
