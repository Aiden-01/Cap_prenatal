const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const auditService = require('../src/services/auditService');
const authService = require('../src/services/authService');
const sessionService = require('../src/services/sessionService');
const usuariosService = require('../src/services/usuariosService');
const { createPdfController } = require('../src/controllers/pdfController');

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function privateRecorder({ fail = false } = {}) {
  const events = [];
  const repository = {
    async insertarEvento(event) {
      if (fail) throw new Error('audit insert failed');
      events.push(event);
    },
  };
  return {
    events,
    registrarEventoPrivado(req, event, options = {}) {
      return auditService.registrarEventoPrivado(req, event, {
        ...options,
        repository,
      });
    },
  };
}

function assertNoSensitiveAuditData(event) {
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(
    serialized,
    /password_hash|refresh_token|access_token|authorization|cookie|csrf|user-agent|nombre secreta|1234567890101|%PDF|<html/i
  );
  assert.equal(event.ip, null);
  assert.equal(event.userAgent, null);
  assert.equal(event.datosNuevos.politica_version, 1);
}

test('integracion central exige contexto y sanea antes del repositorio', async () => {
  const recorder = privateRecorder();
  await assert.rejects(
    auditService.registrarEventoPrivado({}, {
      accion: 'login_fallido',
      metadata: { resultado: 'fallido' },
    }, { repository: { insertarEvento: async () => assert.fail('no debe insertar') } }),
    /requiere categoria, entidad y evento/
  );

  await recorder.registrarEventoPrivado({
    ip: '10.0.0.1',
    headers: { authorization: 'Bearer access-secret', cookie: 'refresh=secret' },
    body: { password: 'secreto', username: 'usuario escrito' },
  }, {
    contexto: { categoria: 'autenticacion', entidad: 'usuario', evento: 'login_fallido' },
    accion: 'login_fallido',
    metadata: {
      resultado: 'fallido',
      motivo_codigo: 'credenciales_incorrectas',
      username: 'usuario escrito',
      password: 'secreto',
      anidado: { refresh_token: 'refresh-secret' },
    },
  });

  assert.deepEqual(recorder.events[0].datosNuevos, {
    motivo_codigo: 'credenciales_incorrectas',
    politica_version: 1,
    resultado: 'fallido',
  });
  assertNoSensitiveAuditData(recorder.events[0]);
});

test('login exitoso, fallido e inactivo no auditan credenciales ni identidad escrita', async () => {
  const recorder = privateRecorder();
  const passwordHash = bcrypt.hashSync('correcta', 4);
  const baseDependencies = {
    permisosRepository: { async listarCodigosPorUsuario() { return ['pacientes.ver']; } },
    registrarEventoPrivado: recorder.registrarEventoPrivado,
    sessionService: {
      async createSession() {
        return {
          accessToken: 'access-token-secret',
          refreshToken: 'refresh-token-secret',
          record: {
            absolute_expires_at: new Date('2026-07-20T00:00:00.000Z'),
            last_activity_at: new Date('2026-07-16T00:00:00.000Z'),
          },
        };
      },
      publicSessionMetadata() { return {}; },
    },
  };

  await authService.login({
    username: 'actual',
    password: 'correcta',
    req: { headers: { cookie: 'secret' } },
    dependencies: {
      ...baseDependencies,
      authRepository: {
        async obtenerUsuarioPorUsername() {
          return {
            id: 9,
            activo: true,
            username: 'actual',
            nombre_completo: 'Nombre Secreta',
            rol: 'admin',
            password_hash: passwordHash,
          };
        },
      },
    },
  });

  await assert.rejects(authService.login({
    username: 'usuario escrito',
    password: 'password escrito',
    req: { body: { username: 'usuario escrito', password: 'password escrito' } },
    dependencies: {
      ...baseDependencies,
      authRepository: { async obtenerUsuarioPorUsername() { return null; } },
    },
  }), /Credenciales incorrectas/);

  await assert.rejects(authService.login({
    username: 'inactivo',
    password: 'correcta',
    req: {},
    dependencies: {
      ...baseDependencies,
      authRepository: {
        async obtenerUsuarioPorUsername() {
          return { id: 12, activo: false, username: 'inactivo', password_hash: passwordHash };
        },
      },
    },
  }), /Credenciales incorrectas/);

  assert.deepEqual(
    recorder.events.map((event) => event.descripcion),
    ['login_exitoso', 'login_fallido', 'login_usuario_inactivo']
  );
  assert.equal(recorder.events[1].usuarioId, null);
  assert.equal(recorder.events[2].datosNuevos.motivo_codigo, 'usuario_inactivo');
  recorder.events.forEach(assertNoSensitiveAuditData);
});

