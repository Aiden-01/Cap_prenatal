const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PostgresTestPool, runPostgresCleanup, removeTemporaryPostgres } = require('./helpers/postgresCleanup');
const appPool = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');
const pacientes = require('../src/services/pacientesService');
const { pacienteCreateSchema, pacienteUpdateSchema } = require('../src/validations/pacientes.schemas');
const { createPdfService } = require('../src/services/pdfService');
const { createReportesRepository } = require('../src/repositories/reportesRepository');
const citas = require('../src/repositories/citasPrenatalesRepository');
const { createAutomatizacionesRepository } = require('../src/repositories/automatizacionesRepository');
const { createAutomatizacionesService } = require('../src/services/automatizacionesService');

const migration = '033_normalizar_comunidad_paciente.sql';
const sql033 = fs.readFileSync(path.join(__dirname, '../src/db/migrations', migration), 'utf8');
const texto150 = 'Ubicación externa sintética '.padEnd(150, 'X');

test('entrada territorial distingue omisión, null explícito y texto de 150 caracteres', () => {
  assert.equal(Object.hasOwn(pacienteUpdateSchema.parse({ version: 1 }), 'comunidad_id'), false);
  assert.equal(pacienteUpdateSchema.parse({ version: 1, comunidad_id: null }).comunidad_id, null);
  assert.equal(pacienteUpdateSchema.parse({ version: 1, comunidad: texto150 }).comunidad.length, 150);
  assert.equal(pacienteUpdateSchema.safeParse({ version: 1, comunidad: texto150 + 'X' }).success, false);
});

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function snapshot(db) {
  const { rows } = await db.query('SELECT to_jsonb(p) AS paciente FROM pacientes p ORDER BY id');
  return rows.map(row => row.paciente);
}

