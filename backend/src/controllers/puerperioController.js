const puerperioService = require('../services/puerperioService');
const { asyncHandler } = require('../middleware/asyncHandler');

const listarPuerperio = asyncHandler(async (req, res) => {
  const controles = await puerperioService.listarPuerperio(req.params.pacienteId);
  return res.json(controles);
});

const obtenerPuerperio = asyncHandler(async (req, res) => {
  const control = await puerperioService.obtenerPuerperio({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
  });

  return res.json(control);
});

const guardarPuerperio = asyncHandler(async (req, res) => {
  const control = await puerperioService.guardarPuerperio({
    pacienteId: req.params.pacienteId,
    body: req.body,
    req,
  });

  return res.status(201).json(control);
});

const actualizarPuerperio = asyncHandler(async (req, res) => {
  const control = await puerperioService.actualizarPuerperio({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
    body: req.body,
    req,
  });

  return res.json(control);
});

const eliminarPuerperio = asyncHandler(async (req, res) => {
  const result = await puerperioService.eliminarPuerperio({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
    req,
  });

  return res.json(result);
});

module.exports = {
  listarPuerperio,
  obtenerPuerperio,
  guardarPuerperio,
  actualizarPuerperio,
  eliminarPuerperio,
};
