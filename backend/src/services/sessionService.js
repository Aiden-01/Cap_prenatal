const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const authSessionsRepository = require('../repositories/authSessionsRepository');
const auditService = require('./auditService');
const { getJwtConfig, getSessionConfig } = require('../config/env');
const { HttpError } = require('../utils/httpError');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nowDate(clock = Date) {
  return new Date(clock.now());
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function secureHashEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === 32
    && rightBuffer.length === 32
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function generateRefreshToken(sessionId) {
  return `${sessionId}.${crypto.randomBytes(48).toString('base64url')}`;
}

function sessionIdFromRefreshToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !UUID_PATTERN.test(parts[0]) || parts[1].length < 64) return null;
  return parts[0];
}

function issueAccessToken({ usuarioId, sessionId, jwtConfig = getJwtConfig() }) {
  return jwt.sign(
    { sid: sessionId },
    jwtConfig.secret,
    {
      algorithm: jwtConfig.algorithm,
      audience: jwtConfig.audience,
      issuer: jwtConfig.issuer,
      subject: String(usuarioId),
      jwtid: crypto.randomUUID(),
      expiresIn: `${jwtConfig.accessTokenTtlMinutes}m`,
    }
  );
}

function stateOfSession(record, config = getSessionConfig(), now = new Date()) {
  if (!record) return { code: 'AUTHENTICATION_REQUIRED', reason: 'session_not_found' };
  if (record.revoked_at) return { code: 'SESSION_REVOKED', reason: 'already_revoked' };
  if (!record.activo) return { code: 'USER_INACTIVE', reason: 'user_inactive' };
  if (new Date(record.absolute_expires_at).getTime() <= now.getTime()) {
    return { code: 'SESSION_EXPIRED', reason: 'absolute_expiration' };
  }
  const idleMs = config.idleTimeoutMinutes * 60 * 1000;
  if (new Date(record.last_activity_at).getTime() + idleMs <= now.getTime()) {
    return { code: 'SESSION_INACTIVE', reason: 'inactivity' };
  }
  return null;
}

function publicSessionMetadata(record, config = getSessionConfig()) {
  return {
    idleTimeoutSeconds: config.idleTimeoutMinutes * 60,
    warningAfterSeconds: config.warningMinutes * 60,
    activityUpdateSeconds: config.activityUpdateSeconds,
    absoluteExpiresAt: new Date(record.absolute_expires_at).toISOString(),
    lastActivityAt: new Date(record.last_activity_at).toISOString(),
  };
}

function resolvePrivateRegistrar(dependencies = {}) {
  return dependencies.registrarEventoPrivado || auditService.registrarEventoPrivado;
}

async function auditSessionEvent({
  req,
  usuarioId,
  sessionId = null,
  action,
  reason = null,
  count = null,
  db,
  obligatorio = true,
  registrarEventoPrivado = auditService.registrarEventoPrivado,
}) {
  const metadata = { resultado: action };
  if (reason) metadata.motivo_codigo = String(reason).replace(/\+/g, '.');
  if (count !== null) metadata.cantidad_sesiones_revocadas = count;
  if (action === 'sesion_creada') metadata.sesion_creada = true;
  if (action === 'sesion_revocada') metadata.sesion_revocada = true;
  if (action === 'sesion_expirada') metadata.sesion_expirada = true;
  if (action === 'reutilizacion_refresh_detectada') metadata.reutilizacion_detectada = true;

  await registrarEventoPrivado(req, {
    contexto: {
      categoria: 'sesiones',
      entidad: sessionId ? 'sesion' : 'usuario',
      evento: action,
    },
    accion: 'estado',
    entidadId: sessionId || usuarioId,
    usuarioId: req?.usuario?.id || usuarioId,
    metadata,
  }, { db, obligatorio });
}

function sessionError(code = 'AUTHENTICATION_REQUIRED') {
  return new HttpError(401, 'Sesion no valida', { code });
}

