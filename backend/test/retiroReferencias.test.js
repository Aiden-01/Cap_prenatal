const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const {
  REQUIRED_MIGRATION,
  assertSchemaCompatible,
} = require('../src/db/schemaCompatibility');
const {
  checksum,
  discoverMigrationFiles,
} = require('../src/db/migrate');
const {
  USUARIO_TIENE_HISTORIAL_SQL,
} = require('../src/repositories/usuariosRepository');
const { errorHandler } = require('../src/middleware/errorHandler');
const { AppError } = require('../src/utils/appError');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(BACKEND_ROOT, 'src');
const MIGRATION_PATH = path.join(
  SOURCE_ROOT,
  'db',
  'migrations',
  '008_retirar_referencias_efectuadas.sql'
);

const REMOVED_FILES = [
  'routes/referencias.js',
  'controllers/referenciasController.js',
  'services/referenciasService.js',
  'repositories/referenciasRepository.js',
  'validations/referencias.schemas.js',
];

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

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('los cinco archivos exclusivos del CRUD fueron retirados', () => {
  for (const relativePath of REMOVED_FILES) {
    assert.equal(
      fs.existsSync(path.join(SOURCE_ROOT, relativePath)),
      false,
      relativePath
    );
  }
});

test('todos los metodos de /referencias llegan al 404 global sin SQL ni redireccion', async () => {
  const pass = (_req, _res, next) => next();
  const controllerPath = require.resolve('../src/controllers/pacientesController');
  const authPath = require.resolve('../src/middleware/auth');
  const permissionsPath = require.resolve('../src/middleware/permisos');
  const patientsRoutePath = require.resolve('../src/routes/pacientes');
  const nestedRoutePaths = [
    '../src/routes/controles',
    '../src/routes/riesgo',
    '../src/routes/morbilidad',
    '../src/routes/vacunas',
    '../src/routes/pdf',
  ].map((modulePath) => require.resolve(modulePath));
  let sqlCalls = 0;

  const handlers = Object.fromEntries([
    'listar',
    'obtener',
    'crear',
    'actualizar',
    'expedienteCompleto',
    'completitudExpediente',
    'nuevoEmbarazo',
    'pasarAPuerperio',
    'cerrarEmbarazo',
  ].map((name) => [name, () => {
    throw new Error(`Controlador inesperado: ${name}`);
  }]));
  const restore = [
    cacheModule(controllerPath, handlers),
    cacheModule(authPath, { authMiddleware: pass }),
    cacheModule(permissionsPath, {
      cargarPermisos: pass,
      verificarPermiso: () => pass,
    }),
    ...nestedRoutePaths.map((modulePath) => cacheModule(modulePath, express.Router())),
  ];
  const poolPath = require.resolve('../src/db/pool');
  restore.push(cacheModule(poolPath, {
    async query() {
      sqlCalls += 1;
      throw new Error('No debe ejecutarse SQL para una ruta inexistente');
    },
  }));
  const previousRoute = require.cache[patientsRoutePath];
  delete require.cache[patientsRoutePath];

  const app = express();
  app.use(express.json());
  app.use('/api/pacientes', require(patientsRoutePath));
  app.use((req, _res, next) => {
    next(new AppError(404, `Ruta ${req.method} ${req.path} no encontrada`, {
      code: 'ROUTE_NOT_FOUND',
    }));
  });
  app.use(errorHandler);

  const server = await listen(app);
  try {
    const port = server.address().port;
    for (const request of [
      ['GET', '/api/pacientes/41/referencias'],
      ['POST', '/api/pacientes/41/referencias'],
      ['PUT', '/api/pacientes/41/referencias/9'],
      ['PATCH', '/api/pacientes/41/referencias/9'],
      ['DELETE', '/api/pacientes/41/referencias/9'],
    ]) {
      const [method, requestPath] = request;
      const response = await fetch(`http://127.0.0.1:${port}${requestPath}`, {
        method,
        redirect: 'manual',
        headers: ['POST', 'PUT', 'PATCH'].includes(method)
          ? { 'content-type': 'application/json' }
          : undefined,
        body: ['POST', 'PUT', 'PATCH'].includes(method) ? '{}' : undefined,
      });
      const body = await response.json();
      assert.equal(response.status, 404, method);
      assert.equal(response.headers.get('location'), null, method);
      assert.equal(body.code, 'ROUTE_NOT_FOUND', method);
      assert.doesNotMatch(body.message, /Riesgo|Morbilidad/i, method);
    }
    assert.equal(sqlCalls, 0);
  } finally {
    await close(server);
    delete require.cache[patientsRoutePath];
    if (previousRoute) require.cache[patientsRoutePath] = previousRoute;
    for (const restoreModule of restore.reverse()) restoreModule();
  }
});

