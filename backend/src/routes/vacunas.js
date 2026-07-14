const express = require('express');
const { listar, antecedentes, obtener, guardar, actualizar, eliminar } = require('../controllers/vacunasController');
const { verificarPermiso } = require('../middleware/permisos');
const { validateBody, validateParams } = require('../middleware/validate');
const { nestedIdParams } = require('../validations/common.schemas');
const { vacunaSchema, vacunaUpdateSchema } = require('../validations/vacunas.schemas');

const router = express.Router({ mergeParams: true });

router.get('/',       verificarPermiso('pacientes.ver'), listar);
router.post('/',      verificarPermiso('controles.crear'), validateBody(vacunaSchema), guardar);
router.get('/antecedentes', verificarPermiso('pacientes.ver'), antecedentes);
router.get('/:id',    verificarPermiso('pacientes.ver'), validateParams(nestedIdParams), obtener);
router.put('/:id',    verificarPermiso('controles.editar'), validateParams(nestedIdParams), validateBody(vacunaUpdateSchema), actualizar);
router.delete('/:id', verificarPermiso('controles.editar'), validateParams(nestedIdParams), eliminar);

module.exports = router;
