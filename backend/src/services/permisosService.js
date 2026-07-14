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

function calcularDiferenciasPermisos(anteriores, nuevos) {
  const anterioresSet = new Set(anteriores);
  const nuevosSet = new Set(nuevos);
  return {
    agregados: nuevos.filter((codigo) => !anterioresSet.has(codigo)),
    retirados: anteriores.filter((codigo) => !nuevosSet.has(codigo)),
  };
}

async function reemplazarPermisosEnTransaccion({
  usuarioId,
  codigos,
  req,
  db,
  contexto = {},
  dependencies = {},
}) {
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const registrarEvento = dependencies.registrarEvento || auditService.registrarEvento;
  const nuevos = normalizarCodigos(codigos);
  const existentes = await permisosRepo.existenCodigos(nuevos, db, true);
  const faltantes = nuevos.filter((codigo) => !existentes.includes(codigo));
  if (faltantes.length) {
    throw new HttpError(400, `Permisos invalidos: ${faltantes.join(', ')}`, {
      code: 'PERMISOS_INVALIDOS',
    });
  }

  const anteriores = normalizarCodigos(
    await permisosRepo.listarCodigosPorUsuario(usuarioId, db)
  );
  if (sonMismosPermisos(anteriores, nuevos)) {
    return {
      cambio: false,
      permisos: await permisosRepo.listarPermisosPorUsuario(usuarioId, db),
      anteriores,
      nuevos,
      agregados: [],
      retirados: [],
    };
  }

  const permisos = await permisosRepo.reemplazarPermisosUsuario({
    usuarioId,
    codigos: nuevos,
    otorgadoPor: req.usuario.id,
  }, db);
  const { agregados, retirados } = calcularDiferenciasPermisos(anteriores, nuevos);

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
      ...contexto,
    },
    datosNuevos: {
      tipo_evento: 'usuario_permisos_actualizados',
      usuario_afectado_id: usuarioId,
      permisos: nuevos,
      permisos_agregados: agregados,
      permisos_retirados: retirados,
      ...contexto,
    },
    descripcion: 'usuario_permisos_actualizados',
  }, { db, obligatorio: true });

  return { cambio: true, permisos, anteriores, nuevos, agregados, retirados };
}

async function reemplazarPermisosUsuario({ usuarioId, codigos, req, dependencies = {} }) {
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const usuariosRepo = dependencies.usuariosRepository || usuariosRepository;

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

    const resultado = await reemplazarPermisosEnTransaccion({
      usuarioId,
      codigos: uniqueCodigos,
      req,
      db,
      contexto: { origen: 'actualizacion_directa' },
      dependencies,
    });
    return resultado.permisos;
  });
}

module.exports = {
  calcularDiferenciasPermisos,
  listarCatalogo,
  listarPermisosUsuario,
  normalizarCodigos,
  reemplazarPermisosEnTransaccion,
  reemplazarPermisosUsuario,
};
