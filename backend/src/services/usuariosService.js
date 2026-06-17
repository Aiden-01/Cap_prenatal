const bcrypt = require('bcryptjs');
const usuariosRepository = require('../repositories/usuariosRepository');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

async function listarUsuarios() {
  return usuariosRepository.listar();
}

async function crearUsuario({ body, req }) {
  const hash = await bcrypt.hash(body.password, 12);
  const usuario = await usuariosRepository.crear({
    nombreCompleto: body.nombre_completo,
    username: body.username,
    passwordHash: hash,
    rol: body.rol,
    createdBy: req.usuario?.id || null,
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

async function actualizarUsuario({ id, body, req }) {
  await assertPuedeCambiarSelf({
    id,
    actorId: req.usuario.id,
    activo: body.activo,
    rol: body.rol,
  });

  const before = await usuariosRepository.obtenerPorId(id);
  if (!before) throw new HttpError(404, 'Usuario no encontrado');

  const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null;
  const usuario = await usuariosRepository.actualizar({
    id,
    nombreCompleto: body.nombre_completo,
    activo: body.activo,
    rol: body.rol,
    passwordHash,
    updatedBy: req.usuario.id,
  });

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

  const target = await usuariosRepository.obtenerPorId(id);
  if (!target) throw new HttpError(404, 'Usuario no encontrado');

  if (target.rol === 'admin') {
    const adminsActivos = await usuariosRepository.contarAdminsActivos();
    if (adminsActivos <= 1) {
      throw new HttpError(403, 'No puedes eliminar al unico administrador activo del sistema');
    }
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
