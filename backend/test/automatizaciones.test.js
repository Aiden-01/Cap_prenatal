const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const {
  ConfigError,
  validateAutomationConfig,
} = require('../src/config/env');
const {
  createAutomatizacionesController,
} = require('../src/controllers/automatizacionesController');
const { errorHandler } = require('../src/middleware/errorHandler');
const {
  createAutomatizacionesRepository,
} = require('../src/repositories/automatizacionesRepository');
const {
  createAutomatizacionesRouter,
} = require('../src/routes/automatizaciones');
const {
  createAutomatizacionesService,
} = require('../src/services/automatizacionesService');
const { registrarEventoPrivado } = require('../src/services/auditService');
const {
  isIpAllowed,
  normalizedIp,
  parseAllowedCidrs,
} = require('../src/utils/ipAllowlist');
const { AppError } = require('../src/utils/appError');

const ROOT = path.resolve(__dirname, '../..');
const CURRENT_KEY = 'current_Automation_Key_0123456789abcdefghi';
const NEXT_KEY = 'next_Automation_Key_0123456789abcdefghijk';
const WRONG_KEY = 'wrong_Automation_Key_0123456789abcdefghij';

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function activeConfig(overrides = {}) {
  return {
    active: true,
    allowedCidrs: ['192.0.2.0/24', '2001:db8::/32'],
    currentHash: sha256(CURRENT_KEY),
    enabled: true,
    nextHash: sha256(NEXT_KEY),
    rateLimitMax: 100,
    rateLimitWindowMs: 900000,
    startOffsetDays: 1,
    timezone: 'America/Guatemala',
    windowDays: 1,
    ...overrides,
  };
}

function aggregateRows(overrides = {}) {
  return [{
    fecha_desde: '2026-07-24',
    fecha_hasta: '2026-07-24',
    fecha_proxima_cita: '2026-07-24',
    total: 3,
    ...overrides,
  }];
}

