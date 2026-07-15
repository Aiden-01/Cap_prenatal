const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authService = require('../src/services/authService');
const usuariosService = require('../src/services/usuariosService');
const sessionService = require('../src/services/sessionService');
const {
  createAuthMiddleware,
  csrfMiddleware,
} = require('../src/middleware/auth');
const {
  accessCookieOptions,
  clearAuthCookies,
  csrfCookieOptions,
  REFRESH_COOKIE_PATH,
  refreshCookieOptions,
} = require('../src/controllers/authController');
const {
  ConfigError,
  validateSessionConfig,
} = require('../src/config/env');
const { cleanup, runCleanup } = require('../src/db/cleanupAuthSessions');

const JWT_CONFIG = {
  secret: '7mQ2vR9xK4pT8zN3cF6hJ1sL5yB0dG7wE2',
  algorithm: 'HS256',
  issuer: 'cap-prenatal-api',
  audience: 'cap-prenatal-web',
  accessTokenTtlMinutes: 10,
};
const SESSION_CONFIG = {
  accessTokenTtlMinutes: 10,
  idleTimeoutMinutes: 15,
  warningMinutes: 13,
  absoluteHours: 8,
  activityUpdateSeconds: 60,
};
const SESSION_ID = '5ecde8e8-b0b7-4db6-96d4-9b013b1f7b34';
const NOW = new Date('2026-07-15T12:00:00.000Z');

function invoke(middleware, req) {
  return new Promise((resolve, reject) => {
    middleware(req, {}, (error) => (error ? reject(error) : resolve(req)));
  });
}

function activeRecord(overrides = {}) {
  return {
    id: SESSION_ID,
    usuario_id: 9,
    refresh_token_hash: 'a'.repeat(64),
    previous_refresh_token_hash: null,
    nombre_completo: 'Usuario Actual',
    username: 'actual',
    rol: 'director',
    activo: true,
    created_at: new Date(NOW.getTime() - 60_000),
    last_activity_at: new Date(NOW.getTime() - 60_000),
    absolute_expires_at: new Date(NOW.getTime() + 7 * 60 * 60 * 1000),
    revoked_at: null,
    ...overrides,
  };
}

function signedAccess(payload = { sid: SESSION_ID }, options = {}) {
  return jwt.sign(payload, JWT_CONFIG.secret, {
    algorithm: JWT_CONFIG.algorithm,
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
    subject: '9',
    jwtid: '03cae1d2-f50c-4f63-af6e-4f256f81b966',
    expiresIn: '10m',
    ...options,
  });
}

function authForRecord(recordOrError) {
  return createAuthMiddleware({
    repository: {
      async obtenerConUsuarioPorId() {
        if (recordOrError instanceof Error) throw recordOrError;
        return recordOrError;
      },
    },
    getJwt: () => JWT_CONFIG,
    getSession: () => SESSION_CONFIG,
    clock: { now: () => NOW.getTime() },
    invalidateSession: async () => {},
  });
}

test('configuracion de sesion usa defaults seguros y valida relaciones', () => {
  assert.deepEqual(validateSessionConfig({}), SESSION_CONFIG);
  for (const [variable, value] of [
    ['ACCESS_TOKEN_TTL_MINUTES', '0'],
    ['SESSION_IDLE_TIMEOUT_MINUTES', '-1'],
    ['SESSION_WARNING_MINUTES', '15'],
    ['SESSION_ABSOLUTE_HOURS', '0'],
    ['SESSION_ACTIVITY_UPDATE_SECONDS', '1.5'],
  ]) {
    const env = variable === 'SESSION_WARNING_MINUTES'
      ? { SESSION_IDLE_TIMEOUT_MINUTES: '15', [variable]: value }
      : { [variable]: value };
    assert.throws(
      () => validateSessionConfig(env),
      (error) => error instanceof ConfigError && error.variable === variable
    );
  }
});

test('access token es corto e incluye sid, sub y jti sin rol ni permisos', () => {
  const token = sessionService.issueAccessToken({ usuarioId: 9, sessionId: SESSION_ID, jwtConfig: JWT_CONFIG });
  const payload = jwt.verify(token, JWT_CONFIG.secret, {
    algorithms: ['HS256'],
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
  });
  assert.equal(payload.sid, SESSION_ID);
  assert.equal(payload.sub, '9');
  assert.equal(typeof payload.jti, 'string');
  assert.ok(payload.exp - payload.iat <= 10 * 60);
  assert.equal(payload.rol, undefined);
  assert.equal(payload.permisos, undefined);
});

