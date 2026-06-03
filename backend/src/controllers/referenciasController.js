const referenciasService = require('../services/referenciasService');

function handleError(res, err, fallbackMessage) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: fallbackMessage });
}

async function listar(req, res) {
  try {
    const referencias = await referenciasService.listarReferencias(req.params.pacienteId);
    return res.json(referencias);
  } catch (err) {
    return handleError(res, err, 'Error al listar referencias');
  }
}

async function guardar(req, res) {
  try {
    const referencia = await referenciasService.guardarReferencia({
      pacienteId: req.params.pacienteId,
      body: req.body,
      req,
    });
    return res.status(201).json(referencia);
  } catch (err) {
    return handleError(res, err, 'Error al guardar referencia');
  }
}

async function actualizar(req, res) {
  try {
    const result = await referenciasService.actualizarReferencia({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      body: req.body,
      req,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al actualizar referencia');
  }
}

async function eliminar(req, res) {
  try {
    const result = await referenciasService.eliminarReferencia({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      req,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al eliminar referencia');
  }
}

module.exports = {
  listar,
  guardar,
  actualizar,
  eliminar,
};
