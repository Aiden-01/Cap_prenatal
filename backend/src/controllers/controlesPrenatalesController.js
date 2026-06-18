const controlesPrenatalesService = require('../services/controlesPrenatalesService');
const { asyncHandler } = require('../middleware/asyncHandler');
const { ocultarDatosVih } = require('../utils/datosSensibles');

const listar = asyncHandler(async (req, res) => {
  const controles = await controlesPrenatalesService.listarControles(req.params.pacienteId);
  return res.json(ocultarDatosVih(controles, req.usuario.permisos));
});

const obtener = asyncHandler(async (req, res) => {
  const control = await controlesPrenatalesService.obtenerControl({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
  });

  return res.json(ocultarDatosVih(control, req.usuario.permisos));
});

const crear = asyncHandler(async (req, res) => {
  const control = await controlesPrenatalesService.crearControl({
    pacienteId: req.params.pacienteId,
    body: req.body,
    req,
  });

  return res.status(201).json(ocultarDatosVih(control, req.usuario.permisos));
});

const actualizar = asyncHandler(async (req, res) => {
  const control = await controlesPrenatalesService.actualizarControl({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
    body: req.body,
    req,
  });

  return res.json(ocultarDatosVih(control, req.usuario.permisos));
});

const eliminar = asyncHandler(async (req, res) => {
  const result = await controlesPrenatalesService.eliminarControl({
    pacienteId: req.params.pacienteId,
    id: req.params.id,
    req,
  });

  return res.json(result);
});

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
};
