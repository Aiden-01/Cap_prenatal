const { asyncHandler } = require('../middleware/asyncHandler');

function createNotasClinicasController(service) {
  const contexto = req => ({ pacienteId: req.params.pacienteId, notaId: req.params.notaId, req });
  return {
    listar: asyncHandler(async (req, res) => res.json(await service.listarNotas({ ...contexto(req), query: req.query }))),
    obtener: asyncHandler(async (req, res) => res.json(await service.obtenerNota(contexto(req)))),
    crear: asyncHandler(async (req, res) => {
      const result = await service.crearBorrador({ ...contexto(req), body: req.body });
      return res.status(result.reutilizada ? 200 : 201).json(result.nota);
    }),
    actualizar: asyncHandler(async (req, res) => res.json(await service.actualizarBorrador({ ...contexto(req), body: req.body }))),
    finalizar: asyncHandler(async (req, res) => res.json(await service.finalizarCaptura({ ...contexto(req), body: req.body }))),
  };
}

module.exports = { createNotasClinicasController };
