const laboratorioService = require('../services/laboratorioService');
const { asyncHandler } = require('../middleware/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const laboratorios = await laboratorioService.listarLaboratorios(req.params.pacienteId);
  return res.json(laboratorios);
});

const guardar = asyncHandler(async (req, res) => {
  const laboratorio = await laboratorioService.guardarLaboratorio({
    pacienteId: req.params.pacienteId,
    body: req.body,
    req,
  });

  return res.json(laboratorio);
});

module.exports = {
  listar,
  guardar,
};
