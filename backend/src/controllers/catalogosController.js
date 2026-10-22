const { asyncHandler } = require('../middleware/asyncHandler');
function createCatalogosController(service) {
  return {
    listar: asyncHandler(async (req, res) => res.json(await service.listar(req.query))),
    obtener: asyncHandler(async (req, res) => res.json(await service.obtener(req.params.id))),
    crear: asyncHandler(async (req, res) => res.status(201).json(await service.crear(req.body, req))),
    actualizar: asyncHandler(async (req, res) => res.json(await service.actualizar(req.params.id, req.body, req))),
    desactivar: asyncHandler(async (req, res) => res.json(await service.estado(req.params.id, false, req))),
    reactivar: asyncHandler(async (req, res) => res.json(await service.estado(req.params.id, true, req))),
  };
}
module.exports = { createCatalogosController };
