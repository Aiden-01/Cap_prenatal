const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { Client, Pool } = require('pg');
const { applyMigration, migrate, discoverMigrationFiles } = require('../src/db/migrate');
const { seed } = require('../src/db/seed');
const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');
const permisosRepository = require('../src/repositories/permisosRepository');

const filename = '020_retirar_permiso_pacientes_eliminar.sql';
const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
const esperados = [
  'auditoria.ver', 'controles.crear', 'controles.editar', 'controles.ver_vih',
  'mapa_riesgo.ver', 'pacientes.crear', 'pacientes.editar', 'pacientes.ver',
  'reportes.exportar', 'reportes.ver',
];

test('020 retira concesiones antes del permiso, por codigo y sin otras escrituras', () => {
  const filenames = discoverMigrationFiles().map((migration) => migration.filename);
  assert.ok(filenames.includes(filename));
  assert.ok(filenames.indexOf(filename) > filenames.indexOf('019_auditoria_politica_roles.sql'));
  const sentencias = sql.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(sentencias.length, 2);
  assert.match(sentencias[0], /^DELETE FROM usuario_permisos up\s+USING permisos p\s+WHERE up\.permiso_id = p\.id\s+AND p\.codigo = 'pacientes\.eliminar'$/);
  assert.match(sentencias[1], /^DELETE FROM permisos\s+WHERE codigo = 'pacientes\.eliminar'$/);
});

test('pacientes no declara DELETE ni service o repository de borrado', () => {
  const router = require('../src/routes/pacientes');
  const rutas = router.stack.filter((layer) => layer.route).map((layer) => layer.route);
  assert.ok(rutas.length > 0);
  assert.equal(rutas.some((route) => route.methods.delete || route.methods._all), false);
  for (const modulo of ['services/pacientesService', 'repositories/pacientesRepository']) {
    assert.equal(Object.keys(require(`../src/${modulo}`)).some((name) => /eliminar|borrar|delete|remove/i.test(name)), false);
    const source = fs.readFileSync(path.join(__dirname, '../src', `${modulo}.js`), 'utf8');
    assert.doesNotMatch(source, /\b(?:DELETE|TRUNCATE|DROP)\b/i);
  }
});

