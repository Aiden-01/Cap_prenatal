const permisosRepository = require('../repositories/permisosRepository');
const { AppError } = require('../utils/appError');

async function cargarPermisos(req, _res, next) {
  try {
    if (!req.usuario?.id) return next();
    req.usuario.permisos = await permisosRepository.listarCodigosPorUsuario(req.usuario.id);
    return next();
  } catch (err) {
    return next(err);
  }
}

function verificarPermiso(codigo) {
  return (req, _res, next) => {
    if (!req.usuario?.permisos?.includes(codigo)) {
      return next(new AppError(403, 'Permiso requerido', {
        code: 'PERMISO_REQUERIDO',
      }));
    }
    return next();
  };
}

module.exports = {
  cargarPermisos,
  verificarPermiso,
};
