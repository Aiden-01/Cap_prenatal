const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Client, Pool } = require('pg');

const {
  USUARIO_TIENE_HISTORIAL_SQL,
} = require('../src/repositories/usuariosRepository');
const {
  assertSchemaCompatible,
} = require('../src/db/schemaCompatibility');
const {
  checksum,
  migrate,
} = require('../src/db/migrate');

const MIGRATION_FILENAME = '008_retirar_referencias_efectuadas.sql';
const MIGRATIONS_DIR = path.resolve(__dirname, '../src/db/migrations');
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);
const integrationEnabled = process.env.RUN_POSTGRES_MIGRATION_008 === '1';
const isolatedTest = integrationEnabled ? test : test.skip;

function assertTemporaryClusterTarget(connectionString) {
  assert.equal(
    process.env.MIGRATION_008_TEMP_CLUSTER,
    '1',
    'La prueba exige confirmacion explicita de cluster PostgreSQL temporal'
  );
  const url = new URL(connectionString);
  assert.ok(
    ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname),
    'El cluster temporal debe estar en loopback'
  );
  return url;
}

function databaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteDatabase(databaseName) {
  assert.match(databaseName, /^[a-z][a-z0-9_]{0,62}$/);
  return `"${databaseName}"`;
}

async function withClient(connectionString, callback) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function runMigration(connectionString, { without008 = false } = {}) {
  const entries = { log: [], error: [] };
  const exitCodes = [];
  const options = {
    db: new Pool({ connectionString, connectionTimeoutMillis: 5000 }),
    logger: {
      log: (...args) => entries.log.push(args.join(' ')),
      error: (...args) => entries.error.push(args.join(' ')),
    },
    setExitCode: (code) => exitCodes.push(code),
  };
  if (without008) {
    options.readDirectory = (directory) => fs.readdirSync(directory)
      .filter((filename) => filename !== MIGRATION_FILENAME);
  }
  const result = await migrate(options);
  return { ...result, entries, exitCodes };
}

