const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const authRepository = require('../repositories/authRepository');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

async function login({ username, password, req }) {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET no configurado');
    throw new HttpError(500, 'Error interno del servidor');
  }

  const usuario = await authRepository.obtenerUsuarioPorUsername(username);
  if (!usuario) throw new HttpError(401, 'Credenciales incorrectas');
  if (!usuario.activo) throw new HttpError(403, 'Usuario inactivo. Contacte al administrador.');

  const passwordOk = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordOk) throw new HttpError(401, 'Credenciales incorrectas');

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

module.exports = {
  login,
  logout,
  me,
};
