const planPartoService = require('../services/planPartoService');

function handleError(res, err, fallbackMessage) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: fallbackMessage });
}

async function obtenerPlanParto(req, res) {
  try {
    const plan = await planPartoService.obtenerPlanParto(req.params.pacienteId);
    return res.json(plan || null);
  } catch (err) {
    return handleError(res, err, 'Error al obtener plan de parto');
  }
}

async function guardarPlanParto(req, res) {
  try {
    const plan = await planPartoService.guardarPlanParto({
      pacienteId: req.params.pacienteId,
      body: req.body,
      req,
    });
    return res.json(plan);
  } catch (err) {
    return handleError(res, err, 'Error al guardar plan de parto');
  }
}

module.exports = {
  obtenerPlanParto,
  guardarPlanParto,
};