async function puertoLibre() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// Nunca acepta DATABASE_URL ni conecta a un cluster existente.
test('PostgreSQL temporal: instalacion limpia, retirada, repeticion y seed sin recreacion', {
  skip: process.env.RUN_RETIRO_PERMISO_TEMP_POSTGRES !== '1', timeout: 120000,
}, async (t) => {
  const bin = process.env.RETIRO_PERMISO_POSTGRES_BIN;
  assert.ok(bin, 'Falta RETIRO_PERMISO_POSTGRES_BIN');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-retiro-permiso-'));
  const data = path.join(root, 'data');
  const port = await puertoLibre();
  const run = (name, args) => execFileSync(path.join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`),
    args, { stdio: 'ignore', windowsHide: true, timeout: 30000 });
  const config = { host: '127.0.0.1', port, user: 'retiro_test', database: 'postgres' };
  const logger = { log() {}, error() {} };
  const seedTemporal = () => seed({ db: new Pool(config), logger,
    env: { NODE_ENV: 'test', DB_HOST: config.host, DB_PORT: String(port), DB_NAME: config.database,
      DB_USER: config.user, DB_PASSWORD: 'synthetic-test-only', DB_SSL: 'false',
      SEED_DIRECTOR_NAME: 'Director sintetico', SEED_DIRECTOR_USERNAME: 'director.sintetico',
      SEED_DIRECTOR_PASSWORD: 'Synthetic-Only-CPREN40!2026' },
    hashPassword: async () => 'synthetic-only-hash' });
  let started = false;
  let client;
  try {
    run('initdb', ['-D', data, '-U', config.user, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    started = true;
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    client = new Client(config);
    await client.connect();
    await t.test('migrador y seed en instalacion limpia y seed repetido', async () => {
      const result = await migrate({ db: new Pool(config), logger, setExitCode() {} });
      assert.equal(result.ok, true, result.error?.message);
      await assertSchemaCompatible(client);
      assert.equal((await seedTemporal()).accountCreated, true);
      assert.equal((await seedTemporal()).accountCreated, false);
      assert.deepEqual((await permisosRepository.listarCatalogo(client)).map((p) => p.codigo).sort(), esperados);
    });

    await client.query(`INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
      SELECT 'Admin sintetico', 'admin.sintetico', 'synthetic-only-hash', id FROM roles WHERE nombre = 'admin';
      INSERT INTO permisos (codigo, descripcion, categoria) VALUES ('pacientes.eliminar', 'Accidental', 'pacientes');
      INSERT INTO usuario_permisos (usuario_id, permiso_id)
        SELECT u.id, p.id FROM usuarios u CROSS JOIN permisos p WHERE p.codigo IN ('pacientes.eliminar', 'pacientes.ver')
        ON CONFLICT (usuario_id, permiso_id) DO NOTHING;
      INSERT INTO pacientes (no_expediente, nombres, apellidos) VALUES ('SINTETICO-CPREN40', 'Paciente', 'Sintetica');
      INSERT INTO embarazos (paciente_id, numero_embarazo) SELECT id, 1 FROM pacientes;
      INSERT INTO controles_prenatales (paciente_id, embarazo_id, numero_control, fecha)
        SELECT paciente_id, id, 1, CURRENT_DATE FROM embarazos;
      CREATE FUNCTION verificar_retirada_previa() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM usuario_permisos WHERE permiso_id = OLD.id) THEN
          RAISE EXCEPTION 'Las concesiones deben retirarse antes del permiso';
        END IF;
        RETURN OLD;
      END $$;
      CREATE TRIGGER verificar_retirada_previa BEFORE DELETE ON permisos
        FOR EACH ROW EXECUTE FUNCTION verificar_retirada_previa();`);
    const snapshot = async () => {
      const tables = ['usuarios', 'pacientes', 'embarazos', 'controles_prenatales'];
      const rows = {};
      for (const table of tables) rows[table] = (await client.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
      rows.permisos = (await client.query("SELECT * FROM permisos WHERE codigo <> 'pacientes.eliminar' ORDER BY id")).rows;
      rows.concesiones = (await client.query(`SELECT up.* FROM usuario_permisos up JOIN permisos p ON p.id = up.permiso_id
        WHERE p.codigo <> 'pacientes.eliminar' ORDER BY up.id`)).rows;
      return rows;
    };
    const antes = await snapshot();
    const retiredId = (await client.query("SELECT id FROM permisos WHERE codigo = 'pacientes.eliminar'")).rows[0].id;
    assert.equal((await client.query('SELECT * FROM usuario_permisos WHERE permiso_id = $1', [retiredId])).rowCount, 2);
    // Simula una base existente que todavía no tiene registrada la 020.
    await client.query('DELETE FROM schema_migrations WHERE filename = $1', [filename]);
    await t.test('020 elimina solo el permiso accidental y sus concesiones, en orden', async () => {
      assert.equal(await applyMigration({ db: client, filename, sql }), true);
      assert.equal((await client.query('SELECT * FROM permisos WHERE id = $1', [retiredId])).rowCount, 0);
      assert.equal((await client.query('SELECT * FROM usuario_permisos WHERE permiso_id = $1', [retiredId])).rowCount, 0);
      assert.deepEqual(await snapshot(), antes);
      assert.deepEqual((await permisosRepository.existenCodigos([...esperados, 'pacientes.eliminar'], client)).sort(), esperados);
    });
    await t.test('segunda aplicacion segura y seed sobre base migrada sin recrear el permiso', async () => {
      assert.equal(await applyMigration({ db: client, filename, sql }), false);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      assert.deepEqual(await snapshot(), antes);
      await seedTemporal();
      await seedTemporal();
      assert.deepEqual((await permisosRepository.listarCatalogo(client)).map((p) => p.codigo).sort(), esperados);
      assert.equal((await client.query('SELECT * FROM usuario_permisos WHERE permiso_id = $1', [retiredId])).rowCount, 0);
      for (const table of ['usuarios', 'pacientes', 'embarazos', 'controles_prenatales']) {
        assert.deepEqual((await snapshot())[table], antes[table]);
      }
      await assertSchemaCompatible(client);
    });
  } finally {
    if (client) await client.end();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    // Conserva la ruta temporal para diagnóstico; no elimina rutas calculadas.
  }
});
