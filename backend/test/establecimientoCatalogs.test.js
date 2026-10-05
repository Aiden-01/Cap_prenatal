const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { ESTABLECIMIENTO_CATALOGS } = require('../src/domain/establecimientoCatalogs');
const { pacienteCreateSchema, pacienteUpdateSchema } = require('../src/validations/pacientes.schemas');
const { validateBody } = require('../src/middleware/validate');
const { errorHandler } = require('../src/middleware/errorHandler');

const BASE = { no_expediente: 'SYN-CAT-001', nombres: 'Sintetica', apellidos: 'Catalogo' };
const CANONICAL = { nombre_establecimiento: 'CAP El Chal', distrito: 'El Chal', area_salud: 'Petén Sur Oriente' };

async function withEndpoint(before, callback) {
  let stored = { version: 1, id: 41, ...BASE, ...before };
  const writes = [];
  const repository = {
    enTransaccion: async (fn) => fn({ synthetic: true }),
    existeCui: async () => false,
    insertarPaciente: async (data) => { writes.push(data); return { id: 41, ...data }; },
    obtenerEmbarazoEnSeguimiento: async () => null,
    crearEmbarazoInicial: async () => null,
    obtenerPacienteParaActualizar: async () => ({ ...stored }),
    actualizarPaciente: async (_id, data) => {
      writes.push(data); stored = { ...stored, ...data, version: stored.version + 1 };
      return { paciente: stored, rowCount: 1 };
    },
  };
  const overrides = [
    ['../src/repositories/pacientesRepository', repository],
    ['../src/repositories/comunidadesRepository', {}],
    ['../src/services/auditService', { registrarEventoPrivado: async () => {} }],
  ];
  const paths = [...overrides.map(([name]) => require.resolve(name)),
    require.resolve('../src/services/pacientesService'), require.resolve('../src/controllers/pacientesController')];
  const previous = paths.map((p) => require.cache[p]);
  overrides.forEach(([, exports], index) => { require.cache[paths[index]] = { id: paths[index], filename: paths[index], loaded: true, exports }; });
  delete require.cache[paths[3]];
  delete require.cache[paths[4]];
  const controller = require('../src/controllers/pacientesController');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.usuario = { id: 73, permisos: [] }; next(); });
  app.post('/api/pacientes', validateBody(pacienteCreateSchema), controller.crear);
  app.put('/api/pacientes/:id', validateBody(pacienteUpdateSchema), controller.actualizar);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (method, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/pacientes${method === 'PUT' ? '/41' : ''}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(method === 'PUT' ? { version: stored.version, ...body } : body),
    });
    return { status: response.status, body: await response.json() };
  };
  try { await callback({ request, writes }); } finally {
    await new Promise((resolve) => server.close(resolve));
    paths.forEach((p, index) => { if (previous[index]) require.cache[p] = previous[index]; else delete require.cache[p]; });
  }
}

for (const [field, values] of Object.entries(ESTABLECIMIENTO_CATALOGS)) {
  for (const value of values) {
    test(`POST paciente acepta y almacena ${field}: ${value}`, async () => {
      await withEndpoint({}, async ({ request, writes }) => {
        assert.equal((await request('POST', { ...BASE, ...CANONICAL, [field]: value })).status, 201);
        assert.equal(writes[0][field], value);
      });
    });
  }
  for (const value of ['asdf', '', null, values[0].toLowerCase(), values[0].toUpperCase(), ` ${values[0]} `]) {
    test(`POST bypass rechaza ${field} no canónico ${JSON.stringify(value)}`, async () => {
      await withEndpoint({}, async ({ request, writes }) => {
        const result = await request('POST', { ...BASE, ...CANONICAL, [field]: value });
        assert.equal(result.status, 400);
        assert.equal(result.body.code, 'VALIDATION_ERROR');
        assert.equal(result.body.details[0].campo, field);
        assert.equal(writes.length, 0);
      });
    });
  }
}

test('PUT permite sustituciones canónicas y rechaza nuevo texto libre o vaciado', async () => {
  await withEndpoint(CANONICAL, async ({ request, writes }) => {
    assert.equal((await request('PUT', { nombre_establecimiento: 'P/S Colpetén' })).status, 200);
    assert.deepEqual(writes[0], { nombre_establecimiento: 'P/S Colpetén' });
    for (const field of Object.keys(CANONICAL)) {
      for (const value of ['asdf', '', null, CANONICAL[field].toLowerCase()]) {
        assert.equal((await request('PUT', { [field]: value })).status, 400);
      }
    }
    assert.equal(writes.length, 1);
  });
});

for (const distrito of ['Santa Ana', 'Dolores', 'Poptún', 'San Luis', 'Chacté', 'EL CHAL', 'el chal', 'asdf']) {
  for (const method of ['POST', 'PUT']) {
    test(`${method} rechaza distrito nuevo ${distrito} sin escribir ni autocorregir`, async () => {
      await withEndpoint(CANONICAL, async ({ request, writes }) => {
        const body = method === 'POST' ? { ...BASE, ...CANONICAL, distrito } : { distrito };
        const result = await request(method, body);
        assert.equal(result.status, 400);
        assert.equal(result.body.code, 'VALIDATION_ERROR');
        assert.equal(result.body.details[0].campo, 'distrito');
        assert.equal(writes.length, 0);
      });
    });
  }
}

for (const distrito of ['Santa Ana', 'Dolores', 'Poptún', 'San Luis', 'Chacté']) {
  test(`PUT conserva distrito histórico ${distrito} y permite sustitución explícita por El Chal`, async () => {
    await withEndpoint({ ...CANONICAL, distrito }, async ({ request, writes }) => {
      assert.equal((await request('PUT', { telefono: '00000000' })).status, 200);
      assert.deepEqual(writes[0], { telefono: '00000000' });
      assert.equal((await request('PUT', { distrito })).status, 200);
      assert.equal(writes.length, 1);
      assert.equal((await request('PUT', { distrito: 'El Chal' })).status, 200);
      assert.deepEqual(writes[1], { distrito: 'El Chal' });
    });
  });
}

test('PUT conserva legacy idéntico sin escribirlo y admite migración intencional al catálogo', async () => {
  const legacy = { nombre_establecimiento: 'Unidad histórica ', distrito: 'Distrito Sur Oriente', area_salud: 'Peten, Area Sur Oriente' };
  await withEndpoint(legacy, async ({ request, writes }) => {
    assert.equal((await request('PUT', { ...legacy, telefono: '00000000' })).status, 200);
    assert.deepEqual(writes[0], { telefono: '00000000' });
    assert.equal((await request('PUT', legacy)).status, 200);
    assert.equal(writes.length, 1);
    assert.equal((await request('PUT', { distrito: 'Otro legacy' })).status, 400);
    assert.equal((await request('PUT', CANONICAL)).status, 200);
    assert.deepEqual(writes[1], CANONICAL);
  });
});

test('PUT sin campos administrativos o con null/blank histórico no los rellena ni borra', async () => {
  await withEndpoint({ nombre_establecimiento: null, distrito: '', area_salud: null }, async ({ request, writes }) => {
    assert.equal((await request('PUT', { telefono: '00000000' })).status, 200);
    assert.equal((await request('PUT', { nombre_establecimiento: null, distrito: '', area_salud: null })).status, 200);
    assert.deepEqual(writes, [{ telefono: '00000000' }]);
  });
});

test('POST conserva omisión opcional del contrato anterior', async () => {
  await withEndpoint({}, async ({ request }) => assert.equal((await request('POST', BASE)).status, 201));
});
