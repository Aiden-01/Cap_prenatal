const planPartoService = require('../services/planPartoService');
const { asyncHandler } = require('../middleware/asyncHandler');

const obtenerPlanParto = asyncHandler(async (req, res) => {
  const plan = await planPartoService.obtenerPlanParto(req.params.pacienteId);
  return res.json(plan || null);
});

const guardarPlanParto = asyncHandler(async (req, res) => {
  const plan = await planPartoService.guardarPlanParto({
    pacienteId: req.params.pacienteId,
    body: req.body,
    req,
  });

  return res.json(plan);
});

module.exports = {
  obtenerPlanParto,
  guardarPlanParto,
};