test('crear sesion almacena solo hash del refresh y no deja login parcial', async () => {
  let inserted;
  let audited = false;
  const repository = {
    async enTransaccion(callback) { return callback({ transaction: true }); },
    async crear(args) {
      inserted = args;
      return activeRecord({ id: args.id, absolute_expires_at: args.absoluteExpiresAt, last_activity_at: args.createdAt });
    },
  };
  const created = await sessionService.createSession({
    usuarioId: 9,
    req: {},
    dependencies: {
      repository,
      config: SESSION_CONFIG,
      jwtConfig: JWT_CONFIG,
      clock: { now: () => NOW.getTime() },
      registrarEvento: async () => { audited = true; },
    },
  });
  assert.equal(audited, true);
  assert.equal(inserted.refreshTokenHash.length, 64);
  assert.notEqual(inserted.refreshTokenHash, created.refreshToken);
  assert.equal(inserted.refreshTokenHash, sessionService.hashRefreshToken(created.refreshToken));
  assert.equal(JSON.stringify(inserted).includes(created.refreshToken), false);

  await assert.rejects(
    sessionService.createSession({
      usuarioId: 9,
      req: {},
      dependencies: { ...created, repository: { enTransaccion: async () => { throw new Error('db down'); } } },
    }),
    /db down/
  );
});

test('login crea sesion y un usuario inactivo no inicia', async () => {
  let created = 0;
  const passwordHash = bcrypt.hashSync('correcta', 4);
  const dependencies = {
    authRepository: {
      async obtenerUsuarioPorUsername() {
        return { id: 9, username: 'actual', nombre_completo: 'Actual', rol: 'admin', activo: true, password_hash: passwordHash };
      },
    },
    permisosRepository: { async listarCodigosPorUsuario() { return ['pacientes.ver']; } },
    sessionService: {
      async createSession() {
        created += 1;
        return { accessToken: 'access-value', refreshToken: 'refresh-value', record: activeRecord() };
      },
      publicSessionMetadata: sessionService.publicSessionMetadata,
    },
    registrarAuditoria: async () => {},
  };
  const result = await authService.login({ username: 'actual', password: 'correcta', req: {}, dependencies });
  assert.equal(created, 1);
  assert.equal(result.usuario.rol, 'admin');
  assert.match(result.csrfToken, /^[a-f0-9]{64}$/);

  dependencies.authRepository.obtenerUsuarioPorUsername = async () => ({
    id: 9, username: 'actual', activo: false, password_hash: passwordHash,
  });
  await assert.rejects(
    authService.login({ username: 'actual', password: 'correcta', req: {}, dependencies }),
    (error) => error.statusCode === 401
  );
  assert.equal(created, 1);
});

test('middleware autoriza sesion activa y usa rol vigente de PostgreSQL', async () => {
  const req = { headers: { authorization: `Bearer ${signedAccess()}` } };
  await invoke(authForRecord(activeRecord({ rol: 'personal_salud' })), req);
  assert.equal(req.usuario.rol, 'personal_salud');
  assert.equal(req.usuario.id, 9);
});

test('middleware rechaza sesion ausente, revocada, inactiva, absoluta y usuario inactivo', async () => {
  const cases = [
    [null, 'AUTHENTICATION_REQUIRED'],
    [activeRecord({ revoked_at: NOW }), 'SESSION_REVOKED'],
    [activeRecord({ last_activity_at: new Date(NOW.getTime() - 15 * 60 * 1000) }), 'SESSION_INACTIVE'],
    [activeRecord({ absolute_expires_at: NOW }), 'SESSION_EXPIRED'],
    [activeRecord({ activo: false }), 'USER_INACTIVE'],
  ];
  for (const [record, code] of cases) {
    await assert.rejects(
      invoke(authForRecord(record), { headers: { authorization: `Bearer ${signedAccess()}` } }),
      (error) => error.statusCode === 401 && error.code === code,
      code
    );
  }
});