test('logout y logout_all no serializan JWT, refresh, cookies ni headers', async () => {
  const recorder = privateRecorder();
  const sessions = {
    async revokeCurrent() { return 1; },
    async revokeAll() { return 3; },
  };
  await authService.logout({
    logoutClaims: { sessionId: SESSION_ID, usuarioId: 9 },
    logoutRefreshToken: `${SESSION_ID}.refresh-secret`,
    headers: { authorization: 'Bearer jwt-secret', cookie: 'access=secret' },
  }, { sessionService: sessions, registrarEventoPrivado: recorder.registrarEventoPrivado });
  await authService.logoutAll({
    req: { usuario: { id: 9 }, cookies: { refresh: 'secret' } },
    dependencies: { sessionService: sessions, registrarEventoPrivado: recorder.registrarEventoPrivado },
  });

  assert.deepEqual(recorder.events.map((event) => event.descripcion), ['logout', 'logout_all']);
  recorder.events.forEach(assertNoSensitiveAuditData);
});

test('crear y actualizar usuario conservan solo campos y transiciones permitidas', async () => {
  const recorder = privateRecorder();
  const created = {
    id: 22,
    nombre_completo: 'Nombre Secreta',
    username: 'identidad.secreta',
    rol: 'admin',
    activo: true,
  };
  await usuariosService.crearUsuario({
    body: {
      nombre_completo: created.nombre_completo,
      username: created.username,
      password: 'PasswordSecreto123!',
      rol: created.rol,
    },
    req: { usuario: { id: 7, rol: 'director' } },
    dependencies: {
      usuariosRepository: { async crear() { return created; } },
      permisosRepository: { async asignarPermisosIniciales() {} },
      registrarEventoPrivado: recorder.registrarEventoPrivado,
    },
  });

  let current = { ...created };
  const usuariosRepository = {
    async obtenerVisibleParaActor() { return { ...current }; },
    async actualizar(args) {
      current = { ...current, nombre_completo: args.nombreCompleto, activo: args.activo, rol: args.rol };
      return { ...current };
    },
    async contarAdminsActivos() { return 2; },
    async contarDirectoresActivos() { return 2; },
  };
  await usuariosService.actualizarUsuario({
    id: 22,
    body: { nombre_completo: 'Nombre Secreta Nueva', activo: true, rol: 'admin' },
    req: { usuario: { id: 7, rol: 'director' } },
    dependencies: {
      usuariosRepository,
      registrarEventoPrivado: recorder.registrarEventoPrivado,
    },
  });

  assert.deepEqual(recorder.events[0].datosNuevos, {
    campos_registrados: ['nombre_completo', 'rol', 'username'],
    politica_version: 1,
  });
  assert.deepEqual(recorder.events[1].datosNuevos, {
    campos_sensibles_modificados: ['nombre_completo'],
    politica_version: 1,
  });
  recorder.events.forEach(assertNoSensitiveAuditData);
});

test('cambio y reinicio de password guardan unicamente el booleano y son obligatorios', async () => {
  const recorder = privateRecorder();
  const db = { transaction: true };
  const previousHash = bcrypt.hashSync('anterior', 4);
  let auditOptions;
  await authService.changePassword({
    usuarioId: 9,
    currentPassword: 'anterior',
    newPassword: 'nueva-segura',
    req: { usuario: { id: 9 }, body: { newPassword: 'nueva-segura' } },
    dependencies: {
      authRepository: {
        async obtenerCredencialesPorId() {
          return { id: 9, activo: true, username: 'secreto', password_hash: previousHash };
        },
        async actualizarPassword(_args, connection) { assert.equal(connection, db); },
      },
      authSessionsRepository: { async enTransaccion(callback) { return callback(db); } },
      sessionService: { async revokeAllInTransaction() {} },
      registrarEventoPrivado(req, event, options) {
        auditOptions = options;
        return recorder.registrarEventoPrivado(req, event, options);
      },
    },
  });

  assert.deepEqual(recorder.events[0].datosNuevos, {
    password_cambiado: true,
    politica_version: 1,
  });
  assert.equal(auditOptions.db, db);
  assert.equal(auditOptions.obligatorio, true);
  assertNoSensitiveAuditData(recorder.events[0]);
});