function serviceForRows(rows = aggregateRows()) {
  return createAutomatizacionesService({
    repository: {
      async obtenerResumenProximasCitas() {
        return rows;
      },
    },
    now: () => new Date('2026-07-23T12:00:00.000Z'),
  });
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function automationApp({
  config = activeConfig(),
  service = serviceForRows(),
  audit = async () => true,
  addHumanRoute = false,
} = {}) {
  const app = express();
  const controllers = createAutomatizacionesController({ service, audit });
  const router = createAutomatizacionesRouter({
    config,
    controllers,
    resolveOrigin: (req) => req.headers['x-synthetic-origin'],
  });
  if (addHumanRoute) app.get('/api/login', (_req, res) => res.status(204).end());
  app.use('/api/automatizaciones', router);
  app.use(errorHandler);
  return app;
}

function automationHeaders({
  key = CURRENT_KEY,
  origin = '192.0.2.15',
  extra = {},
} = {}) {
  const headers = {
    'X-Synthetic-Origin': origin,
    ...extra,
  };
  if (key !== null) headers['X-CAP-Automation-Key'] = key;
  return headers;
}

test('configuracion queda deshabilitada por defecto y valida limites no secretos', () => {
  const development = validateAutomationConfig({ NODE_ENV: 'development' });
  assert.equal(development.active, false);
  assert.equal(development.enabled, false);
  assert.equal(development.startOffsetDays, 1);
  assert.equal(development.windowDays, 1);
  assert.equal(development.timezone, 'America/Guatemala');
  assert.equal(development.rateLimitWindowMs, 900000);
  assert.equal(development.rateLimitMax, 6);

  assert.throws(
    () => validateAutomationConfig({
      NODE_ENV: 'development',
      APPOINTMENT_NOTIFICATION_START_OFFSET_DAYS: '31',
    }),
    (error) => error instanceof ConfigError
      && error.variable === 'APPOINTMENT_NOTIFICATION_START_OFFSET_DAYS'
  );
  assert.throws(
    () => validateAutomationConfig({
      NODE_ENV: 'development',
      APPOINTMENT_NOTIFICATION_WINDOW_DAYS: '0',
    }),
    (error) => error instanceof ConfigError
      && error.variable === 'APPOINTMENT_NOTIFICATION_WINDOW_DAYS'
  );
  assert.throws(
    () => validateAutomationConfig({
      NODE_ENV: 'development',
      APPOINTMENT_NOTIFICATION_TIMEZONE: 'UTC',
    }),
    (error) => error instanceof ConfigError
      && error.variable === 'APPOINTMENT_NOTIFICATION_TIMEZONE'
  );
});

test('produccion habilitada exige hash CURRENT y allowlist validos; NEXT es opcional', () => {
  const base = {
    NODE_ENV: 'production',
    N8N_INTEGRATION_ENABLED: 'true',
    N8N_ALLOWED_CIDRS: '192.0.2.0/24,2001:db8::/32',
  };
  assert.throws(
    () => validateAutomationConfig(base),
    (error) => error instanceof ConfigError && error.variable === 'N8N_API_KEY_HASH_CURRENT'
  );
  assert.throws(
    () => validateAutomationConfig({
      ...base,
      N8N_API_KEY_HASH_CURRENT: 'invalido',
    }),
    (error) => error instanceof ConfigError && error.variable === 'N8N_API_KEY_HASH_CURRENT'
  );
  assert.throws(
    () => validateAutomationConfig({
      ...base,
      N8N_API_KEY_HASH_CURRENT: sha256(CURRENT_KEY),
      N8N_API_KEY_HASH_NEXT: 'xyz',
    }),
    (error) => error instanceof ConfigError && error.variable === 'N8N_API_KEY_HASH_NEXT'
  );
  assert.throws(
    () => validateAutomationConfig({
      ...base,
      N8N_API_KEY_HASH_CURRENT: sha256(CURRENT_KEY),
      N8N_ALLOWED_CIDRS: '',
    }),
    (error) => error instanceof ConfigError && error.variable === 'N8N_ALLOWED_CIDRS'
  );
  assert.throws(
    () => validateAutomationConfig({
      ...base,
      N8N_API_KEY_HASH_CURRENT: sha256(CURRENT_KEY),
      N8N_ALLOWED_CIDRS: '192.0.2.0/99',
    }),
    (error) => error instanceof ConfigError && error.variable === 'N8N_ALLOWED_CIDRS'
  );
  const valid = validateAutomationConfig({
    ...base,
    N8N_API_KEY_HASH_CURRENT: sha256(CURRENT_KEY).toUpperCase(),
  });
  assert.equal(valid.active, true);
  assert.equal(valid.currentHash, sha256(CURRENT_KEY));
  assert.equal(valid.nextHash, null);
  assert.deepEqual(valid.allowedCidrs, ['192.0.2.0/24', '2001:db8::/32']);
});

test('allowlist valida IPv4, IPv6 e IPv4 mapeada sin confiar en forwarded headers', () => {
  const cidrs = parseAllowedCidrs([
    '192.0.2.0/24',
    '2001:db8::/32',
    '::ffff:198.51.100.0/120',
  ]);
  assert.equal(isIpAllowed('192.0.2.10', cidrs), true);
  assert.equal(isIpAllowed('2001:db8::7', cidrs), true);
  assert.equal(isIpAllowed('::ffff:192.0.2.11', cidrs), true);
  assert.equal(isIpAllowed('::ffff:198.51.100.22', cidrs), true);
  assert.equal(isIpAllowed('203.0.113.5', cidrs), false);
  assert.equal(normalizedIp('::ffff:192.0.2.11'), '192.0.2.11');
});

test('CURRENT y NEXT autentican; ausente, incorrecta y credenciales humanas fallan igual', async () => {
  await withServer(automationApp(), async (baseUrl) => {
    const endpoint = `${baseUrl}/api/automatizaciones/v1/proximas-citas`;
    for (const key of [CURRENT_KEY, NEXT_KEY]) {
      const response = await fetch(endpoint, { headers: automationHeaders({ key }) });
      assert.equal(response.status, 200);
    }

    const denied = [];
    for (const headers of [
      automationHeaders({ key: null }),
      automationHeaders({ key: WRONG_KEY }),
      automationHeaders({ key: CURRENT_KEY, extra: { Authorization: 'Bearer human-token' } }),
      automationHeaders({ key: CURRENT_KEY, extra: { Cookie: 'cap_prenatal_token=human' } }),
      automationHeaders({ key: CURRENT_KEY, extra: { 'X-CSRF-Token': 'human' } }),
    ]) {
      const response = await fetch(endpoint, { headers });
      denied.push({ status: response.status, body: await response.json() });
    }
    assert.ok(denied.every(({ status }) => status === 401));
    assert.ok(denied.every(({ body }) => body.code === 'AUTOMATION_UNAUTHORIZED'));
    assert.ok(denied.every(({ body }) => !('debug' in body)));

    const queryCredential = await fetch(`${endpoint}?api_key=${encodeURIComponent(CURRENT_KEY)}`, {
      headers: automationHeaders({ key: null }),
    });
    assert.equal(queryCredential.status, 401);
    assert.equal((await queryCredential.json()).code, 'AUTOMATION_UNAUTHORIZED');
  });
});

test('origen no permitido, Origin de navegador y key incorrecta son indistinguibles', async () => {
  await withServer(automationApp(), async (baseUrl) => {
    const endpoint = `${baseUrl}/api/automatizaciones/v1/proximas-citas`;
    const cases = [
      automationHeaders({ key: WRONG_KEY }),
      automationHeaders({ origin: '203.0.113.20' }),
      automationHeaders({ extra: { Origin: 'https://frontend.invalid' } }),
      automationHeaders({
        extra: { 'X-Forwarded-For': '192.0.2.15' },
        origin: '203.0.113.20',
      }),
    ];
    const responses = [];
    for (const headers of cases) {
      const response = await fetch(endpoint, { headers });
      responses.push({ status: response.status, body: await response.json() });
    }
    assert.ok(responses.every(({ status }) => status === 401));
    assert.ok(responses.every(({ body }) => body.code === 'AUTOMATION_UNAUTHORIZED'));
    assert.equal(new Set(responses.map(({ body }) => body.message)).size, 1);
  });
});

test('logs de error omiten query, key, hash y stack de automatizacion', () => {
  const captured = [];
  const originalError = console.error;
  console.error = (...args) => captured.push(args);
  try {
    const response = {
      statusCode: null,
      body: null,
      status(value) {
        this.statusCode = value;
        return this;
      },
      json(value) {
        this.body = value;
        return value;
      },
    };
    errorHandler(
      new AppError(401, 'Credenciales de automatizacion invalidas', {
        code: 'AUTOMATION_UNAUTHORIZED',
      }),
      {
        method: 'GET',
        path: '/api/automatizaciones/v1/proximas-citas',
        originalUrl: `/api/automatizaciones/v1/proximas-citas?api_key=${CURRENT_KEY}`,
      },
      response,
      () => {}
    );
    assert.equal(response.statusCode, 401);
    assert.equal('debug' in response.body, false);
  } finally {
    console.error = originalError;
  }

  const serialized = JSON.stringify(captured);
  assert.doesNotMatch(serialized, new RegExp(CURRENT_KEY));
  assert.doesNotMatch(serialized, new RegExp(sha256(CURRENT_KEY)));
  assert.doesNotMatch(serialized, /api_key|originalUrl|stack|headers|cookie/i);
});

test('rate limit es exclusivo, usa origen validado y no comparte contador con ruta humana', async () => {
  const config = activeConfig({ rateLimitMax: 2 });
  await withServer(automationApp({ config, addHumanRoute: true }), async (baseUrl) => {
    for (let index = 0; index < 10; index += 1) {
      assert.equal((await fetch(`${baseUrl}/api/login`)).status, 204);
    }
    const endpoint = `${baseUrl}/api/automatizaciones/v1/proximas-citas`;
    assert.equal((await fetch(endpoint, { headers: automationHeaders() })).status, 200);
    assert.equal((await fetch(endpoint, { headers: automationHeaders() })).status, 200);
    const limited = await fetch(endpoint, { headers: automationHeaders() });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, 'AUTOMATION_RATE_LIMITED');
    assert.equal(limited.headers.get('ratelimit'), null);
    assert.equal(limited.headers.get('x-ratelimit-limit'), null);
  });
});

