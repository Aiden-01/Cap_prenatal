const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const permisosRepository = require('../src/repositories/permisosRepository');
const appPool = require('../src/db/pool');
const { seed } = require('../src/db/seed');
const { createCatalogosService } = require('../src/services/catalogosService');
const { createCatalogosRepository } = require('../src/repositories/catalogosRepository');
const { cargoSchema } = require('../src/validations/catalogos.schemas');
const { resolveFieldRule, normalizeAllowedAuditValue } = require('../src/services/audit/auditFieldPolicy');
const {
  PERMISOS_CLINICOS, PERMISO_GESTION_CATALOGOS,
  PREFIJOS_CLINICOS, filtrarPermisosAutomaticos,
} = require('../src/security/clinicalPermissions');

test('permisos clínicos exactos; toda variante futura de estos módulos queda fuera de defaults', () => {
  assert.equal(PERMISOS_CLINICOS.length, 10);
  assert.equal(new Set(PERMISOS_CLINICOS).size, 10);
  const anteriores = ['auditoria.ver', 'controles.ver_vih', 'pacientes.ver', PERMISO_GESTION_CATALOGOS];
  assert.deepEqual(filtrarPermisosAutomaticos([...anteriores, ...PERMISOS_CLINICOS, 'ordenes_medicas.futuro']), anteriores);
  for (const rol of ['admin', 'personal_salud', 'desconocido']) {
    assert.deepEqual(filtrarPermisosAutomaticos(permisosRepository.codigosPorRol(rol)), permisosRepository.codigosPorRol(rol));
  }
  assert.equal(permisosRepository.codigosPorRol('admin').includes(PERMISO_GESTION_CATALOGOS), true);
  assert.equal(permisosRepository.codigosPorRol('personal_salud').includes(PERMISO_GESTION_CATALOGOS), false);
});

test('alta director filtra namespaces clínicos en SQL sin alterar los permisos vigentes', async () => {
  const calls = [];
  await permisosRepository.asignarPermisosIniciales({ usuarioId: 12, rol: 'director', otorgadoPor: 7 }, {
    query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WHERE NOT \(p\.codigo LIKE ANY\(\$3::text\[\]\)\)/);
  assert.deepEqual(calls[0].params, [12, 7, PREFIJOS_CLINICOS.map(prefijo => `${prefijo}%`)]);
  for (const rol of ['admin', 'personal_salud']) {
    calls.length = 0;
    await permisosRepository.asignarPermisosIniciales({ usuarioId: 12, rol }, {
      query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; },
    });
    assert.equal(calls[0].params[2].some(codigo => PERMISOS_CLINICOS.includes(codigo)), false);
  }
});

test('reemplazo de permisos por rol director excluye clínicos incluso si están en el catálogo', async () => {
  const previous = { query: appPool.query, connect: appPool.connect };
  let assigned;
  const query = async (sql, params) => {
    if (sql.includes('SELECT id, codigo, descripcion, categoria FROM permisos')) {
      return { rows: [...PERMISOS_CLINICOS, 'ordenes_medicas.futura', 'controles.ver_vih', PERMISO_GESTION_CATALOGOS]
        .map(codigo => ({ codigo })) };
    }
    if (sql.includes('INSERT INTO usuario_permisos')) assigned = params[1];
    return { rows: [] };
  };
  appPool.query = query;
  appPool.connect = async () => ({ query, release() {} });
  try {
    await permisosRepository.reemplazarPermisosPorRol({ usuarioId: 12, rol: 'director', otorgadoPor: 7 });
    assert.deepEqual(assigned, ['controles.ver_vih', PERMISO_GESTION_CATALOGOS]);
  } finally { appPool.query = previous.query; appPool.connect = previous.connect; }
});

test('seed repetido después de ampliar catálogo tampoco concede facultades clínicas al director', async () => {
  const calls = [];
  const db = {
    connect: async () => ({ query: async (sql, params) => {
      calls.push({ sql, params });
      return sql.includes('WHERE u.username = $1') ? { rowCount: 1, rows: [{ id: 1, rol: 'director' }] } : { rowCount: 0, rows: [] };
    }, release() {} }), end: async () => {},
  };
  await seed({ db, logger: { log() {}, error() {} }, env: {
    NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '55475', DB_NAME: 'synthetic',
    DB_USER: 'synthetic', DB_PASSWORD: 'test-only-password', DB_SSL: 'false',
    SEED_DIRECTOR_NAME: 'Director sintético', SEED_DIRECTOR_USERNAME: 'synthetic',
    SEED_DIRECTOR_PASSWORD: 'test-only-CPREN117-password',
  } });
  const assignment = calls.find(call => call.sql.includes('INSERT INTO usuario_permisos'));
  assert.match(assignment.sql, /r\.nombre = 'director' AND NOT \(p\.codigo LIKE ANY\(\$1::text\[\]\)\)/);
  assert.deepEqual(assignment.params, [PREFIJOS_CLINICOS.map(prefijo => `${prefijo}%`)]);
  assert.match(assignment.sql, /catalogos_profesionales\.gestionar/);
});

test('025 es aditiva y la única concesión automática conserva la gestión administrativa', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../src/db/migrations/025_permisos_autoria_clinica.sql'), 'utf8');
  const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(schema.slice(schema.indexOf('-- CPREN-117:'), schema.indexOf('-- CPREN-118:')).trim(), migration.replaceAll('\r\n', '\n').trim());
  const codigo = migration.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(codigo, /\b(?:DELETE|DROP|TRUNCATE|UPDATE)\b/i);
  const insertCatalogo = codigo.slice(0, codigo.indexOf('INSERT INTO usuario_permisos'));
  for (const permiso of [...PERMISOS_CLINICOS, PERMISO_GESTION_CATALOGOS]) assert.ok(insertCatalogo.includes(`('${permiso}',`));
  const concesiones = codigo.slice(codigo.indexOf('INSERT INTO usuario_permisos'), codigo.indexOf('ALTER TABLE cargos_personal'));
  assert.match(concesiones, /p\.codigo = 'catalogos_profesionales\.gestionar'/);
  assert.match(concesiones, /r\.nombre IN \('admin', 'director'\)/);
  assert.doesNotMatch(concesiones, /notas_evolucion|notas_enfermeria|ordenes_medicas/);
  assert.equal((codigo.match(/ON CONFLICT/g) || []).length, 2);
  assert.match(codigo, /ADD COLUMN IF NOT EXISTS clasificacion_profesional TEXT\s+NOT NULL DEFAULT 'sin_clasificar'/);
  assert.match(codigo, /IF NOT EXISTS \([\s\S]*pg_constraint/);
});

test('cargo no acepta clasificación y códigos no otorgan permisos',()=>{
 assert.equal(cargoSchema.safeParse({nombre:'Cargo',clasificacion_profesional:'medico'}).success,false);
 assert.equal(cargoSchema.parse({nombre:'Nombre editable',codigo:'MED'}).codigo,'MED');
});
