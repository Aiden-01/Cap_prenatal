const assert = require('node:assert/strict');
const express = require('express');
const test = require('node:test');

const POOL_PATH = require.resolve('../src/db/pool');
const REPOSITORY_PATH = require.resolve('../src/repositories/citasPrenatalesRepository');
const SERVICE_PATH = require.resolve('../src/services/citasPrenatalesService');

function cacheModule(modulePath, exports) {
  const previous = require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
  return () => {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  };
}

async function withRepository(pool, callback) {
  const restorePool = cacheModule(POOL_PATH, pool);
  const previousRepository = require.cache[REPOSITORY_PATH];
  delete require.cache[REPOSITORY_PATH];
  try {
    return await callback(require(REPOSITORY_PATH));
  } finally {
    delete require.cache[REPOSITORY_PATH];
    if (previousRepository) require.cache[REPOSITORY_PATH] = previousRepository;
    restorePool();
  }
}

async function withService(repository, callback) {
  const restoreRepository = cacheModule(REPOSITORY_PATH, repository);
  const previousService = require.cache[SERVICE_PATH];
  delete require.cache[SERVICE_PATH];
  try {
    return await callback(require(SERVICE_PATH));
  } finally {
    delete require.cache[SERVICE_PATH];
    if (previousService) require.cache[SERVICE_PATH] = previousService;
    restoreRepository();
  }
}

async function withServer(controller, callback) {
  const { createCitasCalendarioRouter } = require('../src/routes/citasCalendario');
  let requiredPermission = null;
  const app = express();
  app.use('/api/citas', createCitasCalendarioRouter({
    controller,
    authenticate: (req, _res, next) => {
      req.usuario = { id: 83 };
      next();
    },
    loadPermissions: (req, _res, next) => {
      req.usuario.permisos = String(req.headers['x-permissions'] || '')
        .split(',')
        .filter(Boolean);
      next();
    },
    checkPermission: (permission) => {
      requiredPermission = permission;
      return (req, res, next) => req.usuario.permisos.includes(permission)
        ? next()
        : res.status(403).json({ code: 'PERMISSION_DENIED' });
    },
  }));
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || error.status || 500).json({
      code: error.code,
      message: error.message,
      details: error.details,
    });
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    await callback(`http://127.0.0.1:${server.address().port}`, () => requiredPermission);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('repositorio consulta un rango mensual una sola vez con parametros date-only', async () => {
  let captured;
  await withRepository({
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [] };
    },
  }, async (repository) => {
    assert.deepEqual(await repository.listarCalendarioPorRango({
      desde: '2026-08-01',
      hasta: '2026-08-31',
    }), []);
  });

  assert.deepEqual(captured.params, ['2026-08-01', '2026-08-31']);
  assert.match(captured.sql, /cp\.fecha_programada BETWEEN \$1::date AND \$2::date/);
  assert.doesNotMatch(captured.sql, /CURRENT_DATE|CURRENT_TIMESTAMP/);
});

test('repositorio acepta el rango visual con meses adyacentes sin N+1', async () => {
  let calls = 0;
  let params;
  await withRepository({
    async query(_sql, values) {
      calls += 1;
      params = values;
      return { rows: [] };
    },
  }, async (repository) => {
    await repository.listarCalendarioPorRango({
      desde: '2026-07-26',
      hasta: '2026-09-05',
    });
  });
  assert.equal(calls, 1);
  assert.deepEqual(params, ['2026-07-26', '2026-09-05']);
});

test('contrato conserva varias citas del mismo dia y los cuatro estados', async () => {
  const rows = [
    { id: '1', date: '2026-08-25', status: 'programada' },
    { id: '2', date: '2026-08-25', status: 'atendida' },
    { id: '3', date: '2026-08-25', status: 'cancelada' },
    { id: '4', date: '2026-08-25', status: 'reprogramada', rescheduled_to: '2026-09-02' },
  ];
  await withService({
    listarCalendarioPorRango: async () => rows,
  }, async (service) => {
    assert.deepEqual(await service.listarCalendario({
      from: '2026-08-01',
      to: '2026-08-31',
    }), {
      range: { from: '2026-08-01', to: '2026-08-31' },
      items: rows,
    });
  });
});

