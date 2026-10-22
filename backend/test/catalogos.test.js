const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { catalogoSchema, catalogoIdSchema, catalogoListSchema } = require('../src/validations/catalogos.schemas');
const { createCatalogosRouter } = require('../src/routes/catalogos');
const { createCatalogosService } = require('../src/services/catalogosService');
const { createCatalogosRepository } = require('../src/repositories/catalogosRepository');
const { errorHandler } = require('../src/middleware/errorHandler');
const { csrfMiddleware, CSRF_COOKIE_NAME } = require('../src/middleware/auth');

test('Zod: requeridos, límites, normalización, opcionales y campos fuera de alcance', () => {
  for (const body of [{}, { nombre: ' ' }, { nombre: 1 }, { nombre: 'x'.repeat(151) },
    { nombre: '\u0000' }, { nombre: '\u0301' }, { nombre: 'Cargo', activo: true },
    { nombre: 'Cargo', cargo_id: 2 }, { nombre: 'Cargo', codigo: 'x'.repeat(41) },
    { nombre: 'Cargo', descripcion: 'x'.repeat(501) }]) {
    assert.equal(catalogoSchema.safeParse(body).success, false, JSON.stringify(body));
  }
  assert.deepEqual(catalogoSchema.parse({ nombre: '  Me\u0301dico/a  Rural ', codigo: ' ', descripcion: '' }),
    { nombre: 'Médico/a Rural', codigo: null, descripcion: null });
  for (const id of ['0', '-1', '1.1', '2147483648', '1 OR 1=1']) assert.equal(catalogoIdSchema.safeParse({ id }).success, false);
  for (const query of [{ estado: 'otro' }, { limite: '101' }, { pagina: '' }, { extra: 'x' }]) assert.equal(catalogoListSchema.safeParse(query).success, false);
});

test('servicio: ausencia, duplicados concurrentes y auditoría obligatoria', async () => {
  for (const tipo of ['cargos', 'especialidades']) {
    const calls = [];
    const db = {};
    let stored = null;
    const repository = {
      enTransaccion: fn => fn(db),
      obtener: async () => stored,
      crear: async body => { stored = { id: 7, activo: true, ...body }; return stored; },
      actualizar: async (_id, body) => { stored = { ...stored, ...body }; return stored; },
      estado: async (_id, activo) => { stored = { ...stored, activo }; return stored; },
    };
    const service = createCatalogosService(tipo, { repository, audit: async (...args) => calls.push(args) });
    await assert.rejects(service.obtener(7), { statusCode: 404 });
    const body = { nombre: 'Texto privado', codigo: 'privado', descripcion: 'No auditar narrativa' };
    await service.crear(body, { usuario: { id: 3 } });
    await service.actualizar(7, { ...body, nombre: 'Otro texto' }, {});
    await service.estado(7, false, {});
    await service.estado(7, false, {});
    assert.equal(calls.length, 3, 'no auditar escrituras sin cambios');
    assert.equal(JSON.stringify(calls).includes('Texto privado'), false);
    assert.equal(JSON.stringify(calls).includes('No auditar narrativa'), false);
    assert.deepEqual(calls[0][2], { db, obligatorio: true });
    repository.crear = async () => { throw Object.assign(new Error('SQL privado'), { code: '23505', constraint: `ux_${tipo}_personal_nombre` }); };
    await assert.rejects(service.crear(body, {}), { statusCode: 409, code: 'CATALOGO_DUPLICADO' });
    const failing = createCatalogosService(tipo, { repository, audit: async () => { throw new Error('audit failed'); } });
    await assert.rejects(failing.estado(7, true, {}), /audit failed/);
  }
});

test('repositorio: rollback y liberación ante fallo de escritura o auditoría', async () => {
  const calls = [];
  const repository = createCatalogosRepository('cargos', { connect: async () => ({
    query: async sql => calls.push(sql), release: () => calls.push('release'),
  }) });
  await assert.rejects(repository.enTransaccion(async () => { throw new Error('failure'); }), /failure/);
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'release']);
  assert.throws(() => createCatalogosRepository('usuarios; DROP TABLE roles'), /no soportado/);
});

test('HTTP: autenticación real sin token; roles, CSRF, validación y rutas de ambos catálogos', async (t) => {
  let writes = 0;
  const service = {
    listar: async query => ({ data: [{ id: 1, estado: query.estado }], total: 1 }),
    obtener: async id => ({ id }),
    crear: async body => { writes++; return { id: 1, ...body }; },
    actualizar: async (id, body) => ({ id, ...body }),
    estado: async (id, activo) => ({ id, activo }),
  };
  const services = { cargos: service, especialidades: service };
  const app = express();
  app.use(express.json());
  app.use('/real', createCatalogosRouter({ services }));
  app.use('/api', csrfMiddleware);
  app.use('/api/catalogos', createCatalogosRouter({ services, authenticate: (req, _res, next) => {
    req.usuario = { id: 3, rol: req.headers['x-test-rol'] }; next();
  } }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const send = async (path, method = 'GET', body, rol = 'director', csrf = true) => {
    const headers = { 'content-type': 'application/json', 'x-test-rol': rol };
    if (csrf) { headers.cookie = `${CSRF_COOKIE_NAME}=test`; headers['x-csrf-token'] = 'test'; }
    return fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  for (const tipo of ['cargos', 'especialidades']) {
    const base = `/api/catalogos/${tipo}`;
    assert.equal((await send(`/real/${tipo}`)).status, 401);
    for (const [suffix, method, body] of [['', 'POST', { nombre: 'Cargo' }], ['/1', 'PUT', { nombre: 'Cargo' }], ['/1/desactivar', 'PATCH'], ['/1/reactivar', 'PATCH']]) {
      assert.equal((await send(`/real/${tipo}${suffix}`, method, body)).status, 401);
      assert.equal((await send(base + suffix, method, body, 'personal_salud')).status, 403);
      assert.equal((await send(base + suffix, method, body, 'director', false)).status, 403);
    }
    for (const rol of ['admin', 'director', 'personal_salud']) {
      for (const estado of ['activos', 'inactivos', 'todos']) assert.equal((await send(`${base}?estado=${estado}`, 'GET', undefined, rol)).status, 200);
      assert.equal((await send(base + '/1', 'GET', undefined, rol)).status, 200);
    }
    assert.equal((await send(base, 'POST', {})).status, 400);
    assert.equal((await send(base + '/-1')).status, 400);
    assert.equal((await send(base + '?limite=0')).status, 400);
    for (const rol of ['admin', 'director']) {
      assert.equal((await send(base, 'POST', { nombre: 'Cargo' }, rol)).status, 201);
      assert.equal((await send(base + '/1', 'PUT', { nombre: 'Editado' }, rol)).status, 200);
      for (const action of ['desactivar', 'reactivar']) assert.equal((await send(base + '/1/' + action, 'PATCH', undefined, rol)).status, 200);
    }
    assert.equal((await send(base + '/1', 'DELETE')).status, 404);
  }
  assert.equal(writes, 4);
});