test('fallo de auditoria obligatoria revierte el cambio de password', async () => {
  const originalHash = bcrypt.hashSync('anterior', 4);
  let storedHash = originalHash;
  const failing = privateRecorder({ fail: true });

  await assert.rejects(authService.changePassword({
    usuarioId: 9,
    currentPassword: 'anterior',
    newPassword: 'nueva-segura',
    req: { usuario: { id: 9 } },
    dependencies: {
      authRepository: {
        async obtenerCredencialesPorId() {
          return { id: 9, activo: true, password_hash: storedHash };
        },
        async actualizarPassword({ passwordHash }) { storedHash = passwordHash; },
      },
      authSessionsRepository: {
        async enTransaccion(callback) {
          const snapshot = storedHash;
          try { return await callback({ transaction: true }); }
          catch (error) { storedHash = snapshot; throw error; }
        },
      },
      sessionService: { async revokeAllInTransaction() {} },
      registrarEventoPrivado: failing.registrarEventoPrivado,
    },
  }), /audit insert failed/);

  assert.equal(storedHash, originalHash);
});

test('eliminacion de usuario guarda campos, no snapshot, y revierte si falla auditoria', async () => {
  let deleted = false;
  const target = {
    id: 12,
    nombre_completo: 'Nombre Secreta',
    username: 'identidad.secreta',
    rol: 'personal_salud',
    activo: true,
    tiene_registros: false,
    puede_eliminarse: true,
  };
  const recorder = privateRecorder();
  const makeDependencies = (audit) => ({
    usuariosRepository: {
      async obtenerVisibleParaActor() { return { ...target }; },
      async eliminar() { deleted = true; },
    },
    permisosRepository: {
      async enTransaccion(callback) {
        const snapshot = deleted;
        try { return await callback({ transaction: true }); }
        catch (error) { deleted = snapshot; throw error; }
      },
    },
    sessionService: { async revokeAllInTransaction() {} },
    authSessionsRepository: {},
    registrarEventoPrivado: audit,
  });

  await usuariosService.eliminarUsuario({
    id: 12,
    req: { usuario: { id: 7, rol: 'director' } },
    dependencies: makeDependencies(recorder.registrarEventoPrivado),
  });
  assert.equal(deleted, true);
  assert.ok(recorder.events[0].datosNuevos.campos_eliminados.includes('nombre_completo'));
  assert.equal(recorder.events[0].datosNuevos.nombre_completo, undefined);
  assertNoSensitiveAuditData(recorder.events[0]);

  deleted = false;
  const failing = privateRecorder({ fail: true });
  await assert.rejects(usuariosService.eliminarUsuario({
    id: 12,
    req: { usuario: { id: 7, rol: 'director' } },
    dependencies: makeDependencies(failing.registrarEventoPrivado),
  }), /audit insert failed/);
  assert.equal(deleted, false);
});

