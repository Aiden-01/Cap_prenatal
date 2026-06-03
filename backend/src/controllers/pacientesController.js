const pacientesService = require('../services/pacientesService');

function handleError(res, err, fallbackMessage) {
  console.error(err);

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err.code === '23505') {
    if (err.constraint === 'ux_pacientes_cui_unico') {
      return res.status(409).json({ error: 'Ya existe una paciente registrada con ese CUI' });
    }
    return res.status(409).json({ error: 'Ya existe un expediente con ese numero' });
  }

  return res.status(500).json({ error: fallbackMessage });
}

// GET /api/pacientes?buscar=xxx&pagina=1&limite=20
async function listar(req, res) {
  try {
    const result = await pacientesService.listarPacientes(req.query);
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al listar pacientes');
  }
}

// GET /api/pacientes/:id
async function obtener(req, res) {
  try {
    const paciente = await pacientesService.obtenerPaciente(req.params.id);
    return res.json(paciente);
  } catch (err) {
    return handleError(res, err, 'Error al obtener paciente');
  }
}

// POST /api/pacientes
async function crear(req, res) {
  try {
    const paciente = await pacientesService.crearPaciente({ body: req.body, req });
    return res.status(201).json(paciente);
  } catch (err) {
    return handleError(res, err, 'Error al crear paciente');
  }
}

// PUT /api/pacientes/:id
async function actualizar(req, res) {
  try {
    const result = await pacientesService.actualizarPaciente({
      id: req.params.id,
      body: req.body,
      req,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Error al actualizar paciente');
  }
}

// GET /api/pacientes/:id/expediente
async function expedienteCompleto(req, res) {
  try {
    const expediente = await pacientesService.expedienteCompleto(req.params.id);
    return res.json(expediente);
  } catch (err) {
    return handleError(res, err, 'Error al obtener expediente');
  }
}

// POST /api/pacientes/:id/embarazos
async function nuevoEmbarazo(req, res) {
  try {
    const embarazo = await pacientesService.nuevoEmbarazo({
      id: req.params.id,
      body: req.body || {},
      req,
    });
    return res.status(201).json(embarazo);
  } catch (err) {
    return handleError(res, err, 'Error al crear nuevo embarazo');
  }
}

// POST /api/pacientes/:id/embarazo/puerperio
async function pasarAPuerperio(req, res) {
  try {
    const embarazo = await pacientesService.pasarAPuerperio({
      id: req.params.id,
      body: req.body || {},
      req,
    });
    return res.json(embarazo);
  } catch (err) {
    return handleError(res, err, 'Error al pasar embarazo a puerperio');
  }
}

// POST /api/pacientes/:id/embarazo/cerrar
async function cerrarEmbarazo(req, res) {
  try {
    const embarazo = await pacientesService.cerrarEmbarazo({
      id: req.params.id,
      body: req.body || {},
      req,
    });
    return res.json(embarazo);
  } catch (err) {
    return handleError(res, err, 'Error al cerrar embarazo');
  }
}

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  expedienteCompleto,
  nuevoEmbarazo,
  pasarAPuerperio,
  cerrarEmbarazo,
};
