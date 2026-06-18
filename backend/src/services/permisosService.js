const permisosRepository = require('../repositories/permisosRepository');
const usuariosRepository = require('../repositories/usuariosRepository');
const { HttpError } = require('../utils/httpError');

function requireDirector(req) {
  if (req.usuario?.rol !== 'director') {
    throw new HttpError(403, 'Solo un director puede gestionar permisos', {
      code: 'DIRECTOR_ONLY',
    });
  }
}

async function listarCatalogo() {
  return permisosRepository.listarCatalogo();
}

async function listarPermisosUsuario({ usuarioId, req }) {
  requireDirector(req);
  const usuario = await usuariosRepository.obtenerVisibleParaActor({
    id: usuarioId,
    actorRol: req.usuario.rol,
  });
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado');
  return permisosRepository.listarPermisosPorUsuario(usuarioId);
}

async function reemplazarPermisosUsuario({ usuarioId, codigos, req }) {
  requireDirector(req);
  const usuario = await usuariosRepository.obtenerVisibleParaActor({
    id: usuarioId,
    actorRol: req.usuario.rol,
  });
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado');

  const uniqueCodigos = [...new Set(codigos || [])];
  const existentes = await permisosRepository.existenCodigos(uniqueCodigos);
  const faltantes = uniqueCodigos.filter((codigo) => !existentes.includes(codigo));
  if (faltantes.length) {
    throw new HttpError(400, `Permisos invalidos: ${faltantes.join(', ')}`, {
      code: 'PERMISOS_INVALIDOS',
    });
  }

  return permisosRepository.reemplazarPermisosUsuario({
    usuarioId,
    codigos: uniqueCodigos,
    otorgadoPor: req.usuario.id,
  });
}

module.exports = {
  listarCatalogo,
  listarPermisosUsuario,
  reemplazarPermisosUsuario,
};
