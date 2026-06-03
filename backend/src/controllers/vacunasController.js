const vacunasService = require('../services/vacunasService');
const { asyncHandler } = require('../middleware/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const vacunas = await vacunasService.listarVacunas(req.params.pacienteId);
  return res.json(vacunas);
});

const obtener = asyncHandler(async (req, res) => {
  const vacuna = await vacunasService.obtenerVacuna({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
  });

  return res.json(vacuna);
});

const guardar = asyncHandler(async (req, res) => {
  const vacuna = await vacunasService.guardarVacuna({
    pacienteId: req.params.pacienteId,
    body: req.body,
    req,
  });

  return res.status(201).json(vacuna);
});

const actualizar = asyncHandler(async (req, res) => {
  const vacuna = await vacunasService.actualizarVacuna({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
    body: req.body,
    req,
  });

  return res.json(vacuna);
});

const eliminar = asyncHandler(async (req, res) => {
  const result = await vacunasService.eliminarVacuna({
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
