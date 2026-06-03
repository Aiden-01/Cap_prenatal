const puerperioService = require('../services/puerperioService');

function handleError(res, err, fallbackMessage) {
  if (err.status) return res.status(err.status).json({ error: err.message });

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe esa atencion de puerperio para esta paciente' });
  }

  console.error(err);
  return res.status(500).json({ error: fallbackMessage });
}

async function listarPuerperio(req, res) {
  try {
    const controles = await puerperioService.listarPuerperio(req.params.pacienteId);
    return res.json(controles);
  } catch (err) {
    return handleError(res, err, 'Error al listar controles de puerperio');
  }
}

async function obtenerPuerperio(req, res) {
  try {
    const control = await puerperioService.obtenerPuerperio({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
    });
    return res.json(control);
  } catch (err) {
    return handleError(res, err, 'Error al obtener control de puerperio');
  }
}

async function guardarPuerperio(req, res) {
  try {
    const control = await puerperioService.guardarPuerperio({
      pacienteId: req.params.pacienteId,
      body: req.body,
      req,
    });
    return res.status(201).json(control);
  } catch (err) {
    return handleError(res, err, 'Error al guardar control de puerperio');
  }
}

async function actualizarPuerperio(req, res) {
  try {
    const control = await puerperioService.actualizarPuerperio({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      body: req.body,
      req,
    });
    return res.json(control);
  } catch (err) {
    return handleError(res, err, 'Error al actualizar control de puerperio');
  }
}

async function eliminarPuerperio(req, res) {
  try {
    const result = await puerperioService.eliminarPuerperio({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      req,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al eliminar control de puerperio');
  }
}

module.exports = {
  listarPuerperio,
  obtenerPuerperio,
  guardarPuerperio,
  actualizarPuerperio,
  eliminarPuerperio,
};
