const pacientesService = require('../services/pacientesService');
const { asyncHandler } = require('../middleware/asyncHandler');

// GET /api/pacientes?buscar=xxx&pagina=1&limite=20
const listar = asyncHandler(async (req, res) => {
  const result = await pacientesService.listarPacientes(req.query);
  return res.json(result);
});

// GET /api/pacientes/:id
const obtener = asyncHandler(async (req, res) => {
  const paciente = await pacientesService.obtenerPaciente(req.params.id);
  return res.json(paciente);
});

// POST /api/pacientes
const crear = asyncHandler(async (req, res) => {
  const paciente = await pacientesService.crearPaciente({ body: req.body, req });
  return res.status(201).json(paciente);
});

// PUT /api/pacientes/:id
const actualizar = asyncHandler(async (req, res) => {
  const result = await pacientesService.actualizarPaciente({
    id: req.params.id,
    body: req.body,
    req,
  });

  return res.json(result);
});

// GET /api/pacientes/:id/expediente
const expedienteCompleto = asyncHandler(async (req, res) => {
  const expediente = await pacientesService.expedienteCompleto(req.params.id);
  return res.json(expediente);
});

// GET /api/pacientes/:id/completitud
const completitudExpediente = asyncHandler(async (req, res) => {
  const completitud = await pacientesService.obtenerCompletitudExpediente(req.params.id);
  return res.json(completitud);
});

// POST /api/pacientes/:id/embarazos
const nuevoEmbarazo = asyncHandler(async (req, res) => {
  const embarazo = await pacientesService.nuevoEmbarazo({
    id: req.params.id,
    body: req.body || {},
    req,
  });

  return res.status(201).json(embarazo);
});

// POST /api/pacientes/:id/embarazo/puerperio
const pasarAPuerperio = asyncHandler(async (req, res) => {
  const embarazo = await pacientesService.pasarAPuerperio({
    id: req.params.id,
    body: req.body || {},
    req,
  });

  return res.json(embarazo);
});

// POST /api/pacientes/:id/embarazo/cerrar
const cerrarEmbarazo = asyncHandler(async (req, res) => {
  const embarazo = await pacientesService.cerrarEmbarazo({
    id: req.params.id,
    body: req.body || {},
    req,
  });

  return res.json(embarazo);
});

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  expedienteCompleto,
  completitudExpediente,
  nuevoEmbarazo,
  pasarAPuerperio,
  cerrarEmbarazo,
};