async function publicTables(client) {
  const { rows } = await client.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`
  );
  return rows.map(({ tablename }) => tablename);
}

isolatedTest('migracion 008 en cuatro bases PostgreSQL temporales', async (t) => {
  const baseConnectionString = process.env.MIGRATION_008_TEST_DATABASE_URL;
  assert.ok(baseConnectionString, 'Falta MIGRATION_008_TEST_DATABASE_URL');
  const baseUrl = assertTemporaryClusterTarget(baseConnectionString);
  const suffix = `${process.pid}_${Date.now()}`.slice(-18);
  const databases = {
    a: `cap_s6r1_a_${suffix}`,
    b: `cap_s6r1_b_${suffix}`,
    c: `cap_s6r1_c_${suffix}`,
    d: `cap_s6r1_d_${suffix}`,
  };
  const admin = new Client({
    connectionString: baseUrl.toString(),
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();

  try {
    for (const databaseName of Object.values(databases)) {
      await admin.query(`CREATE DATABASE ${quoteDatabase(databaseName)}`);
    }

    await t.test('A: tabla vacia se elimina y el runner es idempotente', async () => {
      const url = databaseUrl(baseUrl, databases.a);
      await withClient(url, async (client) => {
        await client.query(
          `CREATE TABLE public.referencias_efectuadas (
             id SERIAL PRIMARY KEY,
             marcador TEXT
           );
           CREATE INDEX idx_referencias_paciente
             ON public.referencias_efectuadas (marcador);
           CREATE TABLE public.sprint6_sentinel (
             id INTEGER PRIMARY KEY,
             valor TEXT NOT NULL
           );
           INSERT INTO public.sprint6_sentinel VALUES (1, 'intacto');`
        );
      });

      const first = await runMigration(url);
      assert.equal(first.ok, true);
      assert.match(first.entries.log[0], /5 aplicada\(s\), 0 omitida\(s\)/);

      await withClient(url, async (client) => {
        const { rows } = await client.query(
          `SELECT
             to_regclass('public.referencias_efectuadas') AS tabla,
             to_regclass('public.referencias_efectuadas_id_seq') AS secuencia,
             to_regclass('public.idx_referencias_paciente') AS indice,
             (SELECT valor FROM sprint6_sentinel WHERE id = 1) AS sentinel,
             (SELECT COUNT(*)::integer FROM schema_migrations
               WHERE filename = $1) AS registros_008`,
          [MIGRATION_FILENAME]
        );
        assert.deepEqual(rows[0], {
          tabla: null,
          secuencia: null,
          indice: null,
          sentinel: 'intacto',
          registros_008: 1,
        });
        assert.equal((await publicTables(client)).length, 18);
      });

      const second = await runMigration(url);
      assert.equal(second.ok, true);
      assert.match(second.entries.log[0], /0 aplicada\(s\), 5 omitida\(s\)/);
      await withClient(url, async (client) => {
        const { rows } = await client.query(
          `SELECT COUNT(*)::integer AS total, MIN(checksum) AS checksum
           FROM schema_migrations
           WHERE filename = $1`,
          [MIGRATION_FILENAME]
        );
        assert.equal(rows[0].total, 1);
        assert.equal(
          rows[0].checksum,
          checksum(fs.readFileSync(MIGRATION_PATH, 'utf8'))
        );
      });
    });

    await t.test('B: una fila sintetica aborta y revierte solo 008', async () => {
      const url = databaseUrl(baseUrl, databases.b);
      assert.equal((await runMigration(url, { without008: true })).ok, true);
      await withClient(url, async (client) => {
        await client.query(
          `CREATE TABLE public.referencias_efectuadas (
             id SERIAL PRIMARY KEY,
             marcador TEXT NOT NULL
           );
           INSERT INTO public.referencias_efectuadas (marcador)
             VALUES ('fila_sintetica_confidencial');
           CREATE TABLE public.sprint6_sentinel (
             id INTEGER PRIMARY KEY,
             valor TEXT NOT NULL
           );
           INSERT INTO public.sprint6_sentinel VALUES (1, 'intacto');`
        );
      });
      let tablesBefore;
      await withClient(url, async (client) => {
        tablesBefore = await publicTables(client);
      });

      const result = await runMigration(url);
      assert.equal(result.ok, false);
      assert.deepEqual(result.exitCodes, [1]);
      assert.match(result.error.message, /contiene 1 fila\(s\); no se eliminaron datos/);
      assert.doesNotMatch(
        `${result.error.message} ${result.entries.error.join(' ')}`,
        /fila_sintetica_confidencial/
      );

      await withClient(url, async (client) => {
        assert.deepEqual(await publicTables(client), tablesBefore);
        const { rows } = await client.query(
          `SELECT
             to_regclass('public.referencias_efectuadas') IS NOT NULL AS tabla,
             (SELECT COUNT(*)::integer FROM referencias_efectuadas) AS filas,
             (SELECT valor FROM sprint6_sentinel WHERE id = 1) AS sentinel,
             (SELECT COUNT(*)::integer FROM schema_migrations
               WHERE filename = $1) AS registros_008`,
          [MIGRATION_FILENAME]
        );
        assert.deepEqual(rows[0], {
          tabla: true,
          filas: 1,
          sentinel: 'intacto',
          registros_008: 0,
        });
      });
    });

    await t.test('C: instalacion limpia registra 008 y conserva 17 tablas finales', async () => {
      const url = databaseUrl(baseUrl, databases.c);
      const result = await runMigration(url);
      assert.equal(result.ok, true);

      await withClient(url, async (client) => {
        const tables = await publicTables(client);
        assert.equal(tables.length, 17);
        assert.equal(tables.includes('schema_migrations'), true);
        assert.equal(tables.includes('referencias_efectuadas'), false);
        await assertSchemaCompatible(client);

        const role = await client.query(
          `INSERT INTO roles (nombre, descripcion)
           VALUES ('personal_salud', 'Rol sintetico')
           RETURNING id`
        );
        const users = await client.query(
          `INSERT INTO usuarios (
             nombre_completo, username, password_hash, rol_id
           ) VALUES
             ('Usuario Historico', 'historico.sintetico', 'hash-no-real', $1),
             ('Usuario Nuevo', 'nuevo.sintetico', 'hash-no-real', $1)
           RETURNING id, username`,
          [role.rows[0].id]
        );
        const historicalUser = users.rows.find(
          ({ username }) => username === 'historico.sintetico'
        );
        await client.query(
          `INSERT INTO auditoria_eventos (
             usuario_id, accion, modulo, entidad_afectada, tabla, descripcion
           ) VALUES ($1, 'crear', 'referencias', 'referencia',
             'referencias_efectuadas', 'crear')`,
          [historicalUser.id]
        );
        const protectedUsers = await client.query(
          `SELECT u.username,
                  ${USUARIO_TIENE_HISTORIAL_SQL} AS tiene_registros
           FROM usuarios u
           ORDER BY u.username`
        );
        assert.deepEqual(protectedUsers.rows, [
          { username: 'historico.sintetico', tiene_registros: true },
          { username: 'nuevo.sintetico', tiene_registros: false },
        ]);
      });
    });

    await t.test('D: dependencia entrante hace rollback sin CASCADE', async () => {
      const url = databaseUrl(baseUrl, databases.d);
      assert.equal((await runMigration(url, { without008: true })).ok, true);
      await withClient(url, async (client) => {
        await client.query(
          `CREATE TABLE public.referencias_efectuadas (
             id SERIAL PRIMARY KEY
           );
           CREATE VIEW public.dependencia_referencias AS
             SELECT id FROM public.referencias_efectuadas;
           CREATE TABLE public.sprint6_sentinel (
             id INTEGER PRIMARY KEY,
             valor TEXT NOT NULL
           );
           INSERT INTO public.sprint6_sentinel VALUES (1, 'intacto');`
        );
      });

      const result = await runMigration(url);
      assert.equal(result.ok, false);
      assert.match(
        result.error.message,
        /dependen de .*referencias_efectuadas|depend on table|other objects depend on it/i
      );

      await withClient(url, async (client) => {
        const { rows } = await client.query(
          `SELECT
             to_regclass('public.referencias_efectuadas') IS NOT NULL AS tabla,
             to_regclass('public.dependencia_referencias') IS NOT NULL AS dependencia,
             (SELECT valor FROM sprint6_sentinel WHERE id = 1) AS sentinel,
             (SELECT COUNT(*)::integer FROM schema_migrations
               WHERE filename = $1) AS registros_008`,
          [MIGRATION_FILENAME]
        );
        assert.deepEqual(rows[0], {
          tabla: true,
          dependencia: true,
          sentinel: 'intacto',
          registros_008: 0,
        });
      });
    });
  } finally {
    for (const databaseName of Object.values(databases).reverse()) {
      await admin.query(`DROP DATABASE IF EXISTS ${quoteDatabase(databaseName)} WITH (FORCE)`);
    }
    await admin.end();
  }
});
