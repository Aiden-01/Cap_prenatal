const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');
const clinicalDateTypes = require('../src/db/clinicalDateTypes');
const express = require('express');
const { applyMigration } = require('../src/db/migrate');
const { pacienteUpdateSchema } = require('../src/validations/pacientes.schemas');
const { validateBody } = require('../src/middleware/validate');
const { verificarPermiso } = require('../src/middleware/permisos');
const { errorHandler } = require('../src/middleware/errorHandler');

test('CPREN-65: integridad y concurrencia HTTP en PostgreSQL temporal', {
  skip: process.env.RUN_PATIENT_VERSION_POSTGRES !== '1' && process.env.RUN_CLINICAL_DATE_POSTGRES !== '1', timeout: 90000,
}, async (t) => {
  // Nunca lee .env/DATABASE_URL ni acepta un servidor: crea su propio cluster.
  const bin = process.env.PATIENT_VERSION_POSTGRES_BIN;
  assert.ok(bin, 'Falta PATIENT_VERSION_POSTGRES_BIN');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-patient-version-'));
  const dataDir = path.join(root, 'data');
  const port = 55465;
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')),
    args, { stdio: 'ignore', timeout: 30000 });
  let started = false;
  let db;
  let appPool;
  let server;
  const poolPath = require.resolve('../src/db/pool');
  const previous = require.cache[poolPath];
  const configPath = require.resolve('../src/config/env');
  const previousConfig = require.cache[configPath];
  try {
    run('initdb', ['-D', dataDir, '-U', 'version_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', dataDir, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    const timezone = process.env.TZ || 'UTC';
    assert.ok(['UTC', 'America/Guatemala', 'Asia/Tokyo'].includes(timezone));
    // Startup options apply to EVERY connection, including replacements. Never
    // set session state through pool.query and assume another query reuses it.
    const fixtureConfig = { host: '127.0.0.1', port, user: 'version_test', database: 'postgres', max: 5,
      options: `-c TimeZone=${timezone}` };
    db = new Pool({ ...fixtureConfig, types: clinicalDateTypes });
    t.diagnostic(`PostgreSQL ${(await db.query('SHOW server_version')).rows[0].server_version}; cluster temporal 127.0.0.1:${port}`);
    const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
    const clinicalDatesOnly = process.env.RUN_CLINICAL_DATE_POSTGRES === '1';
    const fixtureSchema = schema.slice(0, schema.lastIndexOf('-- CPREN-65.'));
    // CPREN-67 uses a fresh fixture with version already defined: no migrator.
    await db.query(clinicalDatesOnly
      ? fixtureSchema.replace(/(CREATE TABLE IF NOT EXISTS pacientes\s*\()/i, '$1\n  version INTEGER NOT NULL DEFAULT 1,')
      : fixtureSchema);
    await db.query(`INSERT INTO roles(id,nombre) VALUES (73,'version_test');
      INSERT INTO usuarios(id,nombre_completo,username,password_hash,rol_id)
      VALUES (73,'Sintetico','version_test','no-login',73);
      INSERT INTO pacientes(id,no_expediente,nombres,apellidos,telefono,fur,fpp,fecha_nacimiento)
      VALUES (41,'SYN-VERSION','Sintetica','Prueba','00000000','2026-01-01','2026-10-08','1994-04-12');
      INSERT INTO embarazos(id,paciente_id,numero_embarazo,fur,fpp) VALUES (91,41,1,'2026-01-01','2026-10-08');`);
    const filename = '022_pacientes_version.sql';
    const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
    await t.test('migración sobre paciente existente y repetición registrada', { skip: clinicalDatesOnly }, async () => {
      const before = (await db.query('SELECT * FROM pacientes WHERE id=41')).rows[0];
      assert.equal(await applyMigration({ db, filename, sql }), true);
      assert.equal(await applyMigration({ db, filename, sql }), false);
      assert.deepEqual((await db.query('SELECT * FROM pacientes WHERE id=41')).rows[0], { ...before, version: 1 });
      const column = (await db.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_name='pacientes' AND column_name='version'")).rows[0];
      assert.deepEqual(column, { data_type: 'integer', is_nullable: 'NO', column_default: '1' });
      await assert.rejects(db.query('UPDATE pacientes SET version=NULL WHERE id=41'), { code: '23502' });
    });
    // Exercise the REAL application pool adapter. Only configuration is injected
    // so it cannot read .env or connect anywhere except our disposable cluster.
    require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: {
      ...previousConfig.exports,
      loadEnvironmentFile() {},
      nodeEnvForValidation() { return 'test'; },
      validateDatabaseConfig() { return fixtureConfig; },
    } };
    delete require.cache[poolPath];
    appPool = require('../src/db/pool');
    await t.test('pool real: cinco sesiones y reconexión con TZ garantizada; timestamps iguales a pg original', async () => {
      const sql = `SELECT pg_backend_pid() AS pid, current_setting('TimeZone') AS timezone,
        DATE '2024-02-29' AS civil, NULL::date AS empty_date,
        TIMESTAMP '2026-01-01 12:34:56.789' AS wall_time,
        TIMESTAMPTZ '2026-01-01 12:34:56.789+00' AS instant`;
      const control = new Pool({ ...fixtureConfig, max: 1 }); // Unmodified pg.
      const clients = await Promise.all(Array.from({ length: 5 }, () => appPool.connect()));
      let pids;
      try {
        const original = (await control.query(sql)).rows[0];
        const assertRow = row => {
          assert.equal(row.timezone, timezone);
          assert.equal(row.civil, '2024-02-29');
          assert.equal(row.empty_date, null);
          for (const key of ['wall_time', 'instant']) {
            assert.ok(row[key] instanceof Date);
            assert.ok(original[key] instanceof Date);
            assert.equal(row[key].getTime(), original[key].getTime());
            assert.equal(JSON.stringify(row[key]), JSON.stringify(original[key]));
          }
          assert.equal(row.instant.toISOString(), '2026-01-01T12:34:56.789Z');
          assert.equal(row.wall_time.getTime(), new Date('2026-01-01T12:34:56.789').getTime());
        };
        const rows = await Promise.all(clients.map(async client => (await client.query(sql)).rows[0]));
        pids = rows.map(row => row.pid);
        assert.equal(new Set(pids).size, 5, 'Deben ser cinco sesiones PostgreSQL distintas');
        rows.forEach(assertRow);
        // Release all five with destruction so the next query opens a new session.
        clients.splice(0).forEach(client => client.release(true));
        const fresh = (await appPool.query(sql)).rows[0];
        assert.ok(!pids.includes(fresh.pid));
        assertRow(fresh);
        t.diagnostic(`TZ Node/SQL=${timezone}; 5 sesiones + reconexión; TIMESTAMP=${fresh.wall_time.toISOString()}; TIMESTAMPTZ=${fresh.instant.toISOString()}`);
      } finally {
        clients.forEach(client => client.release());
        await control.end();
      }
    });
    const controller = require('../src/controllers/pacientesController');
    const repository = require('../src/repositories/pacientesRepository');
    const service = require('../src/services/pacientesService');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.usuario = { id: 73, permisos: req.headers['x-no-permission'] ? [] : ['pacientes.editar'] }; next();
    });
    app.get('/pacientes/:id', controller.obtener);
    app.get('/pacientes', controller.listar);
    app.get('/pacientes/:id/expediente', controller.expedienteCompleto);
    app.put('/pacientes/:id', verificarPermiso('pacientes.editar'), validateBody(pacienteUpdateSchema), controller.actualizar);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const request = async (body, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/pacientes/41`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const snapshot = async () => ({
      patient: (await db.query('SELECT * FROM pacientes WHERE id=41')).rows[0],
      pregnancy: (await db.query('SELECT * FROM embarazos WHERE id=91')).rows[0],
      audits: (await db.query('SELECT * FROM auditoria_eventos ORDER BY id')).rows,
    });
    await t.test('DATE PostgreSQL → API preserva día civil; fuentes y timestamps distintos', async () => {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      for (const date of ['2026-01-01', '2026-01-31', '2026-12-31', '2026-02-28', '2024-02-29', null]) {
        await db.query('UPDATE pacientes SET fur=$1,fpp=$1 WHERE id=41', [date]);
        await db.query('UPDATE embarazos SET fur=$1,fpp=$1 WHERE id=91', [date]);
        // HTTP controllers use appPool, whose connections all have startup TZ.
        const patient = await (await fetch(`${baseUrl}/pacientes/41`)).json();
        const list = await (await fetch(`${baseUrl}/pacientes`)).json();
        const file = await (await fetch(`${baseUrl}/pacientes/41/expediente`)).json();
        assert.deepEqual([patient.fur, patient.fpp, list.data[0].embarazo_fur, list.data[0].embarazo_fpp,
          file.paciente.fur, file.embarazo_seleccionado.fur, file.embarazo_seleccionado.fpp], Array(7).fill(date));
        assert.match(list.data[0].created_at, /T\d{2}:\d{2}:\d{2}/);
      }
      // Different sources represent different pregnancies, never a timezone fix.
      await db.query("UPDATE pacientes SET fur='2026-01-01',fpp='2026-10-08' WHERE id=41");
      await db.query("UPDATE embarazos SET fur='2026-02-01',fpp='2026-11-08' WHERE id=91");
      const list = await (await fetch(`${baseUrl}/pacientes`)).json();
      const file = await (await fetch(`${baseUrl}/pacientes/41/expediente`)).json();
      assert.equal(list.data[0].fur, '2026-01-01');
      assert.equal(list.data[0].embarazo_fur, '2026-02-01');
      assert.equal(file.embarazo_seleccionado.fur, '2026-02-01');
      await db.query("UPDATE embarazos SET fur='2026-01-01',fpp='2026-10-08' WHERE id=91");
      const leap = (await db.query("SELECT DATE '2024-02-29' + 280 AS fpp, DATE '2024-03-01' - DATE '2024-02-28' AS days")).rows[0];
      assert.deepEqual(leap, { fpp: '2024-12-05', days: 2 });
      const { createReportesRepository } = require('../src/repositories/reportesRepository');
      await db.query("UPDATE embarazos SET fur='2024-02-28',fpp='2024-12-04' WHERE id=91");
      await db.query("INSERT INTO controles_prenatales(paciente_id,embarazo_id,numero_control,fecha) VALUES(41,91,1,'2024-03-01')");
      const report = await createReportesRepository(db).obtenerRowsCensoPrimerControl('2024-03-01', '2024-03-01');
      assert.deepEqual([report[0].fur, report[0].fpp, report[0].fecha_primer_control, report[0].semanas_gestacion],
        ['2024-02-28', '2024-12-04', '2024-03-01', 0]);
      await db.query('DELETE FROM controles_prenatales WHERE paciente_id=41');
      await db.query("UPDATE embarazos SET fur='2026-01-01',fpp='2026-10-08' WHERE id=91");
    });
    await t.test('GET expone versión; PUT válido incrementa y atribuye auditoría', async () => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/pacientes/41`);
      assert.equal((await response.json()).version, 1);
      assert.deepEqual(await request({ version: 1, telefono: '11111111' }), { status: 200, body: { message: 'Paciente actualizado', version: 2 } });
      const state = await snapshot();
      assert.equal(state.patient.version, 2);
      assert.equal(state.patient.updated_by, 73);
      assert.ok(state.patient.updated_at);
      assert.equal(state.audits.length, 1);
      assert.equal(state.audits[0].usuario_id, 73);
      assert.equal(state.audits[0].accion, 'actualizar');
      assert.equal(state.audits[0].datos_nuevos.resultado, 'exitoso');
    });
    await t.test('versión obsoleta con FUR/FPP no cambia ningún campo ni auditoría', async () => {
      const before = await snapshot();
      const result = await request({ version: 1, telefono: '22222222', fur: '2026-02-01', fpp: '2026-11-08' });
      assert.equal(result.status, 409);
      assert.equal(result.body.code, 'PATIENT_VERSION_CONFLICT');
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('dos conexiones con la misma versión: la segunda espera FOR UPDATE y se rechaza', async () => {
      const original = repository.actualizarPaciente;
      let locked;
      const hasLock = new Promise(resolve => { locked = resolve; });
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      repository.actualizarPaciente = async (...args) => { locked(); await gate; return original(...args); };
      try {
        const first = request({ version: 2, telefono: '33333333' });
        await hasLock;
        const second = request({ version: 2, telefono: '44444444' });
        // Esperar evidencia real del bloqueo de la segunda conexión.
        let waiting = false;
        for (let i = 0; i < 100; i += 1) {
          waiting = (await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT * FROM pacientes%FOR UPDATE'")).rowCount > 0;
          if (waiting) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(waiting, 'La segunda conexión debe esperar el bloqueo de fila');
        release();
        const results = await Promise.all([first, second]);
        assert.equal(results[0].status, 200);
        assert.equal(results[1].status, 409);
        assert.equal(results[1].body.code, 'PATIENT_VERSION_CONFLICT');
        const state = await snapshot();
        assert.equal(state.patient.telefono, '33333333');
        assert.equal(state.patient.version, 3);
        assert.equal(state.audits.length, 2);
      } finally { release(); repository.actualizarPaciente = original; }
    });
    await t.test('sin cambios efectivos (incluye DATE y null/blank) conserva fila y auditoría', async () => {
      const before = await snapshot();
      assert.equal((await request({ version: 3, telefono: '33333333', fur: '2026-01-01', fpp: '2026-10-08', fecha_nacimiento: '1994-04-12', domicilio: '' })).status, 200);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await request({ version: 3 })).status, 200);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('FUR/FPP válido sincroniza ambas filas; vaciado explícito mantiene integridad', async () => {
      assert.equal((await request({ version: 3, fur: '2026-02-01', fpp: '2026-11-08' })).status, 200);
      let state = await snapshot();
      assert.equal(state.patient.version, 4);
      assert.deepEqual([state.patient.fur, state.patient.fpp], [state.pregnancy.fur, state.pregnancy.fpp]);
      assert.deepEqual([state.patient.fur, state.patient.fpp], ['2026-02-01', '2026-11-08']);
      const reloaded = await (await fetch(`http://127.0.0.1:${server.address().port}/pacientes/41`)).json();
      assert.deepEqual([reloaded.fur, reloaded.fpp, reloaded.version], ['2026-02-01', '2026-11-08', 4]);
      assert.equal(state.audits.length, 4);
      assert.equal((await request({ version: 4, fur: null, fpp: null })).status, 200);
      state = await snapshot();
      assert.equal(state.patient.version, 5);
      assert.deepEqual([state.patient.fur, state.patient.fpp, state.pregnancy.fur, state.pregnancy.fpp], [null, null, null, null]);
    });
    await t.test('fallo de segunda auditoría revierte paciente, embarazo, versión y primera auditoría', async () => {
      const before = await snapshot();
      await db.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.entidad_afectada='embarazo' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_test_audit BEFORE INSERT ON auditoria_eventos FOR EACH ROW EXECUTE FUNCTION reject_test_audit();`);
      try { assert.equal((await request({ version: 5, fur: '2026-03-01', fpp: '2026-12-06' })).status, 500); }
      finally { await db.query('DROP TRIGGER reject_test_audit ON auditoria_eventos; DROP FUNCTION reject_test_audit()'); }
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('permisos, versión requerida y validación clínica no escriben', async () => {
      const before = await snapshot();
      assert.equal((await request({ version: 5, telefono: '55555555' }, { 'x-no-permission': '1' })).status, 403);
      for (const version of [undefined, null, '5', 0, -1, 1.5, 2147483648]) {
        const result = await request({ version, telefono: '55555555' });
        assert.equal(result.status, 400);
        assert.equal(result.body.code, 'VALIDATION_ERROR');
      }
      assert.equal((await request({ version: 5, cui: '123' })).status, 400);
      assert.equal((await request({ version: 5, distrito: 'Inventado' })).status, 400);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('nuevo embarazo invalida formularios previamente abiertos', async () => {
      await db.query("UPDATE embarazos SET estado='cerrado' WHERE id=91");
      await service.nuevoEmbarazo({ id: 41, body: { fur: '2026-03-01' }, req: { usuario: { id: 73 } } });
      const before = await snapshot();
      assert.equal(before.patient.version, 6);
      assert.equal((await request({ version: 5, fur: '2026-01-01' })).body.code, 'PATIENT_VERSION_CONFLICT');
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('sincronización de embarazo sin diferencia en paciente conserva versión y metadata', async () => {
      await db.query("UPDATE embarazos SET estado='cerrado' WHERE paciente_id=41");
      const before = (await snapshot()).patient;
      await service.nuevoEmbarazo({ id: 41, body: { fur: '2026-03-01' }, req: { usuario: { id: 73 } } });
      assert.deepEqual((await snapshot()).patient, before);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (appPool) await appPool.end();
    if (previous) require.cache[poolPath] = previous; else delete require.cache[poolPath];
    if (previousConfig) require.cache[configPath] = previousConfig; else delete require.cache[configPath];
    if (db) await db.end();
    if (started) run('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
    // root proviene exclusivamente de mkdtemp, nunca de configuración del usuario.
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('cap-patient-version-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
