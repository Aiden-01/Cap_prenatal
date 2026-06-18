const usuariosService = require('../services/usuariosService');
const { asyncHandler } = require('../middleware/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const usuarios = await usuariosService.listarUsuarios(req);
  return res.json(usuarios);
});

const crear = asyncHandler(async (req, res) => {
  const usuario = await usuariosService.crearUsuario({ body: req.body, req });
  return res.status(201).json(usuario);
});

const actualizar = asyncHandler(async (req, res) => {
  const result = await usuariosService.actualizarUsuario({
    id: req.params.id,
    body: req.body,
    req,
  });

  return res.json(result);
});

const eliminar = asyncHandler(async (req, res) => {
  const result = await usuariosService.eliminarUsuario({
    id: req.params.id,
    req,
  });

  return res.json(result);
});

module.exports = {
  listar,
  crear,
  actualizar,
  eliminar,
};
