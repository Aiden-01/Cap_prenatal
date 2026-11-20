const test = require('node:test');
const assert = require('node:assert/strict');
const { usuarioCreateSchema, usuarioUpdateSchema } = require('../src/validations/usuarios.schemas');
const service = require('../src/services/usuariosService');
const profesionales = require('../src/repositories/profesionalesRepository');
const usuarios = require('../src/repositories/usuariosRepository');
const { normalizeError } = require('../src/middleware/errorHandler');

const nuevo = { nombre_completo: 'Cuenta sintética', username: 'correo.fixture',
  email: '  CUENTA.SINTETICA@EXAMPLE.TEST  ', password: 'Test-only-password9!', rol: 'personal_salud' };

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
  assert.equal(usuarioUpdateSchema.safeParse({ email: ' NUEVA@EXAMPLE.TEST ' }).success, false);
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

test('el servicio rechaza entradas de credenciales antes de consultar o escribir un perfil', async () => {
  const dependencies = { usuariosRepository: { obtenerVisibleParaActor: () => assert.fail('No debe consultar el perfil') } };
  for (const rol of ['admin', 'director']) {
    const req = { usuario: { id: 2, rol } };
    for (const body of [{ email: 'otra@example.test' }, { password: nuevo.password }, { passwordHash: 'secreto' },
      { requiere_cambio_password: true }, { cargo_id: 9, email_verificado_at: '2026-11-20' }]) {
      await assert.rejects(service.actualizarUsuario({ id: 44, body, req, dependencies }), { name: 'ZodError' });
    }
  }
});

test('unicidad PostgreSQL de correo produce conflicto comprensible sin revelar direcciones', () => {
  const result = normalizeError({ code: '23505', constraint: 'ux_usuarios_email',
    detail: 'Key (email)=(privada@example.test) already exists.' });
  assert.equal(result.statusCode, 409); assert.equal(result.code, 'EMAIL_DUPLICADO');
  assert.match(result.message, /correo electrónico ya está registrado/);
  assert.equal(JSON.stringify(result).includes('privada@example.test'), false);
});

test('directorio y actualización administrativa mantienen la separación de credenciales', async () => {
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
  await usuarios.actualizar({ id: 44, nombreCompleto: 'Legado', activo: true, rol: 'personal_salud' }, db);
  assert.doesNotMatch(sql.split('WHERE id=$5')[0], /email|password/i);
  assert.equal(values[4], 44);
});