test('inactividad detectada se persiste como revocacion y se audita', async () => {
  const record = activeRecord({ last_activity_at: new Date(NOW.getTime() - 16 * 60 * 1000) });
  const events = [];
  await sessionService.invalidateSessionState({
    sessionId: SESSION_ID,
    req: {},
    dependencies: {
      repository: {
        async enTransaccion(callback) { return callback({}); },
        async obtenerConUsuarioPorId() { return record; },
        async revocar(args) { record.revoked_at = args.revokedAt; return 1; },
      },
      config: SESSION_CONFIG,
      clock: { now: () => NOW.getTime() },
      registrarEvento: async (_req, event) => events.push(event),
    },
  });
  assert.equal(record.revoked_at.toISOString(), NOW.toISOString());
  assert.equal(events[0].datosNuevos.tipo_evento, 'sesion_inactiva');
});

test('token antiguo sin sid y fallo de base de datos fallan de forma cerrada', async () => {
  const oldToken = signedAccess({ rol: 'admin' });
  await assert.rejects(
    invoke(authForRecord(activeRecord()), { headers: { authorization: `Bearer ${oldToken}` } }),
    (error) => error.code === 'AUTHENTICATION_REQUIRED'
  );
  await assert.rejects(
    invoke(authForRecord(new Error('database unavailable')), { headers: { authorization: `Bearer ${signedAccess()}` } }),
    /database unavailable/
  );
});

test('access expirado se distingue sin consultar la sesion', async () => {
  let queries = 0;
  const expired = signedAccess(undefined, { expiresIn: '-1s' });
  const middleware = createAuthMiddleware({
    repository: { async obtenerConUsuarioPorId() { queries += 1; } },
    getJwt: () => JWT_CONFIG,
    getSession: () => SESSION_CONFIG,
  });
  await assert.rejects(
    invoke(middleware, { headers: { authorization: `Bearer ${expired}` } }),
    (error) => error.code === 'ACCESS_TOKEN_EXPIRED'
  );
  assert.equal(queries, 0);
});

function refreshMemory() {
  const original = sessionService.generateRefreshToken(SESSION_ID);
  const record = activeRecord({ refresh_token_hash: sessionService.hashRefreshToken(original) });
  const events = [];
  const repository = {
    async enTransaccion(callback) { return callback({ transaction: true }); },
    async obtenerConUsuarioPorId() { return { ...record }; },
    async rotarRefresh(args) {
      record.previous_refresh_token_hash = args.previousRefreshTokenHash;
      record.refresh_token_hash = args.refreshTokenHash;
      return { ...record };
    },
    async revocar(args) { record.revoked_at = args.revokedAt; record.revoked_reason = args.reason; return 1; },
  };
  return { original, record, repository, events };
}

test('refresh rota atomicamente sin actualizar actividad ni ampliar limite absoluto', async () => {
  const memory = refreshMemory();
  const beforeActivity = memory.record.last_activity_at;
  const beforeAbsolute = memory.record.absolute_expires_at;
  const result = await sessionService.refreshSession({
    refreshToken: memory.original,
    req: {},
    dependencies: {
      repository: memory.repository,
      config: SESSION_CONFIG,
      jwtConfig: JWT_CONFIG,
      clock: { now: () => NOW.getTime() },
      registrarEvento: async (_req, event) => memory.events.push(event),
    },
  });
  assert.notEqual(result.refreshToken, memory.original);
  assert.equal(memory.record.refresh_token_hash, sessionService.hashRefreshToken(result.refreshToken));
  assert.equal(memory.record.previous_refresh_token_hash, sessionService.hashRefreshToken(memory.original));
  assert.equal(memory.record.last_activity_at, beforeActivity);
  assert.equal(result.absoluteExpiresAt, beforeAbsolute);
});

test('dos refresh simultaneos con el mismo valor producen una sola rotacion y revocan ante reutilizacion', async () => {
  const original = sessionService.generateRefreshToken(SESSION_ID);
  const record = activeRecord({ refresh_token_hash: sessionService.hashRefreshToken(original) });
  let transactionTail = Promise.resolve();
  let rotations = 0;
  const repository = {
    async enTransaccion(callback) {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback({ transaction: true });
      } finally {
        release();
      }
    },
    async obtenerConUsuarioPorId() { return { ...record }; },
    async rotarRefresh(args) {
      rotations += 1;
      record.previous_refresh_token_hash = args.previousRefreshTokenHash;
      record.refresh_token_hash = args.refreshTokenHash;
      return { ...record };
    },
    async revocar(args) {
      if (record.revoked_at) return 0;
      record.revoked_at = args.revokedAt;
      record.revoked_reason = args.reason;
      return 1;
    },
  };
  const dependencies = {
    repository,
    config: SESSION_CONFIG,
    jwtConfig: JWT_CONFIG,
    clock: { now: () => NOW.getTime() },
    registrarEvento: async () => {},
  };

  const results = await Promise.allSettled([
    sessionService.refreshSession({ refreshToken: original, req: {}, dependencies }),
    sessionService.refreshSession({ refreshToken: original, req: {}, dependencies }),
  ]);

  assert.deepEqual(results.map(({ status }) => status), ['fulfilled', 'rejected']);
  assert.equal(rotations, 1);
  assert.equal(results[1].reason.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(record.revoked_reason, 'refresh_reuse_or_mismatch');
  assert.ok(record.revoked_at instanceof Date);
});

