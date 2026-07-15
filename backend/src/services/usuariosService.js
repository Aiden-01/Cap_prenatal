const bcrypt = require('bcryptjs');
const usuariosRepository = require('../repositories/usuariosRepository');
const permisosRepository = require('../repositories/permisosRepository');
const permisosService = require('./permisosService');
const auditService = require('./auditService');
const sessionService = require('./sessionService');
const authSessionsRepository = require('../repositories/authSessionsRepository');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

async function listarUsuarios(req) {
  return usuariosRepository.listar({ actorRol: req.usuario.rol });
}

function assertPuedeAsignarRol({ rol, actorRol }) {
  if (rol === 'director' && actorRol !== 'director') {
    throw new HttpError(403, 'No autorizado para asignar rol director', {
      code: 'ROL_NO_AUTORIZADO',
    });
  }
}

async function obtenerTargetVisible({ id, req, repository = usuariosRepository }) {
  const target = await repository.obtenerVisibleParaActor({
    id,
    actorRol: req.usuario.rol,
  });
  if (!target) throw new HttpError(404, 'Usuario no encontrado');
  return target;
}

async function crearUsuario({ body, req }) {
  assertPuedeAsignarRol({ rol: body.rol, actorRol: req.usuario.rol });

  const hash = await bcrypt.hash(body.password, 12);
  const usuario = await usuariosRepository.crear({
    nombreCompleto: body.nombre_completo,
    username: body.username,
    passwordHash: hash,
    rol: body.rol,
    createdBy: req.usuario?.id || null,
  });
  await permisosRepository.asignarPermisosIniciales({
    usuarioId: usuario.id,
    rol: body.rol,
    otorgadoPor: req.usuario?.id || null,
  });

  await registrarAuditoria(req, {
    accion: 'crear',
    tabla: 'usuarios',
    registroId: usuario.id,
    datosNuevos: { ...usuario, rol: body.rol },
    descripcion: 'Usuario creado',
  });

  return usuario;
}

async function assertPuedeCambiarSelf({
  id,
  actorId,
  activo,
  rol,
  repository = usuariosRepository,
}) {
  const esSelf = String(id) === String(actorId);
  if (esSelf && activo === false) {
    throw new HttpError(403, 'No puedes desactivar tu propia cuenta');
  }

  if (esSelf && rol && rol !== 'admin') {
    const adminsActivos = await repository.contarAdminsActivos();
    if (adminsActivos <= 1) {
      throw new HttpError(403, 'No puedes cambiar tu rol: eres el unico administrador activo');
    }
  }
}

async function assertNoDejaSinDirector({
  target,
  nextActivo,
  nextRol,
  repository = usuariosRepository,
}) {
  const eraDirectorActivo = target.rol === 'director' && target.activo === true;
  const dejaDeSerDirector = nextRol && nextRol !== 'director';
  const quedaInactivo = nextActivo === false;

  if (eraDirectorActivo && (dejaDeSerDirector || quedaInactivo)) {
    const directoresActivos = await repository.contarDirectoresActivos();
    if (directoresActivos <= 1) {
      throw new HttpError(403, 'No puedes dejar el sistema sin un director activo');
    }
  }
}