test('query valida enteros, rangos, repetidos y desconocidos sin defaults silenciosos', async () => {
  const calls = [];
  const service = {
    async consultarProximasCitas(range) {
      calls.push(range);
      return serviceForRows().consultarProximasCitas(range);
    },
  };
  await withServer(automationApp({ service }), async (baseUrl) => {
    const endpoint = `${baseUrl}/api/automatizaciones/v1/proximas-citas`;
    const defaults = await fetch(endpoint, { headers: automationHeaders() });
    assert.equal(defaults.status, 200);
    assert.deepEqual(calls[0], { offsetDays: 1, windowDays: 1 });

    const explicit = await fetch(`${endpoint}?offset_days=0&window_days=7`, {
      headers: automationHeaders(),
    });
    assert.equal(explicit.status, 200);
    assert.deepEqual(calls[1], { offsetDays: 0, windowDays: 7 });

    for (const query of [
      'offset_days=-1',
      'offset_days=1.5',
      'offset_days=31',
      'window_days=0',
      'window_days=8',
      'window_days=1.0',
      'offset_days=1&offset_days=2',
      'window_days=1&window_days=2',
      'dias=1',
    ]) {
      const response = await fetch(`${endpoint}?${query}`, { headers: automationHeaders() });
      assert.equal(response.status, 400, query);
      assert.equal((await response.json()).code, 'AUTOMATION_INVALID_RANGE', query);
    }
  });
  assert.equal(calls.length, 2);
});

