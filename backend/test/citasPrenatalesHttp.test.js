const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

const SERVICE_PATH = require.resolve('../src/services/citasPrenatalesService');
const CONTROLLER_PATH = require.resolve('../src/controllers/citasPrenatalesController');
const ROUTER_PATH = require.resolve('../src/routes/citas');
const { errorHandler } = require('../src/middleware/errorHandler');

function cacheModule(modulePath, exports) {
  const previous = require.cache[modulePath];
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  return () => {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  };
}

async function withServer(service, callback) {
  const restoreService = cacheModule(SERVICE_PATH, service);
  const previousController = require.cache[CONTROLLER_PATH];
  const previousRouter = require.cache[ROUTER_PATH];
  delete require.cache[CONTROLLER_PATH];
  delete require.cache[ROUTER_PATH];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = {
      id: 83,
      permisos: String(req.headers['x-permissions'] || '').split(',').filter(Boolean),
    };
    next();
  });
  app.use('/api/pacientes/:pacienteId/citas', require(ROUTER_PATH));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete require.cache[CONTROLLER_PATH];
    delete require.cache[ROUTER_PATH];
    if (previousController) require.cache[CONTROLLER_PATH] = previousController;
    if (previousRouter) require.cache[ROUTER_PATH] = previousRouter;
    restoreService();
  }
}

test('HTTP consulta vigente con permiso y coercion de identificadores', async () => {
  let received;
  await withServer({
    obtenerCitaVigente: async (args) => {
      received = args;
      return { id: 701, estado: 'programada' };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pacientes/41/citas/vigente?embarazo_id=91`, {
      headers: { 'x-permissions': 'pacientes.ver' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { cita: { id: 701, estado: 'programada' } });
  });
  assert.deepEqual(received, { pacienteId: 41, embarazoId: 91 });
});

test('HTTP reprograma y cancela con controles.editar y contrato estricto', async () => {
  const calls = [];
  await withServer({
    reprogramarCita: async (args) => {
      calls.push(['reprogramar', args]);
      return { cita_anterior: { id: 701 }, cita_nueva: { id: 702 } };
    },
    cancelarCita: async (args) => {
      calls.push(['cancelar', args]);
      return { cita: { id: 702, estado: 'cancelada' }, idempotente: false };
    },
  }, async (baseUrl) => {
    const headers = { 'content-type': 'application/json', 'x-permissions': 'controles.editar' };
    const reprogram = await fetch(
      `${baseUrl}/api/pacientes/41/citas/701/reprogramar?embarazo_id=91`,
      { method: 'PATCH', headers, body: JSON.stringify({ fecha_programada: '2030-09-17' }) }
    );
    assert.equal(reprogram.status, 200);
    assert.deepEqual(await reprogram.json(), {
      cita_anterior: { id: 701 }, cita_nueva: { id: 702 },
    });

    const cancel = await fetch(
      `${baseUrl}/api/pacientes/41/citas/702/cancelar?embarazo_id=91`,
      { method: 'PATCH', headers, body: '{}' }
    );
    assert.equal(cancel.status, 200);

    const invalid = await fetch(
      `${baseUrl}/api/pacientes/41/citas/701/reprogramar?embarazo_id=91`,
      {
        method: 'PATCH', headers,
        body: JSON.stringify({ fecha_programada: '2030-09-17', motivo: 'no permitido' }),
      }
    );
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'VALIDATION_ERROR');
  });

  assert.equal(calls.length, 2);
  assert.deepEqual({
    pacienteId: calls[0][1].pacienteId,
    embarazoId: calls[0][1].embarazoId,
    citaId: calls[0][1].citaId,
    fechaProgramada: calls[0][1].fechaProgramada,
  }, {
    pacienteId: 41, embarazoId: 91, citaId: 701, fechaProgramada: '2030-09-17',
  });
  assert.deepEqual({
    pacienteId: calls[1][1].pacienteId,
    embarazoId: calls[1][1].embarazoId,
    citaId: calls[1][1].citaId,
  }, { pacienteId: 41, embarazoId: 91, citaId: 702 });
});

test('HTTP asigna cita con controles.editar, fecha estricta y respuesta 201', async () => {
  let received;
  await withServer({
    asignarCita: async (args) => {
      received = args;
      return { cita: { id: 801, estado: 'programada' }, idempotente: false };
    },
  }, async (baseUrl) => {
    const denied = await fetch(
      `${baseUrl}/api/pacientes/41/citas/asignar?embarazo_id=91`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
    );
    assert.equal(denied.status, 403);

    const response = await fetch(
      `${baseUrl}/api/pacientes/41/citas/asignar?embarazo_id=91`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-permissions': 'controles.editar' },
        body: JSON.stringify({ fecha_programada: '2030-09-20' }),
      }
    );
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      cita: { id: 801, estado: 'programada' }, idempotente: false,
    });

    const extra = await fetch(
      `${baseUrl}/api/pacientes/41/citas/asignar?embarazo_id=91`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-permissions': 'controles.editar' },
        body: JSON.stringify({ fecha_programada: '2030-09-20', control_origen_id: 999 }),
      }
    );
    assert.equal(extra.status, 400);
  });

  assert.deepEqual({
    pacienteId: received.pacienteId,
    embarazoId: received.embarazoId,
    fechaProgramada: received.fechaProgramada,
  }, {
    pacienteId: 41,
    embarazoId: 91,
    fechaProgramada: '2030-09-20',
  });
  assert.equal(received.req.usuario.id, 83);
});

test('HTTP rechaza permiso ausente, IDs invalidos y query incompleta antes del servicio', async () => {
  let calls = 0;
  const service = {
    obtenerCitaVigente: async () => { calls += 1; },
    reprogramarCita: async () => { calls += 1; },
    cancelarCita: async () => { calls += 1; },
  };
  await withServer(service, async (baseUrl) => {
    const forbidden = await fetch(`${baseUrl}/api/pacientes/41/citas/vigente?embarazo_id=91`);
    assert.equal(forbidden.status, 403);

    const badPatient = await fetch(`${baseUrl}/api/pacientes/no/citas/vigente?embarazo_id=91`, {
      headers: { 'x-permissions': 'pacientes.ver' },
    });
    assert.equal(badPatient.status, 400);

    const missingPregnancy = await fetch(`${baseUrl}/api/pacientes/41/citas/vigente`, {
      headers: { 'x-permissions': 'pacientes.ver' },
    });
    assert.equal(missingPregnancy.status, 400);

    const badAppointment = await fetch(
      `${baseUrl}/api/pacientes/41/citas/no/cancelar?embarazo_id=91`,
      { method: 'PATCH', headers: { 'x-permissions': 'controles.editar' } }
    );
    assert.equal(badAppointment.status, 400);
  });
  assert.equal(calls, 0);
});
