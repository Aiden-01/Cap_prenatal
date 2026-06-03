const morbilidadService = require('../services/morbilidadService');

function handleError(res, err, fallbackMessage) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: fallbackMessage });
}

async function listar(req, res) {
  try {
    const registros = await morbilidadService.listarMorbilidad(req.params.pacienteId);
    return res.json(registros);
  } catch (err) {
    return handleError(res, err, 'Error al listar morbilidad');
  }
}

async function obtener(req, res) {
  try {
    const registro = await morbilidadService.obtenerMorbilidad({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
    });
    return res.json(registro);
  } catch (err) {
    return handleError(res, err, 'Error al obtener registro');
  }
}

async function guardar(req, res) {
  try {
    const registro = await morbilidadService.guardarMorbilidad({
      pacienteId: req.params.pacienteId,
      body: req.body,
      req,
    });
    return res.status(201).json(registro);
  } catch (err) {
    return handleError(res, err, 'Error al guardar morbilidad');
  }
}

async function actualizar(req, res) {
  try {
    const result = await morbilidadService.actualizarMorbilidad({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      body: req.body,
      req,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al actualizar registro');
  }
}

async function eliminar(req, res) {
  try {
    const result = await morbilidadService.eliminarMorbilidad({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      req,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al eliminar registro');
  }
}

module.exports = {
  listar,
  obtener,
  guardar,
  actualizar,
  eliminar,
};