test('reutilizar refresh anterior revoca la sesion y registra evento minimo', async () => {
  const memory = refreshMemory();
  await sessionService.refreshSession({
    refreshToken: memory.original,
    req: {},
    dependencies: {
      repository: memory.repository, config: SESSION_CONFIG, jwtConfig: JWT_CONFIG,
      clock: { now: () => NOW.getTime() }, registrarEvento: async (_req, event) => memory.events.push(event),
    },
  });
  await assert.rejects(
    sessionService.refreshSession({
      refreshToken: memory.original,
      req: {},
      dependencies: {
        repository: memory.repository, config: SESSION_CONFIG, jwtConfig: JWT_CONFIG,
        clock: { now: () => NOW.getTime() }, registrarEvento: async (_req, event) => memory.events.push(event),
      },
    }),
    (error) => error.statusCode === 401
  );
  assert.equal(memory.record.revoked_reason, 'refresh_reuse_or_mismatch');
  assert.equal(memory.events.at(-1).datosNuevos.tipo_evento, 'reutilizacion_refresh_detectada');
  assert.doesNotMatch(JSON.stringify(memory.events), /refresh_token_hash|[A-Za-z0-9_-]{64,}/);
});

test('actividad usa throttling SQL configurado y me no escribe actividad', async () => {
  let updateArgs;
  await sessionService.registerActivity({
    sessionId: SESSION_ID,
    usuarioId: 9,
    dependencies: {
      repository: { async actualizarActividad(args) { updateArgs = args; } },
      config: SESSION_CONFIG,
      clock: { now: () => NOW.getTime() },
    },
  });
  assert.equal(updateArgs.minIntervalSeconds, 60);
  let permissionReads = 0;
  const me = await authService.me({
    usuario: activeRecord(),
    authSession: activeRecord(),
    dependencies: {
      permisosRepository: { async listarCodigosPorUsuario() { permissionReads += 1; return []; } },
    },
  });
  assert.equal(permissionReads, 1);
  assert.equal(me.idleTimeoutSeconds, 900);
});

test('sesion ya inactiva se rechaza antes de cualquier escritura de actividad', async () => {
  let invalidations = 0;
  let activityWrites = 0;
  const record = activeRecord({ last_activity_at: new Date(NOW.getTime() - 16 * 60 * 1000) });
  const middleware = createAuthMiddleware({
    repository: {
      async obtenerConUsuarioPorId() { return record; },
      async actualizarActividad() { activityWrites += 1; },
    },
    getJwt: () => JWT_CONFIG,
    getSession: () => SESSION_CONFIG,
    clock: { now: () => NOW.getTime() },
    invalidateSession: async () => { invalidations += 1; },
  });
  await assert.rejects(
    invoke(middleware, { headers: { authorization: `Bearer ${signedAccess()}` } }),
    (error) => error.code === 'SESSION_INACTIVE'
  );
  assert.equal(invalidations, 1);
  assert.equal(activityWrites, 0);
});

test('logout revoca la sesion actual y logout-all solo usa el usuario autenticado', async () => {
  const calls = [];
  const fake = {
    async revokeCurrent(args) { calls.push(['current', args.sessionId, args.usuarioId]); },
    async revokeAll(args) { calls.push(['all', args.usuarioId]); },
  };
  await authService.logout({ logoutClaims: { sessionId: SESSION_ID, usuarioId: '9' } }, { sessionService: fake });
  await authService.logoutAll({ req: { usuario: { id: 9 } }, dependencies: { sessionService: fake } });
  assert.deepEqual(calls, [['current', SESSION_ID, '9'], ['all', 9]]);
});

