const permisosRepository = require('../repositories/permisosRepository');
const usuariosRepository = require('../repositories/usuariosRepository');
const auditService = require('./auditService');
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

function normalizarCodigos(codigos) {
  return [...new Set(codigos || [])].sort();
}

function sonMismosPermisos(anteriores, nuevos) {
  return anteriores.length === nuevos.length
    && anteriores.every((codigo, index) => codigo === nuevos[index]);
}

async function reemplazarPermisosUsuario({ usuarioId, codigos, req, dependencies = {} }) {
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const usuariosRepo = dependencies.usuariosRepository || usuariosRepository;
  const registrarEvento = dependencies.registrarEvento || auditService.registrarEvento;

  requireDirector(req);
  const usuario = await usuariosRepo.obtenerVisibleParaActor({
    id: usuarioId,
    actorRol: req.usuario.rol,
  });
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado');

  const uniqueCodigos = normalizarCodigos(codigos);
  return permisosRepo.enTransaccion(async (db) => {
    const usuarioBloqueado = await permisosRepo.bloquearUsuarioPermisos(usuarioId, db);
    if (!usuarioBloqueado) throw new HttpError(404, 'Usuario no encontrado');

    const existentes = await permisosRepo.existenCodigos(uniqueCodigos, db, true);
    const faltantes = uniqueCodigos.filter((codigo) => !existentes.includes(codigo));
    if (faltantes.length) {
      throw new HttpError(400, `Permisos invalidos: ${faltantes.join(', ')}`, {
        code: 'PERMISOS_INVALIDOS',
      });
    }

    const anteriores = (await permisosRepo.listarCodigosPorUsuario(usuarioId, db)).sort();
    if (sonMismosPermisos(anteriores, uniqueCodigos)) {
      return permisosRepo.listarPermisosPorUsuario(usuarioId, db);
    }

    const permisos = await permisosRepo.reemplazarPermisosUsuario({
      usuarioId,
      codigos: uniqueCodigos,
      otorgadoPor: req.usuario.id,
    }, db);

    const anterioresSet = new Set(anteriores);
    const nuevosSet = new Set(uniqueCodigos);
    const agregados = uniqueCodigos.filter((codigo) => !anterioresSet.has(codigo));
    const retirados = anteriores.filter((codigo) => !nuevosSet.has(codigo));

    await registrarEvento(req, {
      usuarioId: req.usuario.id,
      accion: 'actualizar',
      modulo: 'permisos',
      entidadAfectada: 'usuario_permisos',
      tabla: 'usuario_permisos',
      idEntidad: usuarioId,
      registroId: usuarioId,
      datosAnteriores: {
        tipo_evento: 'usuario_permisos_actualizados',
        usuario_afectado_id: usuarioId,
        permisos: anteriores,
      },
      datosNuevos: {
        tipo_evento: 'usuario_permisos_actualizados',
        usuario_afectado_id: usuarioId,
        permisos: uniqueCodigos,
        permisos_agregados: agregados,
        permisos_retirados: retirados,
      },
      descripcion: 'usuario_permisos_actualizados',
    }, { db, obligatorio: true });

    return permisos;
  });
}

module.exports = {
  listarCatalogo,
  listarPermisosUsuario,
  normalizarCodigos,
  reemplazarPermisosUsuario,
};
