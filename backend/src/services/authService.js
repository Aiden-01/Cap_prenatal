const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const authRepository = require('../repositories/authRepository');
const authSessionsRepository = require('../repositories/authSessionsRepository');
const permisosRepository = require('../repositories/permisosRepository');
const auditService = require('./auditService');
const sessionService = require('./sessionService');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

async function auditarLoginFallido(req, { username, usuario = null, accion = 'login_fallido', motivo }, audit = registrarAuditoria) {
  await audit(req, {
    accion,
    tabla: 'usuarios',
    registroId: usuario?.id || null,
    usuarioId: usuario?.id || null,
    datosNuevos: { username_intentado: username, motivo },
    descripcion: accion === 'login_usuario_inactivo'
      ? 'Intento de inicio de sesion con usuario inactivo'
      : 'Intento de inicio de sesion fallido',
  });
}

async function login({ username, password, req, dependencies = {} }) {
  const authRepo = dependencies.authRepository || authRepository;
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const sessions = dependencies.sessionService || sessionService;
  const audit = dependencies.registrarAuditoria || registrarAuditoria;
  const usuario = await authRepo.obtenerUsuarioPorUsername(username);

  if (!usuario) {
    await auditarLoginFallido(req, { username, motivo: 'credenciales_incorrectas' }, audit);
    throw new HttpError(401, 'Credenciales incorrectas');
  }
  if (!usuario.activo) {
    await auditarLoginFallido(req, {
      username,
      usuario,
      accion: 'login_usuario_inactivo',
      motivo: 'usuario_inactivo',
    }, audit);
    throw new HttpError(401, 'Credenciales incorrectas');
  }
  if (!await bcrypt.compare(password, usuario.password_hash)) {
    await auditarLoginFallido(req, { username, usuario, motivo: 'credenciales_incorrectas' }, audit);
    throw new HttpError(401, 'Credenciales incorrectas');
  }

  const permisos = await permisosRepo.listarCodigosPorUsuario(usuario.id);
  const created = await sessions.createSession({
    usuarioId: usuario.id,
    req,
    dependencies: dependencies.sessionDependencies,
  });
  const csrfToken = crypto.randomBytes(32).toString('hex');

  await audit(req, {
    accion: 'login',
    tabla: 'usuarios',
    registroId: usuario.id,
    usuarioId: usuario.id,
    datosNuevos: { id: usuario.id, username: usuario.username, rol: usuario.rol },
    descripcion: 'Inicio de sesion exitoso',
  });

  return {
    accessToken: created.accessToken,
    refreshToken: created.refreshToken,
    csrfToken,
    absoluteExpiresAt: created.record.absolute_expires_at,
    usuario: {
      id: usuario.id,
      nombre_completo: usuario.nombre_completo,
      username: usuario.username,
      rol: usuario.rol,
      permisos,
      ...sessions.publicSessionMetadata(created.record),
    },
  };
}

async function refresh({ refreshToken, req, dependencies = {} }) {
  return (dependencies.sessionService || sessionService).refreshSession({
    refreshToken,
    req,
    dependencies: dependencies.sessionDependencies,
  });
}

async function logout(req, dependencies = {}) {
  const claims = req.logoutClaims || {
    sessionId: req.authSession?.id,
    usuarioId: req.usuario?.id,
  };
  const sessions = dependencies.sessionService || sessionService;
  if (claims.sessionId && claims.usuarioId) {
    await sessions.revokeCurrent({
      sessionId: claims.sessionId,
      usuarioId: claims.usuarioId,
      reason: 'logout',
      req,
      dependencies: dependencies.sessionDependencies,
    });
  } else if (req.logoutRefreshToken) {
    await sessions.revokeWithRefresh({
      refreshToken: req.logoutRefreshToken,
      reason: 'logout',
      req,
      dependencies: dependencies.sessionDependencies,
    });
  }
  return { ok: true };
}

async function logoutAll({ req, dependencies = {} }) {
  await (dependencies.sessionService || sessionService).revokeAll({
    usuarioId: req.usuario.id,
    reason: 'logout_all',
    req,
    dependencies: dependencies.sessionDependencies,
  });
  return { ok: true };
}

async function me({ usuario, authSession, dependencies = {} }) {
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const permisos = await permisosRepo.listarCodigosPorUsuario(usuario.id);
  return {
    id: usuario.id,
    nombre_completo: usuario.nombre_completo,
    username: usuario.username,
    rol: usuario.rol,
    permisos,
    ...(dependencies.sessionService || sessionService).publicSessionMetadata(authSession),
  };
}

async function activity({ req, dependencies = {} }) {
  await (dependencies.sessionService || sessionService).registerActivity({
    sessionId: req.authSession.id,
    usuarioId: req.usuario.id,
    dependencies: dependencies.sessionDependencies,
  });
}

async function changePassword({ usuarioId, currentPassword, newPassword, req, dependencies = {} }) {
  const authRepo = dependencies.authRepository || authRepository;
  const sessionsRepo = dependencies.authSessionsRepository || authSessionsRepository;
  const sessions = dependencies.sessionService || sessionService;
  const registrarEvento = dependencies.registrarEvento || auditService.registrarEvento;
  const usuario = await authRepo.obtenerCredencialesPorId(usuarioId);
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado');
  if (!usuario.activo) throw new HttpError(403, 'Usuario inactivo. Contacte al administrador.');
  if (!await bcrypt.compare(currentPassword, usuario.password_hash)) {
    throw new HttpError(401, 'La contrasena actual no es correcta');
  }
  if (await bcrypt.compare(newPassword, usuario.password_hash)) {
    throw new HttpError(400, 'La nueva contrasena debe ser diferente a la actual');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await sessionsRepo.enTransaccion(async (db) => {
    await authRepo.actualizarPassword({ id: usuarioId, passwordHash, updatedBy: usuarioId }, db);
    await sessions.revokeAllInTransaction({
      usuarioId,
      reason: 'password_changed',
      req,
      db,
      dependencies: {
        repository: sessionsRepo,
        registrarEvento,
        ...(dependencies.sessionDependencies || {}),
      },
    });
    await registrarEvento(req, {
      accion: 'actualizar',
      tabla: 'usuarios',
      registroId: usuarioId,
      usuarioId,
      datosNuevos: { id: usuario.id, username: usuario.username, password_cambiado: true },
      descripcion: 'Cambio de contrasena del usuario autenticado',
    }, { db, obligatorio: true });
  });

  return { ok: true };
}

module.exports = {
  activity,
  changePassword,
  login,
  logout,
  logoutAll,
  me,
  refresh,
};
