const bcrypt = require('bcryptjs');
const usuariosRepository = require('../repositories/usuariosRepository');
const permisosRepository = require('../repositories/permisosRepository');
const permisosService = require('./permisosService');
const auditService = require('./auditService');
const sessionService = require('./sessionService');
const authSessionsRepository = require('../repositories/authSessionsRepository');
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

async function crearUsuario({ body, req, dependencies = {} }) {
  const usuariosRepo = dependencies.usuariosRepository || usuariosRepository;
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const registrarEventoPrivado = dependencies.registrarEventoPrivado
    || auditService.registrarEventoPrivado;
  assertPuedeAsignarRol({ rol: body.rol, actorRol: req.usuario.rol });

  const hash = await bcrypt.hash(body.password, 12);
  const usuario = await usuariosRepo.crear({
    nombreCompleto: body.nombre_completo,
    username: body.username,
    passwordHash: hash,
    rol: body.rol,
    createdBy: req.usuario?.id || null,
  });
  await permisosRepo.asignarPermisosIniciales({
    usuarioId: usuario.id,
    rol: body.rol,
    otorgadoPor: req.usuario?.id || null,
  });

  await registrarEventoPrivado(req, {
    contexto: { categoria: 'usuarios', entidad: 'usuario', evento: 'usuario_creado' },
    accion: 'crear',
    entidadId: usuario.id,
    cambios: {
      anteriores: null,
      nuevos: {
        nombre_completo: body.nombre_completo,
        username: body.username,
        rol: body.rol,
      },
    },
  });

  return usuario;
}

async function auditarCambiosUsuario({
  before,
  after,
  passwordReset,
  req,
  db,
  obligatorio,
  registrarEventoPrivado,
}) {
  const options = { db, obligatorio };
  const common = {
    accion: 'actualizar',
    entidadId: after.id,
  };

  if (before.nombre_completo !== after.nombre_completo) {
    await registrarEventoPrivado(req, {
      ...common,
      contexto: {
        categoria: 'usuarios',
        entidad: 'usuario',
        evento: 'usuario_actualizado',
      },
      cambios: {
        anteriores: { nombre_completo: before.nombre_completo },
        nuevos: { nombre_completo: after.nombre_completo },
      },
    }, options);
  }

  if (before.rol !== after.rol) {
    await registrarEventoPrivado(req, {
      ...common,
      contexto: { categoria: 'usuarios', entidad: 'usuario', evento: 'cambio_rol' },
      cambios: {
        anteriores: { rol: before.rol },
        nuevos: { rol: after.rol },
      },
    }, options);
  }

  if (before.activo !== after.activo) {
    await registrarEventoPrivado(req, {
      ...common,
      contexto: {
        categoria: 'usuarios',
        entidad: 'usuario',
        evento: after.activo ? 'usuario_activado' : 'usuario_desactivado',
      },
      cambios: {
        anteriores: { activo: before.activo },
        nuevos: { activo: after.activo },
      },
    }, options);
  }

  if (passwordReset) {
    await registrarEventoPrivado(req, {
      ...common,
      contexto: {
        categoria: 'usuarios',
        entidad: 'usuario',
        evento: 'password_reiniciado',
      },
      metadata: { password_cambiado: true },
    }, options);
  }
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
  const registrarEventoPrivado = dependencies.registrarEventoPrivado
    || auditService.registrarEventoPrivado;
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
  const nextActivo = body.activo ?? before.activo;
  const stateChanged = before.activo !== nextActivo;
  const deactivated = before.activo === true && nextActivo === false;
  const passwordReset = Boolean(body.password);
  const criticalChange = roleChanged || stateChanged || passwordReset;

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
            registrarEventoPrivado,
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
          registrarEventoPrivado,
        },
      });

      await auditarCambiosUsuario({
        before: estadoAnterior,
        after: usuario,
        passwordReset,
        req,
        db,
        obligatorio: true,
        registrarEventoPrivado,
      });
    });

    return { message: 'Usuario actualizado' };
  }

  const usuario = await actualizar();

  await auditarCambiosUsuario({
    before,
    after: usuario,
    passwordReset: false,
    req,
    obligatorio: false,
    registrarEventoPrivado,
  });

  return { message: 'Usuario actualizado' };
}

async function eliminarUsuario({ id, req, dependencies = {} }) {
  const usuariosRepo = dependencies.usuariosRepository || usuariosRepository;
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const sessions = dependencies.sessionService || sessionService;
  const sessionsRepo = dependencies.authSessionsRepository || authSessionsRepository;
  const registrarEventoPrivado = dependencies.registrarEventoPrivado
    || auditService.registrarEventoPrivado;
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
      dependencies: { repository: sessionsRepo, registrarEventoPrivado },
    });
    await usuariosRepo.eliminar(id, db);
    await registrarEventoPrivado(req, {
      contexto: { categoria: 'usuarios', entidad: 'usuario', evento: 'usuario_eliminado' },
      accion: 'eliminar',
      entidadId: id,
      cambios: {
        anteriores: target,
        nuevos: null,
      },
    }, { db, obligatorio: true });
  });

  return { message: 'Usuario eliminado' };
}

module.exports = {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
};
