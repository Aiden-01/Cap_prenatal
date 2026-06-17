const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const authRepository = require('../repositories/authRepository');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

async function auditarLoginFallido(req, { username, usuario = null, accion = 'login_fallido', motivo }) {
  await registrarAuditoria(req, {
    accion,
    tabla: 'usuarios',
    registroId: usuario?.id || null,
    usuarioId: usuario?.id || null,
    datosNuevos: {
      username_intentado: username,
      motivo,
    },
    descripcion: accion === 'login_usuario_inactivo'
      ? 'Intento de inicio de sesion con usuario inactivo'
      : 'Intento de inicio de sesion fallido',
  });
}

async function login({ username, password, req }) {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET no configurado');
    throw new HttpError(500, 'Error interno del servidor');
  }

  const usuario = await authRepository.obtenerUsuarioPorUsername(username);
  if (!usuario) {
    await auditarLoginFallido(req, {
      username,
      motivo: 'usuario_no_encontrado_o_password_incorrecto',
    });
    throw new HttpError(401, 'Credenciales incorrectas');
  }

  if (!usuario.activo) {
    await auditarLoginFallido(req, {
      username,
      usuario,
      accion: 'login_usuario_inactivo',
      motivo: 'usuario_inactivo',
    });
    throw new HttpError(401, 'Credenciales incorrectas');
  }

  const passwordOk = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordOk) {
    await auditarLoginFallido(req, {
      username,
      usuario,
      motivo: 'usuario_no_encontrado_o_password_incorrecto',
    });
    throw new HttpError(401, 'Credenciales incorrectas');
  }

  const token = jwt.sign(
    { id: usuario.id, username: usuario.username, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  const csrfToken = crypto.randomBytes(32).toString('hex');

  await registrarAuditoria(req, {
    accion: 'login',
    tabla: 'usuarios',
    registroId: usuario.id,
    usuarioId: usuario.id,
    datosNuevos: {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
    },
    descripcion: 'Inicio de sesion exitoso',
  });

  return {
    token,
    csrfToken,
    usuario: {
      id: usuario.id,
      nombre_completo: usuario.nombre_completo,
      username: usuario.username,
      rol: usuario.rol,
    },
  };
}

async function logout(req) {
  await registrarAuditoria(req, {
    accion: 'logout',
    tabla: 'usuarios',
    registroId: req.usuario?.id || null,
    usuarioId: req.usuario?.id || null,
    descripcion: 'Cierre de sesion',
  });

  return { ok: true };
}

async function me(usuarioId) {
  return authRepository.obtenerUsuarioPorId(usuarioId);
}

async function changePassword({ usuarioId, currentPassword, newPassword, req }) {
  const usuario = await authRepository.obtenerCredencialesPorId(usuarioId);
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado');
  if (!usuario.activo) throw new HttpError(403, 'Usuario inactivo. Contacte al administrador.');

  const passwordOk = await bcrypt.compare(currentPassword, usuario.password_hash);
  if (!passwordOk) throw new HttpError(401, 'La contrasena actual no es correcta');

  const samePassword = await bcrypt.compare(newPassword, usuario.password_hash);
  if (samePassword) throw new HttpError(400, 'La nueva contrasena debe ser diferente a la actual');

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await authRepository.actualizarPassword({
    id: usuarioId,
    passwordHash,
    updatedBy: usuarioId,
  });

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'usuarios',
    registroId: usuarioId,
    usuarioId,
    datosNuevos: {
      id: usuario.id,
      username: usuario.username,
      password_cambiado: true,
    },
    descripcion: 'Cambio de contrasena del usuario autenticado',
  });

  return { ok: true };
}

module.exports = {
  login,
  logout,
  me,
  changePassword,
};
