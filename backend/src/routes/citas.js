const express = require('express');
const citasController = require('../controllers/citasPrenatalesController');
const { verificarPermiso } = require('../middleware/permisos');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { nestedIdParams, pacienteIdParam } = require('../validations/common.schemas');
const { citaQuerySchema, citaReprogramarSchema } = require('../validations/citas.schemas');

const router = express.Router({ mergeParams: true });

router.get(
  '/vigente',
  verificarPermiso('pacientes.ver'),
  validateParams(pacienteIdParam),
  validateQuery(citaQuerySchema),
  citasController.vigente
);
router.patch(
  '/:id/reprogramar',
  verificarPermiso('controles.editar'),
  validateParams(nestedIdParams),
  validateQuery(citaQuerySchema),
  validateBody(citaReprogramarSchema),
  citasController.reprogramar
);
router.patch(
  '/:id/cancelar',
  verificarPermiso('controles.editar'),
  validateParams(nestedIdParams),
  validateQuery(citaQuerySchema),
  citasController.cancelar
);

module.exports = router;
