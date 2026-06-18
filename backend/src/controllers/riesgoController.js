const riesgoService = require('../services/riesgoService');
const { asyncHandler } = require('../middleware/asyncHandler');
const { ocultarDatosVih } = require('../utils/datosSensibles');

const obtener = asyncHandler(async (req, res) => {
  const ficha = await riesgoService.obtenerFichaRiesgo(req.params.pacienteId);
  return res.json(ocultarDatosVih(ficha || null, req.usuario.permisos));
});

const guardar = asyncHandler(async (req, res) => {
  const ficha = await riesgoService.guardarFichaRiesgo({
    pacienteId: req.params.pacienteId,
    body: req.body,
    req,
  });

  return res.json(ocultarDatosVih(ficha, req.usuario.permisos));
});

const actualizar = asyncHandler(async (req, res) => {
  const ficha = await riesgoService.actualizarFichaRiesgo({
    pacienteId: req.params.pacienteId,
    body: req.body,
    req,
  });

  return res.json(ocultarDatosVih(ficha, req.usuario.permisos));
});

const eliminar = asyncHandler(async (req, res) => {
  const result = await riesgoService.eliminarFichaRiesgo({
    pacienteId: req.params.pacienteId,
    req,
  });

  return res.json(result);
});

module.exports = {
  obtener,
  guardar,
  actualizar,
  eliminar,
};
