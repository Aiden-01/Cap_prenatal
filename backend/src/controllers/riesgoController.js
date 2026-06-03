const riesgoService = require('../services/riesgoService');

function handleError(res, err, fallbackMessage) {
  if (err.status) return res.status(err.status).json({ error: err.message });

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Esta paciente ya tiene una ficha de riesgo registrada' });
  }

  console.error(err);
  return res.status(500).json({ error: fallbackMessage });
}

async function obtener(req, res) {
  try {
    const ficha = await riesgoService.obtenerFichaRiesgo(req.params.pacienteId);
    return res.json(ficha || null);
  } catch (err) {
    return handleError(res, err, 'Error al obtener ficha de riesgo');
  }
}

async function guardar(req, res) {
  try {
    const ficha = await riesgoService.guardarFichaRiesgo({
      pacienteId: req.params.pacienteId,
      body: req.body,
      req,
    });
    return res.json(ficha);
  } catch (err) {
    return handleError(res, err, 'Error al guardar ficha de riesgo');
  }
}

async function actualizar(req, res) {
  try {
    const ficha = await riesgoService.actualizarFichaRiesgo({
      pacienteId: req.params.pacienteId,
      body: req.body,
      req,
    });
    return res.json(ficha);
  } catch (err) {
    return handleError(res, err, 'Error al actualizar ficha de riesgo');
  }
}

async function eliminar(req, res) {
  try {
    const result = await riesgoService.eliminarFichaRiesgo({
      pacienteId: req.params.pacienteId,
      req,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al eliminar ficha de riesgo');
  }
}

module.exports = {
  obtener,
  guardar,
  actualizar,
  eliminar,
};