test('repositorio usa consulta parametrizada, ultimo control determinista y solo embarazo activo', async () => {
  let captured;
  const repository = createAutomatizacionesRepository({
    async query(sql, params) {
      captured = { sql, params };
      return { rows: aggregateRows() };
    },
  });
  await repository.obtenerResumenProximasCitas({ offsetDays: 1, windowDays: 1 });

  assert.deepEqual(captured.params, [1, 1]);
  assert.match(captured.sql, /America\/Guatemala/);
  assert.match(captured.sql, /PARTITION BY c\.embarazo_id/);
  assert.match(captured.sql, /ORDER BY c\.fecha DESC, c\.numero_control DESC, c\.id DESC/);
  assert.match(captured.sql, /e\.id = c\.embarazo_id/);
  assert.match(captured.sql, /e\.paciente_id = c\.paciente_id/);
  assert.match(captured.sql, /e\.estado = 'activo'/);
  assert.match(captured.sql, /lc\.rn = 1/);
  assert.match(captured.sql, /lc\.cita_siguiente IS NOT NULL/);
  assert.match(captured.sql, /lc\.cita_siguiente >= b\.fecha_desde/);
  assert.match(captured.sql, /lc\.cita_siguiente < b\.fecha_hasta_exclusiva/);
  assert.match(captured.sql, /COUNT\(\*\)::integer/);
  assert.match(captured.sql, /GROUP BY lc\.cita_siguiente/);
  assert.doesNotMatch(captured.sql, /p\.nombres|p\.apellidos|p\.cui|p\.telefono|p\.no_expediente/);
  assert.doesNotMatch(captured.sql, /\$\{|\+\s*offsetDays|\+\s*windowDays/);
});

test('servicio agrega por fecha, ordena, suma y acepta resultado vacio', async () => {
  const service = serviceForRows([
    {
      fecha_desde: '2026-07-24',
      fecha_hasta: '2026-07-25',
      fecha_proxima_cita: '2026-07-25',
      total: '2',
    },
    {
      fecha_desde: '2026-07-24',
      fecha_hasta: '2026-07-25',
      fecha_proxima_cita: '2026-07-24',
      total: 1,
    },
  ]);
  const result = await service.consultarProximasCitas({ offsetDays: 1, windowDays: 2 });
  assert.deepEqual(result, {
    schema_version: 1,
    generated_at: '2026-07-23T12:00:00.000Z',
    timezone: 'America/Guatemala',
    range: { from: '2026-07-24', to: '2026-07-25' },
    total: 3,
    summary_by_date: [
      { date: '2026-07-24', total: 1 },
      { date: '2026-07-25', total: 2 },
    ],
    secure_path: '/dashboard',
  });

  const empty = await serviceForRows([{
    fecha_desde: '2026-07-24',
    fecha_hasta: '2026-07-24',
    fecha_proxima_cita: null,
    total: 0,
  }]).consultarProximasCitas({ offsetDays: 1, windowDays: 1 });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.summary_by_date, []);
  assert.deepEqual(empty.range, { from: '2026-07-24', to: '2026-07-24' });
});