async function createSession({ usuarioId, req, dependencies = {} }) {
  const repository = dependencies.repository || authSessionsRepository;
  const config = dependencies.config || getSessionConfig();
  const clock = dependencies.clock || Date;
  const registrarEventoPrivado = resolvePrivateRegistrar(dependencies);
  const id = crypto.randomUUID();
  const refreshToken = generateRefreshToken(id);
  const createdAt = nowDate(clock);
  const absoluteExpiresAt = new Date(createdAt.getTime() + config.absoluteHours * 60 * 60 * 1000);

  const record = await repository.enTransaccion(async (db) => {
    const created = await repository.crear({
      id,
      usuarioId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      createdAt,
      absoluteExpiresAt,
    }, db);
    await auditSessionEvent({
      req,
      usuarioId,
      sessionId: id,
      action: 'sesion_creada',
      db,
      registrarEventoPrivado,
    });
    return created;
  });

  return {
    record,
    accessToken: issueAccessToken({ usuarioId, sessionId: id, jwtConfig: dependencies.jwtConfig }),
    refreshToken,
  };
}

async function revokeInvalidSession({
  record,
  state,
  now,
  req,
  db,
  repository,
  registrarEventoPrivado,
}) {
  const changed = await repository.revocar({
    id: record.id,
    usuarioId: record.usuario_id,
    reason: state.reason,
    revokedAt: now,
  }, db);
  if (!changed) return;

  const action = state.code === 'SESSION_INACTIVE'
    ? 'sesion_inactiva'
    : state.code === 'SESSION_EXPIRED'
      ? 'sesion_expirada'
      : 'sesion_revocada';
  await auditSessionEvent({
    req,
    usuarioId: record.usuario_id,
    sessionId: record.id,
    action,
    reason: state.reason,
    db,
    obligatorio: !['SESSION_INACTIVE', 'SESSION_EXPIRED'].includes(state.code),
    registrarEventoPrivado,
  });
}

async function refreshSession({ refreshToken, req, dependencies = {} }) {
  const repository = dependencies.repository || authSessionsRepository;
  const config = dependencies.config || getSessionConfig();
  const clock = dependencies.clock || Date;
  const registrarEventoPrivado = resolvePrivateRegistrar(dependencies);
  const sessionId = sessionIdFromRefreshToken(refreshToken);
  if (!sessionId) throw sessionError();

  const result = await repository.enTransaccion(async (db) => {
    const now = nowDate(clock);
    const record = await repository.obtenerConUsuarioPorId(sessionId, db, { bloquear: true });
    const state = stateOfSession(record, config, now);
    if (state) {
      if (record && !record.revoked_at) {
        await revokeInvalidSession({
          record,
          state,
          now,
          req,
          db,
          repository,
          registrarEventoPrivado,
        });
      }
      return { errorCode: 'AUTHENTICATION_REQUIRED' };
    }

    const presentedHash = hashRefreshToken(refreshToken);
    if (!secureHashEqual(presentedHash, record.refresh_token_hash)) {
      await repository.revocar({
        id: record.id,
        usuarioId: record.usuario_id,
        reason: 'refresh_reuse_or_mismatch',
        revokedAt: now,
      }, db);
      await auditSessionEvent({
        req,
        usuarioId: record.usuario_id,
        sessionId: record.id,
        action: 'reutilizacion_refresh_detectada',
        reason: secureHashEqual(presentedHash, record.previous_refresh_token_hash)
          ? 'previous_refresh_reused'
          : 'refresh_mismatch',
        db,
        registrarEventoPrivado,
      });
      return { errorCode: 'AUTHENTICATION_REQUIRED' };
    }

    const nextRefreshToken = generateRefreshToken(record.id);
    const rotated = await repository.rotarRefresh({
      id: record.id,
      refreshTokenHash: hashRefreshToken(nextRefreshToken),
      previousRefreshTokenHash: record.refresh_token_hash,
      updatedAt: now,
    }, db);
    if (!rotated) throw sessionError();

    return {
      accessToken: issueAccessToken({
        usuarioId: record.usuario_id,
        sessionId: record.id,
        jwtConfig: dependencies.jwtConfig,
      }),
      refreshToken: nextRefreshToken,
      absoluteExpiresAt: record.absolute_expires_at,
    };
  });

  if (result.errorCode) throw sessionError(result.errorCode);
  return result;
}