test('logout con refresh sigue revocando cuando el access cookie ya expiro', async () => {
  const memory = refreshMemory();
  await sessionService.revokeWithRefresh({
    refreshToken: memory.original,
    reason: 'logout',
    req: {},
    dependencies: {
      repository: memory.repository,
      clock: { now: () => NOW.getTime() },
      registrarEvento: async () => {},
    },
  });
  assert.equal(memory.record.revoked_reason, 'logout');
  await assert.rejects(
    sessionService.refreshSession({
      refreshToken: memory.original,
      req: {},
      dependencies: {
        repository: memory.repository,
        config: SESSION_CONFIG,
        jwtConfig: JWT_CONFIG,
        clock: { now: () => NOW.getTime() },
        registrarEvento: async () => {},
      },
    }),
    (error) => error.code === 'AUTHENTICATION_REQUIRED'
  );
});

test('cambio propio de contrasena actualiza y revoca todo en la misma transaccion', async () => {
  const oldHash = bcrypt.hashSync('anterior', 4);
  const db = { transaction: true };
  const calls = [];
  await authService.changePassword({
    usuarioId: 9,
    currentPassword: 'anterior',
    newPassword: 'nueva-segura',
    req: { usuario: { id: 9 } },
    dependencies: {
      authRepository: {
        async obtenerCredencialesPorId() { return { id: 9, username: 'actual', activo: true, password_hash: oldHash }; },
        async actualizarPassword(_args, connection) { assert.equal(connection, db); calls.push('password'); },
      },
      authSessionsRepository: { async enTransaccion(callback) { return callback(db); } },
      sessionService: {
        async revokeAllInTransaction(args) { assert.equal(args.db, db); calls.push('revoke'); },
      },
      registrarEvento: async (_req, _event, options) => { assert.equal(options.db, db); calls.push('audit'); },
    },
  });
  assert.deepEqual(calls, ['password', 'revoke', 'audit']);
});

test('eliminacion permitida revoca sesiones antes de eliminar al usuario', async () => {
  const db = { transaction: true };
  const calls = [];
  const usuariosRepository = {
    async obtenerVisibleParaActor() {
      return { id: 12, rol: 'personal_salud', activo: true, tiene_registros: false, puede_eliminarse: true };
    },
    async eliminar(id, connection) { assert.equal(connection, db); calls.push(`delete:${id}`); },
  };
  await usuariosService.eliminarUsuario({
    id: 12,
    req: { usuario: { id: 9, rol: 'director' } },
    dependencies: {
      usuariosRepository,
      permisosRepository: { async enTransaccion(callback) { return callback(db); } },
      authSessionsRepository: {},
      sessionService: {
        async revokeAllInTransaction(args) {
          assert.equal(args.db, db);
          assert.equal(args.usuarioId, 12);
          calls.push('revoke');
        },
      },
      registrarEvento: async () => {},
      registrarAuditoria: async () => { calls.push('audit'); },
    },
  });
  assert.deepEqual(calls, ['revoke', 'delete:12', 'audit']);
});