test('contrato HTTP no contiene identificadores, datos personales, clinicos, HTML o Markdown', async () => {
  await withServer(automationApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/automatizaciones/v1/proximas-citas`, {
      headers: automationHeaders(),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(Object.keys(body), [
      'schema_version',
      'generated_at',
      'timezone',
      'range',
      'total',
      'summary_by_date',
      'secure_path',
    ]);
    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of [
      'paciente_id',
      'embarazo_id',
      'nombre',
      'cui',
      'telefono',
      'expediente',
      'comunidad',
      'territorio',
      'riesgo',
      'diagnostico',
      'observacion',
      'tratamiento',
      'control_id',
      'html',
      'markdown',
      '<table',
    ]) {
      assert.doesNotMatch(serialized, new RegExp(forbidden));
    }
  });
});

test('auditoria privada conserva solo conteo, rango, codigos y politica version 1', async () => {
  let inserted;
  await registrarEventoPrivado({}, {
    contexto: {
      categoria: 'automatizaciones',
      entidad: 'proximas_citas',
      evento: 'consultar',
    },
    accion: 'consultar',
    metadata: {
      tipo_automatizacion: 'proximas_citas',
      resultado: 'exitoso',
      motivo_codigo: 'consulta_completada',
      cantidad_citas: 3,
      fecha_desde: '2026-07-24',
      fecha_hasta: '2026-07-24',
      nombre: 'NO_DEBE_PERSISTIR',
      api_key: CURRENT_KEY,
    },
  }, {
    repository: {
      async insertarEvento(event) {
        inserted = event;
      },
    },
  });

  assert.equal(inserted.usuarioId, null);
  assert.equal(inserted.accion, 'consultar');
  assert.equal(inserted.modulo, 'automatizaciones');
  assert.equal(inserted.entidadAfectada, 'proximas_citas');
  assert.equal(inserted.tabla, 'automatizaciones');
  assert.equal(inserted.ip, null);
  assert.equal(inserted.userAgent, null);
  assert.deepEqual(inserted.datosNuevos, {
    cantidad_citas: 3,
    fecha_desde: '2026-07-24',
    fecha_hasta: '2026-07-24',
    motivo_codigo: 'consulta_completada',
    politica_version: 1,
    resultado: 'exitoso',
    tipo_automatizacion: 'proximas_citas',
  });
  assert.doesNotMatch(JSON.stringify(inserted), /NO_DEBE_PERSISTIR|current_Automation_Key/);
});

test('fallo del repositorio de auditoria usa un log controlado para automatizaciones', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...parts) => warnings.push(parts.join(' '));

  try {
    const saved = await registrarEventoPrivado({}, {
      contexto: {
        categoria: 'automatizaciones',
        entidad: 'proximas_citas',
        evento: 'consultar',
      },
      accion: 'consultar',
      metadata: {
        tipo_automatizacion: 'proximas_citas',
        resultado: 'exitoso',
        motivo_codigo: 'consulta_completada',
        cantidad_citas: 1,
        fecha_desde: '2026-07-24',
        fecha_hasta: '2026-07-24',
      },
    }, {
      repository: {
        async insertarEvento() {
          throw new Error('SQL privado con N8N_API_KEY_HASH_CURRENT');
        },
      },
    });

    assert.equal(saved, false);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /evento informativo no registrado/);
  assert.doesNotMatch(warnings[0], /SQL|N8N_API_KEY_HASH_CURRENT/);
});

test('fallo best effort de auditoria no rompe respuesta valida y usa motivo para vacio', async () => {
  const auditCalls = [];
  const audit = async (_req, event) => {
    auditCalls.push(event);
    throw new Error('audit unavailable');
  };
  const emptyService = serviceForRows([{
    fecha_desde: '2026-07-24',
    fecha_hasta: '2026-07-24',
    fecha_proxima_cita: null,
    total: 0,
  }]);
  await withServer(automationApp({ service: emptyService, audit }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/automatizaciones/v1/proximas-citas`, {
      headers: automationHeaders(),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).total, 0);
  });
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].metadata.motivo_codigo, 'consulta_sin_resultados');
  assert.equal(auditCalls[0].metadata.cantidad_citas, 0);
  assert.doesNotMatch(JSON.stringify(auditCalls), /header|cookie|automation-key/i);
});