test('033 conserva datos y rollback; las lecturas territoriales reflejan el catálogo vigente', {
  skip: process.env.RUN_CPREN127_TEMP_POSTGRES !== '1', timeout: 180000,
}, async t => {
  const bin = process.env.CPREN127_POSTGRES_BIN || (process.platform === 'win32'
    ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-cpren127-'));
  const dataDir = path.join(root, 'data');
  const database = { host: '127.0.0.1', port: await freePort(), user: 'cpren127_test', database: 'postgres' };
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')),
    args, { stdio: 'ignore', windowsHide: true, timeout: 30000 });
  const connectionArgs = ['-h', database.host, '-p', String(database.port), '-U', database.user];
  const migrationOptions = { logger: { log() {}, error() {} }, setExitCode() {} };
  const originalPool = { query: appPool.query, connect: appPool.connect };
  let started = false;
  let db;
  let restored;
  try {
    run('initdb', ['-D', dataDir, '-U', database.user, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    const serverOptions = `-h 127.0.0.1 -p ${database.port}`
      + (process.platform === 'win32' ? '' : ` -k "${root}"`);
    run('pg_ctl', ['-D', dataDir, '-l', path.join(root, 'postgres.log'), '-o', serverOptions, '-w', 'start']);
    started = true;
    db = new PostgresTestPool(database);
    assert.equal(path.resolve((await db.query('SHOW data_directory')).rows[0].data_directory), path.resolve(dataDir));
    const beforeMigration = await migrate({
      ...migrationOptions,
      db: new PostgresTestPool(database),
      readDirectory: dir => fs.readdirSync(dir).filter(file => file !== migration),
      readSchema: (file, encoding) => fs.readFileSync(file, encoding).split('-- CPREN-127:')[0],
      verifyCompatibility: async () => {},
    });
    assert.equal(beforeMigration.ok, true, beforeMigration.error?.message);
    await db.query(`INSERT INTO roles (nombre) VALUES ('director') ON CONFLICT (nombre) DO NOTHING;
      INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
      SELECT 'Cuenta sintética', 'sintetico127', 'sin-login', id FROM roles WHERE nombre = 'director';
      INSERT INTO comunidades (nombre, territorio, sector, lat, lng, activo) VALUES
        ('Catálogo sintético CPREN-127', 1, 'A', 16.5, -89.5, TRUE),
        ('Inactiva sintética CPREN-127', 2, 'B', 16.5, -89.5, FALSE);
      INSERT INTO comunidades_aliases (comunidad_id, alias)
      SELECT id, 'Alias compartido' FROM comunidades WHERE nombre LIKE '%CPREN-127';
      INSERT INTO pacientes (no_expediente, nombres, apellidos, fecha_nacimiento,
        municipio, comunidad_id, comunidad, territorio, sector, comunidad_linguistica)
      SELECT 'SYN-127-A', 'Catalogada', 'Sintética', DATE '2000-01-01',
        'El Chal', id, 'Nombre anterior', '4', 'B', 'Idioma sintético'
      FROM comunidades WHERE nombre = 'Catálogo sintético CPREN-127'
      UNION ALL
      SELECT 'SYN-127-I', 'Inactiva', 'Sintética', DATE '2000-01-01',
        'Otro municipio', id, 'Referencia histórica', NULL, NULL, NULL
      FROM comunidades WHERE nombre = 'Inactiva sintética CPREN-127'
      UNION ALL
      SELECT 'SYN-127-B', 'Ambigua', 'Sintética', DATE '2000-01-01',
        'El Chal', NULL, 'Alias compartido', '2', 'B', 'Otra lengua'
      UNION ALL
      SELECT 'SYN-127-C', 'Externa', 'Sintética', DATE '2000-01-01',
        'Otro municipio', NULL, 'Ubicación externa', NULL, NULL, NULL;`);
    const original = await snapshot(db);
    const catalogada = original.find(p => p.no_expediente === 'SYN-127-A');
    const inactiva = original.find(p => p.no_expediente === 'SYN-127-I');
    const externa = original.find(p => p.no_expediente === 'SYN-127-C');
    const backup = path.join(root, 'antes-de-033.dump');
    run('pg_dump', [...connectionArgs, '-d', database.database, '-Fc', '-f', backup]);

    const tx = await db.connect();
    let txError;
    try {
      await tx.query('BEGIN');
      try { await tx.query(sql033); }
      finally { await tx.query('ROLLBACK'); }
    } catch (error) {
      txError = error;
      throw error;
    } finally {
      tx.release(txError);
    }
    assert.deepEqual(await snapshot(db), original);
    assert.equal((await db.query("SELECT to_regclass('pacientes_ubicacion_legado') AS tabla")).rows[0].tabla, null);

    const migrated = await migrate({ ...migrationOptions, db: new PostgresTestPool(database) });
    assert.equal(migrated.ok, true, migrated.error?.message);
    const after = await snapshot(db);
    assert.deepEqual(after, original.map(p => p.comunidad_id === null ? p
      : { ...p, comunidad: null, territorio: null, sector: null }));
    assert.deepEqual((await db.query('SELECT * FROM pacientes_ubicacion_legado ORDER BY paciente_id')).rows,
      original.filter(p => p.comunidad_id !== null).map(p => ({
        paciente_id: p.id, comunidad_id_original: p.comunidad_id, comunidad: p.comunidad, territorio: p.territorio, sector: p.sector,
      })));
    assert.equal((await migrate({ ...migrationOptions, db: new PostgresTestPool(database) })).ok, true);
    assert.deepEqual(await snapshot(db), after);
    await assert.rejects(db.query("UPDATE pacientes SET comunidad = 'Duplicada' WHERE id = $1", [catalogada.id]),
      { code: '23514', constraint: 'pacientes_ubicacion_catalogada_check' });
    await assert.rejects(db.query('UPDATE pacientes SET comunidad_id = 2147483647, comunidad = NULL, territorio = NULL, sector = NULL WHERE id = $1', [externa.id]), { code: '23503' });

    appPool.query = db.query.bind(db);
    appPool.connect = db.connect.bind(db);
    const { rows: [actor] } = await db.query("SELECT id FROM usuarios WHERE username = 'sintetico127'");
    const req = { usuario: { id: actor.id, rol: 'director', permisos: [] }, headers: {}, method: 'PUT', originalUrl: '/api/pacientes' };
    const actualizar = (id, body) => pacientes.actualizarPaciente({ id, body: pacienteUpdateSchema.parse(body), req });
    await actualizar(catalogada.id, { version: catalogada.version, municipio: ' El Chal ', comunidad: 'Texto antiguo que no se guarda', telefono: '01234' });
    assert.equal((await pacientes.obtenerPaciente(catalogada.id)).comunidad_id, catalogada.comunidad_id);
    assert.equal((await pacientes.obtenerPaciente(catalogada.id)).comunidad, 'Catálogo sintético CPREN-127');
    await actualizar(inactiva.id, { version: inactiva.version, comunidad_id: inactiva.comunidad_id, municipio: inactiva.municipio, telefono: '01235' });
    assert.equal((await pacientes.obtenerPaciente(inactiva.id)).comunidad_id, inactiva.comunidad_id);
    const catalogadaVersion = (await pacientes.obtenerPaciente(catalogada.id)).version;
    await assert.rejects(actualizar(catalogada.id, { version: catalogadaVersion, municipio: 'Otro municipio' }),
      { code: 'COMUNIDAD_MUNICIPIO_INCOMPATIBLE' });
    await assert.rejects(actualizar(externa.id, { version: externa.version, municipio: 'El Chal', comunidad_id: inactiva.comunidad_id }),
      { code: 'COMUNIDAD_INVALIDA' });

    const nuevoNombre = 'Nombre vigente del catálogo sintético '.padEnd(150, 'Z');
    await db.query("UPDATE comunidades SET nombre = $1, territorio = 3, sector = 'B' WHERE id = $2", [nuevoNombre, catalogada.comunidad_id]);
    const { rows: [cita] } = await db.query(`WITH embarazo AS (
      INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur) VALUES ($1, 1, 'activo', CURRENT_DATE - 180) RETURNING id
    ), control AS (
      INSERT INTO controles_prenatales (paciente_id, embarazo_id, numero_control, fecha)
      SELECT $1, id, 1, CURRENT_DATE - 7 FROM embarazo RETURNING id, embarazo_id
    )
    INSERT INTO citas_prenatales (embarazo_id, control_origen_id, fecha_programada)
      SELECT embarazo_id, id, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date + 1 FROM control
      RETURNING id, to_char(fecha_programada, 'YYYY-MM-DD') AS fecha`, [catalogada.id]);
    const expediente = await pacientes.expedienteCompleto(catalogada.id);
    assert.equal(expediente.paciente.comunidad, nuevoNombre);
    assert.equal(expediente.paciente.territorio, '3');
    assert.equal(expediente.paciente.sector, 'B');
    assert.equal(expediente.paciente.comunidad_linguistica, 'Idioma sintético');
    assert.equal((await pacientes.listarPacientes({ buscar: 'SYN-127-A' })).data[0].comunidad, nuevoNombre);
    assert.equal((await createPdfService().obtenerFichaMspasData(catalogada.id)).paciente.comunidad, nuevoNombre);
    const reportes = createReportesRepository(db);
    assert.equal((await reportes.obtenerRowsCensoGeneral()).find(p => p.no_expediente === 'SYN-127-A').comunidad, nuevoNombre);
    assert.equal((await reportes.obtenerResumenPorComunidad())[0].comunidad, nuevoNombre);
    assert.equal((await citas.listarCalendarioPorRango({ desde: cita.fecha, hasta: cita.fecha }, db))[0].community, nuevoNombre);
    const automatizaciones = createAutomatizacionesService({ repository: createAutomatizacionesRepository(db) });
    const proximas = await automatizaciones.consultarProximasCitas({ offsetDays: 1, windowDays: 1 });
    assert.equal(proximas.appointments[0].community, nuevoNombre.slice(0, 120));

    await actualizar(catalogada.id, { version: catalogadaVersion, municipio: 'Otro municipio', comunidad_id: null });
    const desvinculada = await pacientes.obtenerPaciente(catalogada.id);
    assert.equal(desvinculada.comunidad_id, null);
    assert.equal(desvinculada.comunidad, nuevoNombre);
    assert.equal(desvinculada.territorio, null);
    const nueva = await pacientes.crearPaciente({ body: pacienteCreateSchema.parse({
      no_expediente: 'SYN-127-N', nombres: 'Nueva', apellidos: 'Sintética',
      municipio: 'Otro municipio', comunidad: texto150, comunidad_linguistica: 'Independiente',
    }), req });
    assert.equal((await pacientes.obtenerPaciente(nueva.id)).comunidad, texto150);

    await db.query('CREATE DATABASE cpren127_rollback');
    run('pg_restore', [...connectionArgs, '-d', 'cpren127_rollback', '--exit-on-error', backup]);
    restored = new PostgresTestPool({ ...database, database: 'cpren127_rollback', max: 1 });
    assert.deepEqual(await snapshot(restored), original);
    const { rows: [schema] } = await restored.query(`SELECT character_maximum_length AS longitud,
      to_regclass('pacientes_ubicacion_legado') AS archivo
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pacientes' AND column_name = 'comunidad'`);
    assert.deepEqual(schema, { longitud: 100, archivo: null });
    assert.equal((await restored.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [migration])).rowCount, 0);
    t.diagnostic('4 pacientes sintéticas verificadas antes/después; 2 vínculos archivados; respaldo restaurado y comparado.');
  } finally {
    t.after(async () => {
      await runPostgresCleanup(t, [
        ...(restored ? [['close-pool', () => restored.end()]] : []),
        ...(db ? [['close-pool', async () => {
          await db.end();
          await runPostgresCleanup(t, [['restore-shared-pool', () => Object.assign(appPool, originalPool)]]);
        }]] : []),
        ['clean-temporary-directory', () => removeTemporaryPostgres(t, {
          config: database, dataDirectory: dataDir, root, prefix: 'cap-cpren127-',
          stop: started ? () => run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']) : null,
        })],
      ]);
      t.diagnostic('postgres-cleanup:complete');
    });
  }
});
