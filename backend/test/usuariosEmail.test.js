const test = require('node:test');
const assert = require('node:assert/strict');
const { usuarioCreateSchema, usuarioUpdateSchema } = require('../src/validations/usuarios.schemas');
const service = require('../src/services/usuariosService');
const profesionales = require('../src/repositories/profesionalesRepository');
const usuarios = require('../src/repositories/usuariosRepository');
const { normalizeError } = require('../src/middleware/errorHandler');
const { buildAuditPayload } = require('../src/services/audit/auditDiffBuilder');
const { validateFinalPayload } = require('../src/services/audit/auditHistorySanitizer');

const nuevo = { nombre_completo: 'Cuenta sintética', username: 'correo.fixture',
  email: '  CUENTA.SINTETICA@EXAMPLE.TEST  ', password: 'test-only-password', rol: 'personal_salud' };

test('correo de alta obligatorio, normalizado y acotado; edición omitida conserva legado', () => {
  assert.equal(usuarioCreateSchema.parse(nuevo).email, 'cuenta.sintetica@example.test');
  const { email, ...sinCorreo } = nuevo;
  assert.equal(usuarioCreateSchema.safeParse(sinCorreo).success, false);
  for (const email of ['', '  ', null, false, 'sin-arroba', 'a@', '@example.test',
    'a b@example.test', 'a@example.test\nusuario', `${'a'.repeat(245)}@example.test`]) {
    assert.equal(usuarioCreateSchema.safeParse({ ...nuevo, email }).success, false, String(email));
    assert.equal(usuarioUpdateSchema.safeParse({ email }).success, false, String(email));
  }
  assert.deepEqual(usuarioUpdateSchema.parse({ nombre_completo: 'Cuenta legada' }), { nombre_completo: 'Cuenta legada' });
  assert.deepEqual(usuarioUpdateSchema.parse({ email: ' NUEVA@EXAMPLE.TEST ' }), { email: 'nueva@example.test' });
  assert.equal(email.trim().toLowerCase(), 'cuenta.sintetica@example.test');
});

test('crear valida también en servicio, conserva rol/permisos y nunca audita la dirección', async () => {
  let stored; const events = []; const permisos = [];
  const dependencies = {
    usuariosRepository: { crear: async args => { stored = args; return { id: 44, email: args.email }; } },
    permisosRepository: { asignarPermisosIniciales: async args => permisos.push(args) },
    registrarEventoPrivado: async (_req, event) => events.push(event),
  };
  const req = { usuario: { id: 2, rol: 'admin' } };
  await service.crearUsuario({ body: nuevo, req, dependencies });
  assert.equal(stored.email, 'cuenta.sintetica@example.test');
  assert.equal(stored.rol, 'personal_salud');
  assert.deepEqual(permisos, [{ usuarioId: 44, rol: 'personal_salud', otorgadoPor: 2 }]);
  assert.equal(JSON.stringify(events).includes(stored.email), false);
  await assert.rejects(service.crearUsuario({ body: { ...nuevo, email: '' }, req, dependencies }), { name: 'ZodError' });
  await assert.rejects(service.crearUsuario({ body: { ...nuevo, rol: 'director' }, req, dependencies }), { code: 'ROL_NO_AUTORIZADO' });
});

test('administración completa correo legado sin cambiar contraseña, sesión, cargo ni permisos', async () => {
  const db = {}; const events = []; const writes = [];
  let current = { id: 44, nombre_completo: 'Cuenta legada', email: null,
    rol: 'personal_salud', activo: true, cargo_id: 9 };
  const dependencies = {
    usuariosRepository: {
      obtenerVisibleParaActor: async () => ({ ...current }), obtenerPorId: async () => ({ ...current }),
      actualizar: async (args, connection) => {
        writes.push({ args, connection });
        current = { ...current, nombre_completo: args.nombreCompleto,
          ...(args.email !== undefined ? { email: args.email } : {}) };
        return { ...current };
      },
    },
    permisosRepository: { enTransaccion: fn => fn(db), bloquearUsuarioPermisos: async () => true },
    permisosService: { reemplazarPermisosEnTransaccion: () => assert.fail('No reemplazar permisos por correo') },
    sessionService: { revokeAllInTransaction: () => assert.fail('No revocar sesiones por correo') },
    registrarEventoPrivado: async (_req, event, options) => events.push({ event, options }),
  };
  const req = { usuario: { id: 2, rol: 'director' } };
  await service.actualizarUsuario({ id: 44, body: { nombre_completo: 'Cuenta legada editable' }, req, dependencies });
  assert.equal(writes[0].args.email, undefined);
  assert.equal(current.email, null);
  await service.actualizarUsuario({ id: 44, body: { email: ' LEGADO@EXAMPLE.TEST ' }, req, dependencies });
  assert.equal(current.email, 'legado@example.test');
  assert.equal(current.cargo_id, 9); assert.equal(current.rol, 'personal_salud');
  assert.equal(writes[1].args.passwordHash, null); assert.equal(writes[1].connection, db);
  const audit = events.find(({ event }) => event.contexto.evento === 'email_actualizado');
  assert.deepEqual(audit.options, { db, obligatorio: true });
  assert.equal(JSON.stringify(audit).includes(current.email), false);
  assert.deepEqual(buildAuditPayload({ metadata: audit.event.metadata }, { context: audit.event.contexto }),
    { politica_version: 1, contacto_modificado: true, contacto_pendiente: false });
  assert.equal(validateFinalPayload({ politica_version: 1, contacto_modificado: true, contacto_pendiente: false }, audit.event.contexto), true);
});

test('unicidad PostgreSQL de correo produce conflicto comprensible sin revelar direcciones', () => {
  const result = normalizeError({ code: '23505', constraint: 'ux_usuarios_email',
    detail: 'Key (email)=(privada@example.test) already exists.' });
  assert.equal(result.statusCode, 409); assert.equal(result.code, 'EMAIL_DUPLICADO');
  assert.match(result.message, /correo electrónico ya está registrado/);
  assert.equal(JSON.stringify(result).includes('privada@example.test'), false);
});

test('directorio usa lista explícita sin contacto; repositorio administrativo permite completar legado', async () => {
  let sql; let values;
  const db = { query: async (query, params) => {
    sql = query; values = params; return { rows: [{ data: [], total: 0 }] };
  } };
  const result = await profesionales.listar({ buscar: 'médico', pagina: 1, limite: 20,
    cargo_codigo: 'MED', actorRol: 'admin' }, db);
  assert.equal(result.total, 0); assert.deepEqual(result.data, []);
  assert.doesNotMatch(sql, /email|username|password|telefono|direccion/i);
  assert.match(sql, /u\.activo = TRUE AND c\.activo = TRUE/);
  assert.match(sql, /upper\(btrim\(c\.codigo\)\) IN \('MED', 'AE', 'EP'\)/);
  await usuarios.actualizar({ id: 44, nombreCompleto: 'Legado', activo: true,
    rol: 'personal_salud', passwordHash: null, email: 'legado@example.test' }, db);
  assert.match(sql, /email=CASE WHEN \$9::boolean THEN \$10::varchar ELSE email END/);
  assert.deepEqual(values.slice(8, 10), [true, 'legado@example.test']);
  await usuarios.actualizar({ id: 44, nombreCompleto: 'Legado', activo: true,
    rol: 'personal_salud', passwordHash: null }, db);
  assert.deepEqual(values.slice(8, 10), [false, null]);
});