test('error interno es uniforme, no incluye stack y solo audita motivo controlado', async () => {
  const auditCalls = [];
  const service = {
    async consultarProximasCitas() {
      throw new Error('SQL privado que no debe exponerse');
    },
  };
  await withServer(automationApp({
    service,
    audit: async (_req, event) => auditCalls.push(event),
  }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/automatizaciones/v1/proximas-citas`, {
      headers: automationHeaders(),
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.code, 'AUTOMATION_INTERNAL_ERROR');
    assert.equal('debug' in body, false);
    assert.doesNotMatch(JSON.stringify(body), /SQL privado|stack/i);
  });
  assert.equal(auditCalls.length, 1);
  assert.deepEqual(auditCalls[0].metadata, {
    tipo_automatizacion: 'proximas_citas',
    resultado: 'fallido',
    motivo_codigo: 'consulta_interna_fallida',
  });
});

test('integracion inactiva y endpoint legacy responden 404 sin consultar', async () => {
  let calls = 0;
  const service = {
    async consultarProximasCitas() {
      calls += 1;
      return serviceForRows().consultarProximasCitas({ offsetDays: 1, windowDays: 1 });
    },
  };
  for (const config of [
    activeConfig({ active: false, enabled: false }),
    activeConfig({ active: false, enabled: true }),
  ]) {
    await withServer(automationApp({ config, service }), async (baseUrl) => {
      for (const pathName of ['/v1/proximas-citas', '/proximas-citas?dias=1']) {
        const response = await fetch(`${baseUrl}/api/automatizaciones${pathName}`, {
          headers: automationHeaders(),
        });
        assert.equal(response.status, 404);
        assert.equal((await response.json()).code, 'ROUTE_NOT_FOUND');
      }
    });
  }
  await withServer(automationApp({ config: activeConfig(), service }), async (baseUrl) => {
    const legacy = await fetch(`${baseUrl}/api/automatizaciones/proximas-citas?dias=1`, {
      headers: automationHeaders(),
    });
    assert.equal(legacy.status, 404);
    assert.equal((await legacy.json()).code, 'ROUTE_NOT_FOUND');
  });
  assert.equal(calls, 0);
});

test('no quedan productores o rutas del payload nominal legacy', () => {
  const productionFiles = [
    'backend/src/routes/automatizaciones.js',
    'backend/src/services/reportesService.js',
    'backend/src/repositories/reportesRepository.js',
  ].map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');

  assert.doesNotMatch(productionFiles, /proximasCitasAutomatizacion|obtenerProximasCitasPorDias/);
  assert.doesNotMatch(productionFiles, /tabla_markdown|tabla_html|mensaje_sugerido/);
  assert.doesNotMatch(productionFiles, /x-cap-prenatal-secret|AUTOMATION_SECRET_MISSING/);
  assert.match(productionFiles, /router\.get\('\/proximas-citas', automationNotFound\)/);
});
