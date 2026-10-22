const express = require('express');
const { asyncHandler } = require('../middleware/asyncHandler');
const { validateParams, validateQuery, validateBody } = require('../middleware/validate');
const { paramsSchema, controlParamsSchema, querySchema, bodySchema } = require('../validations/seguimientoNotas.schemas');

function createSeguimientoNotasRouter(service = require('../services/seguimientoNotasService')) {
  const router = express.Router({ mergeParams: true });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/seguimiento-notas', validateParams(paramsSchema), validateQuery(querySchema), asyncHandler(async (req, res) => {
    res.json(await service.listar({ pacienteId: req.params.pacienteId, query: req.query, req }));
  }));
  router.post('/:id/seguimiento-notas', validateParams(controlParamsSchema), validateBody(bodySchema), asyncHandler(async (req, res) => {
    res.json(await service.confirmar({ pacienteId: req.params.pacienteId, controlId: req.params.id, body: req.body, req }));
  }));
  return router;
}
module.exports = { createSeguimientoNotasRouter };
