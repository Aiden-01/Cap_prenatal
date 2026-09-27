const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { createAuditHistoryRepository } = require('../src/repositories/auditHistoryRepository');
const { createAuditHistoryService } = require('../src/services/auditHistoryService');

// No acepta DATABASE_URL: siempre crea su propio cluster local desechable.
test('Historial en PostgreSQL temporal: migracion, filtros y cursor sin saltos', {
  skip: process.env.RUN_AUDITORIA_TEMP_POSTGRES !== '1', timeout: 60000,
}, async () => {
  const bin = process.env.AUDITORIA_POSTGRES_BIN;
  assert.ok(bin, 'Falta AUDITORIA_POSTGRES_BIN');
  const executable = (name) => path.join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-auditoria-test-'));
  const data = path.join(root, 'data');
  const port = 55483;
  // En Windows postgres hereda handles de pg_ctl; pipes mantienen spawnSync abierto.
  const run = (name, args) => execFileSync(executable(name), args, { stdio: 'ignore', timeout: 30000 });
  run('initdb', ['-D', data, '-U', 'audit_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  let started = false;
  let client;
  try {
    started = true;
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    client = new Client({ host: '127.0.0.1', port, user: 'audit_test', database: 'postgres' });
    await client.connect();
    await client.query(`CREATE TABLE roles (id integer PRIMARY KEY, nombre text);
      CREATE TABLE usuarios (id integer PRIMARY KEY, rol_id integer, username text, nombre_completo text);
      CREATE TABLE permisos (id serial PRIMARY KEY, codigo text UNIQUE, descripcion text, categoria text);
      CREATE TABLE usuario_permisos (usuario_id integer, permiso_id integer, otorgado_por integer, UNIQUE(usuario_id, permiso_id));
      CREATE TABLE auth_sessions (usuario_id integer, revoked_at timestamptz, revoked_reason text, updated_at timestamptz);
      CREATE TABLE auditoria_eventos (id bigint PRIMARY KEY, accion text, modulo text,
        entidad_afectada text, usuario_id integer, fecha_hora timestamptz, created_at timestamptz);
      INSERT INTO roles VALUES (1, 'director'), (2, 'admin'), (3, 'personal_salud');
      INSERT INTO usuarios VALUES (1,1,'director','Director'), (2,2,'admin','Administrador'), (3,3,'salud','Personal');`);
    const migration = fs.readFileSync(path.join(__dirname, '../src/db/migrations/018_auditoria_historial.sql'), 'utf8');
    await client.query(migration);
    await client.query(migration);
    const permissions = await client.query('SELECT usuario_id FROM usuario_permisos ORDER BY usuario_id');
    assert.deepEqual(permissions.rows, [{ usuario_id: 1 }]);
    await client.query(`INSERT INTO usuarios VALUES (4,2,'admin_manual','Admin manual');
      INSERT INTO usuario_permisos SELECT u.id, p.id, CASE WHEN u.id = 2 THEN NULL ELSE 1 END
        FROM usuarios u CROSS JOIN permisos p WHERE u.id IN (2,3,4) AND p.codigo = 'auditoria.ver';
      INSERT INTO auth_sessions (usuario_id) SELECT generate_series(1,4);`);
    const policy = fs.readFileSync(path.join(__dirname, '../src/db/migrations/019_auditoria_politica_roles.sql'), 'utf8');
    await client.query(policy);
    await client.query(policy);
    assert.deepEqual((await client.query('SELECT usuario_id FROM usuario_permisos ORDER BY usuario_id')).rows,
      [{ usuario_id: 1 }, { usuario_id: 4 }]);
    assert.deepEqual((await client.query('SELECT usuario_id FROM auth_sessions WHERE revoked_at IS NOT NULL ORDER BY usuario_id')).rows,
      [{ usuario_id: 2 }, { usuario_id: 3 }]);
    assert.ok((await client.query("SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_auditoria_cursor'"))
      .rows[0].indexdef.includes('COALESCE(fecha_hora, created_at)'));
    await client.query(`INSERT INTO auditoria_eventos
      SELECT n, 'crear', 'pacientes', 'paciente', 2,
        CASE WHEN n = 30 THEN NULL ELSE '2026-09-27T06:00:00.123456Z'::timestamptz END,
        '2026-09-27T06:00:00.123456Z'::timestamptz FROM generate_series(1, 30) n;
      INSERT INTO auditoria_eventos VALUES
        (31, 'exportar', 'reportes', 'reporte', 1, '2026-09-27T05:59:59.999999Z', NULL),
        (32, 'crear', 'pacientes', 'paciente', 3, '2026-09-28T06:00:00Z', NULL),
        (33, 'crear', 'pacientes', 'paciente', NULL, NULL, NULL);`);
    const service = createAuditHistoryService({ repository: createAuditHistoryRepository({ db: client }) });
    const filters = { desde: '2026-09-27', hasta: '2026-09-27', tipo: 'crear',
      modulo: 'pacientes', usuario_id: '2', q: 'admin' };
    const first = await service.listar(filters);
    assert.equal(first.items.length, 25);
    assert.equal(first.items[0].id, '30');
    assert.equal(first.items[0].fecha, '2026-09-27T06:00:00.123456Z');
    const second = await service.listar({ ...filters, cursor: first.next_cursor });
    assert.deepEqual(second.items.map((item) => item.id), ['5', '4', '3', '2', '1']);
    assert.equal(second.has_more, false);
    assert.equal(second.next_cursor, null);
    assert.equal((await service.listar({ desde: '2026-09-26', hasta: '2026-09-26' })).items[0].id, '31');
    assert.equal((await service.listar({ q: '%' })).items.length, 0);
    assert.equal((await service.listar({ q: "' OR TRUE --" })).items.length, 0);
    const all = await service.listar({});
    const tail = await service.listar({ cursor: all.next_cursor });
    assert.equal(tail.items.at(-1).id, '33');
    assert.equal(tail.items.at(-1).fecha, null);
    assert.equal(tail.items.at(-1).usuario, null);
    // También valida el cursor que ya se encuentra en el segmento sin fechas.
    const nullCursor = Buffer.from(JSON.stringify({
      ...JSON.parse(Buffer.from(all.next_cursor, 'base64url')), fecha: null, id: '33',
    })).toString('base64url');
    assert.equal((await service.listar({ cursor: nullCursor })).items.length, 0);
  } finally {
    if (client) await client.end();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    // Conserva el directorio temporal para diagnostico; nunca borra rutas calculadas.
  }
});
