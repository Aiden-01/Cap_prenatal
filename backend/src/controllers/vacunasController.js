const vacunasService = require('../services/vacunasService');

function handleError(res, err, fallbackMessage) {
  if (err.status) return res.status(err.status).json({ error: err.message });

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe una vacuna con esos datos para esta paciente' });
  }

  console.error(err);
  return res.status(500).json({ error: fallbackMessage });
}

async function listar(req, res) {
  try {
    const vacunas = await vacunasService.listarVacunas(req.params.pacienteId);
    return res.json(vacunas);
  } catch (err) {
    return handleError(res, err, 'Error al listar vacunas');
  }
}

async function obtener(req, res) {
  try {
    const vacuna = await vacunasService.obtenerVacuna({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
    });
    return res.json(vacuna);
  } catch (err) {
    return handleError(res, err, 'Error al obtener vacuna');
  }
}

async function guardar(req, res) {
  try {
    const vacuna = await vacunasService.guardarVacuna({
      pacienteId: req.params.pacienteId,
      body: req.body,
      req,
    });
    return res.status(201).json(vacuna);
  } catch (err) {
    return handleError(res, err, 'Error al guardar vacuna');
  }
}

async function actualizar(req, res) {
  try {
    const vacuna = await vacunasService.actualizarVacuna({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      body: req.body,
      req,
    });
    return res.json(vacuna);
  } catch (err) {
    return handleError(res, err, 'Error al actualizar vacuna');
  }
}

async function eliminar(req, res) {
  try {
    const result = await vacunasService.eliminarVacuna({
      pacienteId: req.params.pacienteId,
      id: req.params.id,
      req,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al eliminar vacuna');
  }
}

module.exports = {
  listar,
  obtener,
  guardar,
  actualizar,
  eliminar,
};