test('SQL ordena por fecha y paciente y aisla paciente mediante embarazo', async () => {
  let sql;
  await withRepository({
    async query(value) {
      sql = value;
      return { rows: [] };
    },
  }, (repository) => repository.listarCalendarioPorRango({
    desde: '2026-08-01', hasta: '2026-08-31',
  }));

  assert.match(sql, /JOIN embarazos e[\s\S]*e\.id = cp\.embarazo_id/);
  assert.match(sql, /JOIN pacientes p[\s\S]*p\.id = e\.paciente_id/);
  assert.match(sql, /cp\.embarazo_id AS pregnancy_id/);
  assert.match(sql, /p\.id AS patient_id/);
  assert.match(sql, /ORDER BY[\s\S]*cp\.fecha_programada ASC[\s\S]*LOWER\(p\.apellidos\) ASC/);
});

test('contrato minimiza datos y no depende de controles.cita_siguiente', async () => {
  let sql;
  await withRepository({
    async query(value) {
      sql = value;
      return { rows: [] };
    },
  }, (repository) => repository.listarCalendarioPorRango({
    desde: '2026-08-01', hasta: '2026-08-31',
  }));

  assert.match(sql, /FROM citas_prenatales cp/);
  assert.match(sql, /TO_CHAR\(cp\.fecha_programada, 'YYYY-MM-DD'\) AS date/);
  assert.match(sql, /hija\.reprogramada_desde_id = cp\.id/);
  assert.doesNotMatch(sql, /cita_siguiente|no_expediente|cui|telefono|direccion/);
});

test('endpoint exige pacientes.ver y devuelve el rango validado', async () => {
  let received;
  await withServer({
    calendario(req, res) {
      received = req.query;
      res.json({ range: req.query, items: [] });
    },
  }, async (baseUrl, permission) => {
    const denied = await fetch(`${baseUrl}/api/citas/calendario?from=2026-08-01&to=2026-08-31`);
    assert.equal(denied.status, 403);

    const response = await fetch(
      `${baseUrl}/api/citas/calendario?from=2026-08-01&to=2026-08-31`,
      { headers: { 'x-permissions': 'pacientes.ver' } }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      range: { from: '2026-08-01', to: '2026-08-31' },
      items: [],
    });
    assert.equal(permission(), 'pacientes.ver');
  });
  assert.deepEqual(received, { from: '2026-08-01', to: '2026-08-31' });
});

test('endpoint rechaza rango invertido, demasiado amplio y fechas no ISO', async () => {
  let calls = 0;
  await withServer({
    calendario(_req, res) {
      calls += 1;
      res.json({ items: [] });
    },
  }, async (baseUrl) => {
    const headers = { 'x-permissions': 'pacientes.ver' };
    for (const query of [
      'from=2026-08-31&to=2026-08-01',
      'from=2026-01-01&to=2026-08-31',
      'from=01-08-2026&to=2026-08-31',
      'from=2026-02-30&to=2026-03-10',
    ]) {
      const response = await fetch(`${baseUrl}/api/citas/calendario?${query}`, { headers });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'VALIDATION_ERROR');
    }
  });
  assert.equal(calls, 0);
});

test('endpoint estricto rechaza filtros de paciente que podrian alterar el aislamiento', async () => {
  let calls = 0;
  await withServer({
    calendario(_req, res) {
      calls += 1;
      res.json({ items: [] });
    },
  }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/citas/calendario?from=2026-08-01&to=2026-08-31&patient_id=41`,
      { headers: { 'x-permissions': 'pacientes.ver' } }
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'VALIDATION_ERROR');
  });
  assert.equal(calls, 0);
});