test('cookies de acceso y refresh son HttpOnly, Secure en produccion y respetan el limite absoluto', () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, COOKIE_SAMESITE: process.env.COOKIE_SAMESITE };
  process.env.NODE_ENV = 'test';
  process.env.COOKIE_SAMESITE = 'lax';
  try {
    assert.equal(accessCookieOptions().httpOnly, true);
    assert.equal(accessCookieOptions().path, '/');
    assert.equal(refreshCookieOptions().httpOnly, true);
    assert.equal(refreshCookieOptions().path, REFRESH_COOKIE_PATH);
    assert.equal(REFRESH_COOKIE_PATH, '/api/auth');
    assert.equal(csrfCookieOptions().httpOnly, false);
    const nearAbsolute = new Date(Date.now() + 2_000);
    assert.ok(accessCookieOptions(nearAbsolute).maxAge <= 2_000);
    assert.ok(refreshCookieOptions(nearAbsolute).maxAge <= 2_000);
    process.env.NODE_ENV = 'production';
    assert.equal(accessCookieOptions().secure, true);
    assert.equal(refreshCookieOptions().secure, true);
    assert.equal(csrfCookieOptions().secure, true);
    const cleared = [];
    clearAuthCookies({ clearCookie: (name, options) => cleared.push({ name, options }) });
    assert.deepEqual(cleared.map(({ name, options }) => [name, options.path]), [
      ['cap_prenatal_token', '/'],
      ['cap_prenatal_refresh', '/api/auth'],
      ['cap_prenatal_csrf', '/'],
    ]);
    assert.equal(cleared.every(({ options }) => options.maxAge === undefined), true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('CSRF protege refresh, activity, logout y logout-all', async () => {
  for (const pathName of ['/api/auth/refresh', '/api/auth/activity', '/api/auth/logout', '/api/auth/logout-all']) {
    await assert.rejects(
      invoke(csrfMiddleware, { method: 'POST', originalUrl: pathName, path: pathName.slice(4), headers: {} }),
      (error) => error.statusCode === 403 && error.code === 'CSRF_INVALID'
    );
    await invoke(csrfMiddleware, {
      method: 'POST', originalUrl: pathName, path: pathName.slice(4),
      headers: { cookie: 'cap_prenatal_csrf=safe-csrf', 'x-csrf-token': 'safe-csrf' },
    });
  }
});

test('limpieza elimina solo mediante el corte de retencion indicado', async () => {
  let before;
  const count = await cleanup({
    repository: { async eliminarAntiguas(args) { before = args.before; return 4; } },
    clock: { now: () => NOW.getTime() },
    env: { SESSION_RETENTION_DAYS: '30' },
  });
  assert.equal(count, 4);
  assert.equal(before.toISOString(), '2026-06-15T12:00:00.000Z');
});

test('limpieza operacional propaga fallo por exit code y siempre cierra el pool', async () => {
  const errors = [];
  const codes = [];
  let ended = 0;
  const failure = new Error('database unavailable');
  const result = await runCleanup({
    cleanupTask: async () => { throw failure; },
    db: { async end() { ended += 1; } },
    logger: { log() {}, error: (...args) => errors.push(args) },
    setExitCode: (code) => codes.push(code),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, failure);
  assert.equal(ended, 1);
  assert.deepEqual(codes, [1]);
  assert.match(errors[0].join(' '), /database unavailable/);
});

test('limpieza operacional tambien falla si no puede cerrar el pool', async () => {
  const codes = [];
  const closeError = new Error('close failed');
  const result = await runCleanup({
    cleanupTask: async () => 0,
    db: { async end() { throw closeError; } },
    logger: { log() {}, error() {} },
    setExitCode: (code) => codes.push(code),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, closeError);
  assert.deepEqual(codes, [1]);
});

test('SQL de actividad y limpieza no mantiene viva ni elimina una sesion activa vigente', () => {
  const repositorySource = fs.readFileSync(
    path.join(__dirname, '../src/repositories/authSessionsRepository.js'),
    'utf8'
  );
  assert.match(repositorySource, /SET last_activity_at = \$1[\s\S]*last_activity_at <= \$1 - \(\$4 \* INTERVAL '1 second'\)/);
  assert.match(repositorySource, /revoked_at IS NOT NULL AND revoked_at < \$1/);
  assert.match(repositorySource, /absolute_expires_at < \$1/);
  assert.doesNotMatch(repositorySource, /DELETE FROM auth_sessions\s+WHERE created_at/);
});

test('migracion 007 conserva FK cascade e indice unico del refresh vigente', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../src/db/migrations/007_auth_sessions.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS auth_sessions/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_sessions_refresh_token_hash/);
});

test('cambio propio limpia cookies y el frontend termina la sesion local', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/authController.js'), 'utf8');
  const layout = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/Layout.jsx'), 'utf8');
  assert.match(controller, /const changePassword[\s\S]*await authService\.changePassword[\s\S]*clearAuthCookies\(res\)/);
  assert.match(layout, /await api\.post\("\/auth\/cambiar-password"[\s\S]*endLocalSession\(/);
});

test('fuentes de sesion no imprimen credenciales ni almacenan access token', () => {
  const files = [
    '../src/services/sessionService.js',
    '../src/repositories/authSessionsRepository.js',
    '../src/middleware/auth.js',
  ].map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');
  assert.doesNotMatch(files, /console\.(?:log|info)\([^\n]*(?:token|password|cookie|hash)/i);
  const migration = fs.readFileSync(path.join(__dirname, '../src/db/migrations/007_auth_sessions.sql'), 'utf8');
  assert.doesNotMatch(migration, /access_token/i);
  assert.match(migration, /refresh_token_hash/);
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/authController.js'), 'utf8');
  assert.match(controller, /res\.json\(\{ usuario: result\.usuario \}\)/);
  assert.doesNotMatch(controller, /res\.json\([^\n]*(?:accessToken|refreshToken)/);
});
