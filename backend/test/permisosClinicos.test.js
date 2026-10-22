const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const permisosRepository = require('../src/repositories/permisosRepository');
const appPool = require('../src/db/pool');
const { seed } = require('../src/db/seed');
const { createCatalogosService } = require('../src/services/catalogosService');
const { createCatalogosRepository } = require('../src/repositories/catalogosRepository');
const { cargoSchema, catalogoSchema } = require('../src/validations/catalogos.schemas');
const { resolveFieldRule, normalizeAllowedAuditValue } = require('../src/services/audit/auditFieldPolicy');
const {
  PERMISOS_CLINICOS, PERMISO_GESTION_CATALOGOS, CLASIFICACIONES_PROFESIONALES,
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

test('clasificación es enum explícito solo para cargos y no se infiere del nombre visible', () => {
  for (const clasificacion_profesional of CLASIFICACIONES_PROFESIONALES) {
    assert.equal(cargoSchema.parse({ nombre: 'Nombre editable', clasificacion_profesional }).clasificacion_profesional, clasificacion_profesional);
  }
  assert.equal(cargoSchema.safeParse({ nombre: 'Médico', clasificacion_profesional: 'doctor' }).success, false);
  assert.equal(catalogoSchema.safeParse({ nombre: 'Especialidad', clasificacion_profesional: 'medico' }).success, false);
  assert.equal(Object.hasOwn(cargoSchema.parse({ nombre: 'Médico' }), 'clasificacion_profesional'), false);
});

test('clasificación omitida conserva la histórica y se audita sin nombre ni descripción libre', async () => {
  let row = { id: 1, nombre: 'Profesión privada', codigo: null, descripcion: 'Narrativa privada', clasificacion_profesional: 'medico' };
  const calls = [];
  const repository = {
    enTransaccion: async fn => fn({}), obtener: async () => row,
    crear: async body => (row = { id: 2, ...body }),
    actualizar: async (_id, body) => (row = { ...row, ...body }),
  };
  const service = createCatalogosService('cargos', { repository, audit: async (_req, event) => calls.push(event) });
  await service.actualizar(1, { nombre: 'Otro nombre', codigo: null, descripcion: null }, {});
  assert.equal(row.clasificacion_profesional, 'medico');
  await service.actualizar(1, { nombre: 'Otro nombre', codigo: null, descripcion: null, clasificacion_profesional: 'enfermeria_ep' }, {});
  assert.deepEqual(calls[1].cambios, {
    anteriores: { clasificacion_profesional: 'medico' }, nuevos: { clasificacion_profesional: 'enfermeria_ep' },
  });
  assert.equal(JSON.stringify(calls).includes('Profesión privada'), false);
  assert.equal(JSON.stringify(calls).includes('Narrativa privada'), false);
  await service.crear({ nombre: 'Médico', codigo: null, descripcion: null }, {});
  assert.equal(row.clasificacion_profesional, 'sin_clasificar');
});

test('repositorio preserva clasificación omitida y nunca agrega campo a especialidades', async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 1 }] }; } };
  const cargos = createCatalogosRepository('cargos', db);
  await cargos.crear({ nombre: 'Cargo', codigo: null, descripcion: null });
  assert.equal(calls[0].params[3], 'sin_clasificar');
  await cargos.actualizar(1, { nombre: 'Cargo', codigo: null, descripcion: null });
  assert.match(calls[1].sql, /clasificacion_profesional = COALESCE\(\$5, clasificacion_profesional\)/);
  assert.equal(calls[1].params[4], null);
  await createCatalogosRepository('especialidades', db).crear({ nombre: 'Especialidad', codigo: null, descripcion: null });
  assert.doesNotMatch(calls[2].sql, /clasificacion_profesional/);
});

test('auditoría admite únicamente el enum de clasificación dentro de su contexto', () => {
  const rule = resolveFieldRule('clasificacion_profesional', { categoria: 'catalogos', entidad: 'cargo_personal', evento: 'actualizar' });
  assert.deepEqual(normalizeAllowedAuditValue(rule, 'medico'), { valid: true, value: 'medico' });
  assert.deepEqual(normalizeAllowedAuditValue(rule, 'Texto privado'), { valid: false, value: null });
});
