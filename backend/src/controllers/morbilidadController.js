const morbilidadService = require('../services/morbilidadService');
const { asyncHandler } = require('../middleware/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const registros = await morbilidadService.listarMorbilidad(req.params.pacienteId);
  return res.json(registros);
});

const obtener = asyncHandler(async (req, res) => {
  const registro = await morbilidadService.obtenerMorbilidad({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
  });

  return res.json(registro);
});

const guardar = asyncHandler(async (req, res) => {
  const registro = await morbilidadService.guardarMorbilidad({
    pacienteId: req.params.pacienteId,
    body: req.body,
    req,
  });

  return res.status(201).json(registro);
});

const actualizar = asyncHandler(async (req, res) => {
  const result = await morbilidadService.actualizarMorbilidad({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
    body: req.body,
    req,
  });

  return res.json(result);
});

const eliminar = asyncHandler(async (req, res) => {
  const result = await morbilidadService.eliminarMorbilidad({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
    req,
  });

  return res.json(result);
});

module.exports = {
  listar,
  obtener,
  guardar,
  actualizar,
  eliminar,
};
