const comunidadesService = require('../services/comunidadesService');
const { asyncHandler } = require('../middleware/asyncHandler');

const listarAdmin = asyncHandler(async (req, res) => {
  const comunidades = await comunidadesService.listarComunidadesAdmin(req.query);
  return res.json(comunidades);
});

const listarActivas = asyncHandler(async (_req, res) => {
  const comunidades = await comunidadesService.listarComunidadesActivas();
  return res.json(comunidades);
});

const crear = asyncHandler(async (req, res) => {
  const comunidad = await comunidadesService.crearComunidad({
    body: req.body,
    req,
  });

  return res.status(201).json(comunidad);
});

const actualizar = asyncHandler(async (req, res) => {
  const comunidad = await comunidadesService.actualizarComunidad({
    id: req.params.id,
    body: req.body,
    req,
  });

  return res.json(comunidad);
});

const desactivar = asyncHandler(async (req, res) => {
  const comunidad = await comunidadesService.desactivarComunidad({
    id: req.params.id,
    req,
  });

  return res.json(comunidad);
});

const reactivar = asyncHandler(async (req, res) => {
  const comunidad = await comunidadesService.reactivarComunidad({
    id: req.params.id,
    req,
  });

  return res.json(comunidad);
});

module.exports = {
  actualizar,
  crear,
  desactivar,
  listarActivas,
  listarAdmin,
  reactivar,
};
