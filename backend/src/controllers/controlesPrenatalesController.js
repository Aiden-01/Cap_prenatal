const controlesPrenatalesService = require('../services/controlesPrenatalesService');

function handleError(res, err, fallbackMessage) {
  if (err.status) return res.status(err.status).json({ error: err.message });

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un control con ese numero para esta paciente' });
  }

  console.error(err);
  return res.status(500).json({ error: fallbackMessage });
}

async function listar(req, res) {
  try {
    const controles = await controlesPrenatalesService.listarControles(req.params.pacienteId);
    return res.json(controles);
  } catch (err) {
    return handleError(res, err, 'Error al listar controles');
  }
}

async function obtener(req, res) {
  try {
    const control = await controlesPrenatalesService.obtenerControl({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
    });
    return res.json(control);
  } catch (err) {
    return handleError(res, err, 'Error al obtener control');
  }
}

async function crear(req, res) {
  try {
    const control = await controlesPrenatalesService.crearControl({
      pacienteId: req.params.pacienteId,
      body: req.body,
      req,
    });
    return res.status(201).json(control);
  } catch (err) {
    return handleError(res, err, 'Error al guardar control prenatal');
  }
}

async function actualizar(req, res) {
  try {
    const control = await controlesPrenatalesService.actualizarControl({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      body: req.body,
      req,
    });
    return res.json(control);
  } catch (err) {
    return handleError(res, err, 'Error al actualizar control prenatal');
  }
}

async function eliminar(req, res) {
  try {
    const result = await controlesPrenatalesService.eliminarControl({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      req,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al eliminar control prenatal');
  }
}

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
};
