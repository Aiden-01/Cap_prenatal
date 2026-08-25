const citasPrenatalesService = require('../services/citasPrenatalesService');
const { asyncHandler } = require('../middleware/asyncHandler');

const vigente = asyncHandler(async (req, res) => {
  const cita = await citasPrenatalesService.obtenerCitaVigente({
    pacienteId: req.params.pacienteId,
    embarazoId: req.query.embarazo_id,
  });
  return res.json({ cita });
});

const reprogramar = asyncHandler(async (req, res) => {
  const resultado = await citasPrenatalesService.reprogramarCita({
    pacienteId: req.params.pacienteId,
    embarazoId: req.query.embarazo_id,
    citaId: req.params.id,
    fechaProgramada: req.body.fecha_programada,
    req,
  });
  return res.json(resultado);
});

const cancelar = asyncHandler(async (req, res) => {
  const resultado = await citasPrenatalesService.cancelarCita({
    pacienteId: req.params.pacienteId,
    embarazoId: req.query.embarazo_id,
    citaId: req.params.id,
    req,
  });
  return res.json(resultado);
});

module.exports = { cancelar, reprogramar, vigente };