async function invalidateSessionState({ sessionId, req, dependencies = {} }) {
  const repository = dependencies.repository || authSessionsRepository;
  const config = dependencies.config || getSessionConfig();
  const clock = dependencies.clock || Date;
  const registrarEventoPrivado = resolvePrivateRegistrar(dependencies);
  return repository.enTransaccion(async (db) => {
    const now = nowDate(clock);
    const record = await repository.obtenerConUsuarioPorId(sessionId, db, { bloquear: true });
    const state = stateOfSession(record, config, now);
    if (!record || !state || record.revoked_at) return 0;
    await revokeInvalidSession({
      record,
      state,
      now,
      req,
      db,
      repository,
      registrarEventoPrivado,
    });
    return 1;
  });
}

async function revokeCurrent({ sessionId, usuarioId, reason = 'logout', req, dependencies = {} }) {
  if (!sessionId || !usuarioId) return 0;
  const repository = dependencies.repository || authSessionsRepository;
  const clock = dependencies.clock || Date;
  const registrarEventoPrivado = resolvePrivateRegistrar(dependencies);
  return repository.enTransaccion(async (db) => {
    const now = nowDate(clock);
    const count = await repository.revocar({
      id: sessionId,
      usuarioId,
      reason,
      revokedAt: now,
    }, db);
    if (count) {
      await auditSessionEvent({
        req,
        usuarioId,
        sessionId,
        action: 'sesion_revocada',
        reason,
        db,
        registrarEventoPrivado,
      });
    }
    return count;
  });
}

async function revokeWithRefresh({ refreshToken, reason = 'logout', req, dependencies = {} }) {
  const sessionId = sessionIdFromRefreshToken(refreshToken);
  if (!sessionId) return 0;
  const repository = dependencies.repository || authSessionsRepository;
  const clock = dependencies.clock || Date;
  const registrarEventoPrivado = resolvePrivateRegistrar(dependencies);
  return repository.enTransaccion(async (db) => {
    const record = await repository.obtenerConUsuarioPorId(sessionId, db, { bloquear: true });
    if (!record || record.revoked_at) return 0;
    const presentedHash = hashRefreshToken(refreshToken);
    const matches = secureHashEqual(presentedHash, record.refresh_token_hash)
      || secureHashEqual(presentedHash, record.previous_refresh_token_hash);
    if (!matches) return 0;
    const now = nowDate(clock);
    const count = await repository.revocar({
      id: record.id,
      usuarioId: record.usuario_id,
      reason,
      revokedAt: now,
    }, db);
    if (count) {
      await auditSessionEvent({
        req,
        usuarioId: record.usuario_id,
        sessionId: record.id,
        action: 'sesion_revocada',
        reason,
        db,
        registrarEventoPrivado,
      });
    }
    return count;
  });
}

async function revokeAllInTransaction({
  usuarioId,
  reason,
  req,
  db,
  dependencies = {},
}) {
  const repository = dependencies.repository || authSessionsRepository;
  const registrarEventoPrivado = resolvePrivateRegistrar(dependencies);
  const clock = dependencies.clock || Date;
  const count = await repository.revocarTodasPorUsuario({
    usuarioId,
    reason,
    revokedAt: nowDate(clock),
  }, db);
  await auditSessionEvent({
    req,
    usuarioId,
    action: 'sesiones_revocadas',
    reason,
    count,
    db,
    registrarEventoPrivado,
  });
  return count;
}

async function revokeAll({ usuarioId, reason = 'logout_all', req, dependencies = {} }) {
  const repository = dependencies.repository || authSessionsRepository;
  return repository.enTransaccion((db) => revokeAllInTransaction({
    usuarioId,
    reason,
    req,
    db,
    dependencies: { ...dependencies, repository },
  }));
}

async function registerActivity({ sessionId, usuarioId, dependencies = {} }) {
  const repository = dependencies.repository || authSessionsRepository;
  const config = dependencies.config || getSessionConfig();
  return repository.actualizarActividad({
    id: sessionId,
    usuarioId,
    now: nowDate(dependencies.clock || Date),
    minIntervalSeconds: config.activityUpdateSeconds,
  });
}

module.exports = {
  createSession,
  generateRefreshToken,
  hashRefreshToken,
  invalidateSessionState,
  issueAccessToken,
  publicSessionMetadata,
  refreshSession,
  registerActivity,
  revokeAll,
  revokeAllInTransaction,
  revokeCurrent,
  revokeWithRefresh,
  secureHashEqual,
  sessionError,
  sessionIdFromRefreshToken,
  stateOfSession,
};
