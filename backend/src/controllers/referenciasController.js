const referenciasService = require('../services/referenciasService');
const { asyncHandler } = require('../middleware/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const referencias = await referenciasService.listarReferencias(req.params.pacienteId);
  return res.json(referencias);
});

const guardar = asyncHandler(async (req, res) => {
  const referencia = await referenciasService.guardarReferencia({
    pacienteId: req.params.pacienteId,
    body: req.body,
    req,
  });

  return res.status(201).json(referencia);
});

const actualizar = asyncHandler(async (req, res) => {
  const result = await referenciasService.actualizarReferencia({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
    body: req.body,
    req,
  });

  return res.json(result);
});

const eliminar = asyncHandler(async (req, res) => {
  const result = await referenciasService.eliminarReferencia({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
    req,
  });

  return res.json(result);
});

module.exports = {
  listar,
  guardar,
  actualizar,
  eliminar,
};
