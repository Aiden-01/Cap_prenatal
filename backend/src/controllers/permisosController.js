const permisosService = require('../services/permisosService');
const { asyncHandler } = require('../middleware/asyncHandler');

const listarCatalogo = asyncHandler(async (_req, res) => {
  const permisos = await permisosService.listarCatalogo();
  return res.json(permisos);
});

const listarUsuario = asyncHandler(async (req, res) => {
  const permisos = await permisosService.listarPermisosUsuario({
    usuarioId: req.params.id,
    req,
  });
  return res.json(permisos);
});

const actualizarUsuario = asyncHandler(async (req, res) => {
  const permisos = await permisosService.reemplazarPermisosUsuario({
    usuarioId: req.params.id,
    codigos: req.body.permisos,
    req,
  });
  return res.json(permisos);
});

module.exports = {
  actualizarUsuario,
  listarCatalogo,
  listarUsuario,
};