test('sesiones auditan identificador, motivo y cantidad sin refresh ni hash', async () => {
  const recorder = privateRecorder();
  let stored;
  const repository = {
    async enTransaccion(callback) { return callback({ transaction: true }); },
    async crear(args) {
      stored = args;
      return {
        id: args.id,
        usuario_id: args.usuarioId,
        absolute_expires_at: args.absoluteExpiresAt,
        last_activity_at: args.createdAt,
      };
    },
    async revocarTodasPorUsuario() { return 4; },
  };
  const created = await sessionService.createSession({
    usuarioId: 9,
    req: { usuario: { id: 9 }, headers: { cookie: 'secret' } },
    dependencies: {
      repository,
      registrarEventoPrivado: recorder.registrarEventoPrivado,
      config: { absoluteHours: 12 },
      jwtConfig: {
        secret: '0123456789abcdef0123456789abcdef',
        algorithm: 'HS256',
        audience: 'cap-prenatal-web',
        issuer: 'cap-prenatal',
        accessTokenTtlMinutes: 10,
      },
    },
  });
  assert.match(stored.refreshTokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(created.refreshToken, stored.refreshTokenHash);

  await sessionService.revokeAllInTransaction({
    usuarioId: 9,
    reason: 'permissions_changed',
    req: { usuario: { id: 7 } },
    db: { transaction: true },
    dependencies: { repository, registrarEventoPrivado: recorder.registrarEventoPrivado },
  });

  assert.equal(recorder.events[0].descripcion, 'sesion_creada');
  assert.equal(recorder.events[0].idEntidad, stored.id);
  assert.equal(recorder.events[1].datosNuevos.cantidad_sesiones_revocadas, 4);
  recorder.events.forEach(assertNoSensitiveAuditData);
});

test('PDF guarda solo tipo, formato e IDs; fallo best effort no rompe la descarga', async () => {
  const recorder = privateRecorder();
  const req = {
    params: { pacienteId: 41 },
    query: { embarazo_id: 91 },
    usuario: { id: 7 },
  };
  let sent = 0;
  const response = {};
  const baseOverrides = {
    consumePdfQuota() {},
    generarFichaClinicaPrenatalPdf: async () => Buffer.from('%PDF-clinico-secreto'),
    pdfService: {
      async obtenerFichaMspasData() {
        return {
          paciente: { id: 41, nombre_completo: 'Nombre Secreta', cui: '1234567890101' },
          embarazo: { id: 91 },
          html: '<html>clinico</html>',
        };
      },
    },
    sendPdfResponse() { sent += 1; },
  };
  await createPdfController({
    ...baseOverrides,
    registrarEventoPrivado: recorder.registrarEventoPrivado,
  }).pdfMspas(req, response);

  const event = recorder.events[0];
  assert.equal(event.pacienteId, 41);
  assert.equal(event.embarazoId, 91);
  assert.deepEqual(event.datosNuevos, {
    formato: 'pdf',
    politica_version: 1,
    resultado: 'generado',
    tipo_documento: 'ficha_mspas_prenatal',
  });
  assertNoSensitiveAuditData(event);

  const failing = privateRecorder({ fail: true });
  await createPdfController({
    ...baseOverrides,
    registrarEventoPrivado: failing.registrarEventoPrivado,
  }).pdfMspas(req, response);
  assert.equal(sent, 2);
});

test('reportes aceptan solo tipo, formato, fechas ISO y cantidad', async () => {
  const recorder = privateRecorder();
  await recorder.registrarEventoPrivado({ usuario: { id: 7 } }, {
    contexto: { categoria: 'reportes', entidad: 'exportacion', evento: 'exportacion_censo' },
    accion: 'exportar',
    metadata: {
      tipo_reporte: 'censo_primer_control',
      formato: 'xlsx',
      desde: '2026-07-01',
      hasta: '2026-07-31',
      cantidad_filas: 25,
      filtros: { comunidad: 'Nombre Secreta' },
      filas: [{ nombre: 'Nombre Secreta', cui: '1234567890101' }],
      buffer: Buffer.from('secreto'),
      html: '<html>secreto</html>',
    },
  });

  assert.deepEqual(recorder.events[0].datosNuevos, {
    cantidad_filas: 25,
    desde: '2026-07-01',
    formato: 'xlsx',
    hasta: '2026-07-31',
    politica_version: 1,
    tipo_reporte: 'censo_primer_control',
  });
  assertNoSensitiveAuditData(recorder.events[0]);
});

test('el camino legado sigue disponible para morbilidad clinica pendiente de 4B.3C', async () => {
  let query;
  await auditService.registrarEvento({ usuario: { id: 7 } }, {
    accion: 'actualizar',
    tabla: 'morbilidad_embarazo',
    registroId: 31,
    datosNuevos: { diagnostico: 'dato clinico legado' },
  }, {
    db: { async query(sql, params) { query = { sql, params }; } },
    obligatorio: true,
  });
  assert.match(query.sql, /INSERT INTO auditoria_eventos/);
  assert.equal(query.params[10].diagnostico, 'dato clinico legado');
});