async function actualizarUsuario({ id, body, req, dependencies = {} }) {
  const usuariosRepo = dependencies.usuariosRepository || usuariosRepository;
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const permisosLogic = dependencies.permisosService || permisosService;
  const registrarEvento = dependencies.registrarEvento || auditService.registrarEvento;
  const registrarAuditoriaNormal = dependencies.registrarAuditoria || registrarAuditoria;
  const sessions = dependencies.sessionService || sessionService;
  const sessionsRepo = dependencies.authSessionsRepository || authSessionsRepository;
  const before = await obtenerTargetVisible({ id, req, repository: usuariosRepo });
  const nextRol = body.rol ?? before.rol;
  assertPuedeAsignarRol({ rol: nextRol, actorRol: req.usuario.rol });
  await assertPuedeCambiarSelf({
    id,
    actorId: req.usuario.id,
    activo: body.activo,
    rol: nextRol,
    repository: usuariosRepo,
  });

  await assertNoDejaSinDirector({
    target: before,
    nextActivo: body.activo ?? before.activo,
    nextRol,
    repository: usuariosRepo,
  });

  const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null;
  const actualizar = (db = null, estadoAnterior = before) => usuariosRepo.actualizar({
    id,
    nombreCompleto: body.nombre_completo,
    activo: body.activo ?? estadoAnterior.activo,
    rol: nextRol,
    passwordHash,
    updatedBy: req.usuario.id,
  }, db || undefined);

  const roleChanged = before.rol !== nextRol;
  const deactivated = before.activo === true && body.activo === false;
  const passwordReset = Boolean(body.password);
  const criticalChange = roleChanged || deactivated || passwordReset;

  if (criticalChange) {
    await permisosRepo.enTransaccion(async (db) => {
      const bloqueado = await permisosRepo.bloquearUsuarioPermisos(id, db);
      if (!bloqueado) throw new HttpError(404, 'Usuario no encontrado');

      const estadoAnterior = await usuariosRepo.obtenerPorId(id, db);
      if (!estadoAnterior || (req.usuario.rol === 'admin' && estadoAnterior.rol === 'director')) {
        throw new HttpError(404, 'Usuario no encontrado');
      }

      const usuario = await actualizar(db, estadoAnterior);
      if (estadoAnterior.rol !== nextRol) {
        let codigos = permisosRepo.codigosPorRol(nextRol);
        if (codigos === null) {
          const catalogo = await permisosRepo.listarCatalogo(db);
          codigos = catalogo.map((permiso) => permiso.codigo);
        }

        await permisosLogic.reemplazarPermisosEnTransaccion({
          usuarioId: id,
          codigos,
          req,
          db,
          contexto: {
            origen: 'cambio_rol',
            rol_anterior: estadoAnterior.rol,
            rol_nuevo: nextRol,
          },
          revocarSesiones: false,
          dependencies: {
            permisosRepository: permisosRepo,
            registrarEvento,
            sessionService: sessions,
            authSessionsRepository: sessionsRepo,
          },
        });
      }

      const reasons = [];
      if (passwordReset) reasons.push('password_reset');
      if (deactivated) reasons.push('user_deactivated');
      if (roleChanged) reasons.push('role_changed');
      await sessions.revokeAllInTransaction({
        usuarioId: id,
        reason: reasons.join('+'),
        req,
        db,
        dependencies: {
          repository: sessionsRepo,
          registrarEvento,
        },
      });

      await registrarEvento(req, {
        accion: 'actualizar',
        tabla: 'usuarios',
        registroId: id,
        datosAnteriores: estadoAnterior,
        datosNuevos: { ...usuario, rol: nextRol, password_cambiado: Boolean(body.password) },
        descripcion: 'Usuario actualizado',
      }, { db, obligatorio: true });
    });

    return { message: 'Usuario actualizado' };
  }

  const usuario = await actualizar();

  await registrarAuditoriaNormal(req, {
    accion: 'actualizar',
    tabla: 'usuarios',
    registroId: id,
    datosAnteriores: before,
    datosNuevos: { ...usuario, rol: nextRol, password_cambiado: Boolean(body.password) },
    descripcion: 'Usuario actualizado',
  });

  return { message: 'Usuario actualizado' };
}

async function eliminarUsuario({ id, req, dependencies = {} }) {
  const usuariosRepo = dependencies.usuariosRepository || usuariosRepository;
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const sessions = dependencies.sessionService || sessionService;
  const sessionsRepo = dependencies.authSessionsRepository || authSessionsRepository;
  const registrarEvento = dependencies.registrarEvento || auditService.registrarEvento;
  const registrarAuditoriaNormal = dependencies.registrarAuditoria || registrarAuditoria;
  const esSelf = String(id) === String(req.usuario.id);
  if (esSelf) throw new HttpError(403, 'No puedes eliminar tu propia cuenta');

  const target = await obtenerTargetVisible({ id, req, repository: usuariosRepo });

  if (target.rol === 'admin') {
    const adminsActivos = await usuariosRepo.contarAdminsActivos();
    if (adminsActivos <= 1) {
      throw new HttpError(403, 'No puedes eliminar al unico administrador activo del sistema');
    }
  }

  if (target.rol === 'director' && target.activo) {
    const directoresActivos = await usuariosRepo.contarDirectoresActivos();
    if (directoresActivos <= 1) {
      throw new HttpError(403, 'No puedes eliminar al unico director activo del sistema');
    }
  }

  if (target.tiene_registros || target.puede_eliminarse === false) {
    throw new HttpError(409, 'No se puede eliminar este usuario porque tiene historial clinico o de auditoria. Desactivalo para conservar la trazabilidad.', {
      code: 'USUARIO_PROTEGIDO_HISTORIAL',
    });
  }

  await permisosRepo.enTransaccion(async (db) => {
    await sessions.revokeAllInTransaction({
      usuarioId: id,
      reason: 'user_deleted',
      req,
      db,
      dependencies: { repository: sessionsRepo, registrarEvento },
    });
    await usuariosRepo.eliminar(id, db);
  });
  await registrarAuditoriaNormal(req, {
    accion: 'eliminar',
    tabla: 'usuarios',
    registroId: id,
    datosAnteriores: target,
    descripcion: 'Usuario eliminado',
  });

  return { message: 'Usuario eliminado' };
}

module.exports = {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
};
