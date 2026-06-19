const bcrypt = require('bcryptjs');
const usuariosRepository = require('../repositories/usuariosRepository');
const permisosRepository = require('../repositories/permisosRepository');
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

async function obtenerTargetVisible({ id, req }) {
  const target = await usuariosRepository.obtenerVisibleParaActor({
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

async function assertPuedeCambiarSelf({ id, actorId, activo, rol }) {
  const esSelf = String(id) === String(actorId);
  if (esSelf && activo === false) {
    throw new HttpError(403, 'No puedes desactivar tu propia cuenta');
  }

  if (esSelf && rol && rol !== 'admin') {
    const adminsActivos = await usuariosRepository.contarAdminsActivos();
    if (adminsActivos <= 1) {
      throw new HttpError(403, 'No puedes cambiar tu rol: eres el unico administrador activo');
    }
  }
}

async function assertNoDejaSinDirector({ target, nextActivo, nextRol }) {
  const eraDirectorActivo = target.rol === 'director' && target.activo === true;
  const dejaDeSerDirector = nextRol && nextRol !== 'director';
  const quedaInactivo = nextActivo === false;

  if (eraDirectorActivo && (dejaDeSerDirector || quedaInactivo)) {
    const directoresActivos = await usuariosRepository.contarDirectoresActivos();
    if (directoresActivos <= 1) {
      throw new HttpError(403, 'No puedes dejar el sistema sin un director activo');
    }
  }
}

async function actualizarUsuario({ id, body, req }) {
  const before = await obtenerTargetVisible({ id, req });
  assertPuedeAsignarRol({ rol: body.rol, actorRol: req.usuario.rol });
  await assertPuedeCambiarSelf({
    id,
    actorId: req.usuario.id,
    activo: body.activo,
    rol: body.rol,
  });

  await assertNoDejaSinDirector({
    target: before,
    nextActivo: body.activo ?? before.activo,
    nextRol: body.rol,
  });

  const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null;
  const usuario = await usuariosRepository.actualizar({
    id,
    nombreCompleto: body.nombre_completo,
    activo: body.activo ?? before.activo,
    rol: body.rol,
    passwordHash,
    updatedBy: req.usuario.id,
  });

  if (before.rol !== body.rol) {
    await permisosRepository.reemplazarPermisosPorRol({
      usuarioId: id,
      rol: body.rol,
      otorgadoPor: req.usuario.id,
    });
  }

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'usuarios',
    registroId: id,
    datosAnteriores: before,
    datosNuevos: { ...usuario, rol: body.rol, password_cambiado: Boolean(body.password) },
    descripcion: 'Usuario actualizado',
  });

  return { message: 'Usuario actualizado' };
}

async function eliminarUsuario({ id, req }) {
  const esSelf = String(id) === String(req.usuario.id);
  if (esSelf) throw new HttpError(403, 'No puedes eliminar tu propia cuenta');

  const target = await obtenerTargetVisible({ id, req });

  if (target.rol === 'admin') {
    const adminsActivos = await usuariosRepository.contarAdminsActivos();
    if (adminsActivos <= 1) {
      throw new HttpError(403, 'No puedes eliminar al unico administrador activo del sistema');
    }
  }

  if (target.rol === 'director' && target.activo) {
    const directoresActivos = await usuariosRepository.contarDirectoresActivos();
    if (directoresActivos <= 1) {
      throw new HttpError(403, 'No puedes eliminar al unico director activo del sistema');
    }
  }

  if (target.tiene_registros || target.puede_eliminarse === false) {
    throw new HttpError(409, 'No se puede eliminar este usuario porque tiene historial clinico o de auditoria. Desactivalo para conservar la trazabilidad.', {
      code: 'USUARIO_PROTEGIDO_HISTORIAL',
    });
  }

  await usuariosRepository.eliminar(id);
  await registrarAuditoria(req, {
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