test('usuarios conserva proteccion historica sin consultar la tabla eliminada', () => {
  assert.doesNotMatch(
    USUARIO_TIENE_HISTORIAL_SQL,
    /FROM\s+(?:public\.)?referencias_efectuadas\b/i
  );
  assert.match(
    USUARIO_TIENE_HISTORIAL_SQL,
    /FROM\s+auditoria_eventos\s+ae[\s\S]*?'referencias_efectuadas'/i
  );
});

test('el backend exige el registro exitoso de 008 antes de escuchar', async () => {
  const missingRegistryCalls = [];
  await assert.rejects(
    assertSchemaCompatible({
      async query(sql, params) {
        missingRegistryCalls.push({ sql, params });
        return {
          rows: [{
            migration_registry: null,
          }],
        };
      },
    }),
    (error) => error.code === 'SCHEMA_MIGRATION_REQUIRED'
      && /registro de migraciones/.test(error.message)
  );
  assert.equal(missingRegistryCalls.length, 1);

  await assert.rejects(
    assertSchemaCompatible({
      async query(sql) {
        if (sql.includes('to_regclass')) {
          return {
            rows: [{ migration_registry: 'schema_migrations' }],
          };
        }
        return { rows: [{ applied: false }] };
      },
    }),
    (error) => error.code === 'SCHEMA_MIGRATION_REQUIRED'
      && /requiere que la migracion 008/.test(error.message)
  );

  const successCalls = [];
  await assertSchemaCompatible({
    async query(sql, params) {
      successCalls.push({ sql, params });
      if (sql.includes('to_regclass')) {
        return {
          rows: [{ migration_registry: 'schema_migrations' }],
        };
      }
      return { rows: [{ applied: true }] };
    },
  });
  assert.deepEqual(successCalls[1].params, [REQUIRED_MIGRATION]);
});

test('schema final declara 16 tablas operativas mas schema_migrations', () => {
  const schema = fs.readFileSync(path.join(SOURCE_ROOT, 'db/schema.sql'), 'utf8');
  const tables = [...schema.matchAll(
    /^CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gim
  )].map((match) => match[1]);
  const operational = tables.filter((tableName) => tableName !== 'schema_migrations');

  assert.equal(new Set(tables).size, tables.length);
  assert.equal(tables.length, 17);
  assert.equal(operational.length, 16);
  assert.equal(tables.includes('referencias_efectuadas'), false);
});

test('008 usa timeouts, bloqueo exclusivo, conteo agregado y DROP sin CASCADE', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /SET LOCAL lock_timeout = '5s'/);
  assert.match(sql, /SET LOCAL statement_timeout = '30s'/);
  assert.match(sql, /to_regclass\('public\.referencias_efectuadas'\)/);
  assert.match(sql, /LOCK TABLE public\.referencias_efectuadas IN ACCESS EXCLUSIVE MODE/);
  assert.match(sql, /SELECT COUNT\(\*\) FROM public\.referencias_efectuadas/);
  assert.match(sql, /IF filas_existentes > 0/);
  assert.match(sql, /DROP TABLE public\.referencias_efectuadas;/);
  assert.doesNotMatch(sql, /\bCASCADE\b/i);
  assert.doesNotMatch(sql, /auditoria_eventos|SELECT\s+\*/i);
  assert.equal(checksum(sql).length, 64);
  assert.equal(
    discoverMigrationFiles().some(({ filename }) => filename === REQUIRED_MIGRATION),
    true
  );
});
