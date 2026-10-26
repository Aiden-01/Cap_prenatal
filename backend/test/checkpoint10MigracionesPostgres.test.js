const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');
const { applyMigration, migrate } = require('../src/db/migrate');
const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');

test('CHECKPOINT-11: upgrade 027→030 y esquema final en PostgreSQL desechable', {
  skip: process.env.RUN_CHECKPOINT10_TEMP_POSTGRES !== '1', timeout: 120000,
}, async t => {
  // Destino creado aquí, jamás .env, DATABASE_URL ni un servidor existente.
  const bin = process.env.CHECKPOINT10_POSTGRES_BIN;
  assert.ok(bin, 'Falta CHECKPOINT10_POSTGRES_BIN');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-checkpoint10-'));
  const data = path.join(root, 'data');
  const config = { host: '127.0.0.1', port: 55480, user: 'checkpoint10_test', database: 'postgres',
    password: '', ssl: false, connectionTimeoutMillis: 3000, max: 8 };
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')),
    args, { windowsHide: true, stdio: 'ignore', timeout: 30000 });
  const migration = filename => fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
  let started = false, db;
  try {
    run('initdb', ['-D', data, '-U', config.user, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55480', '-w', 'start']);
    started = true; db = new Pool(config);
    assert.equal(path.resolve((await db.query('SHOW data_directory')).rows[0].data_directory), path.resolve(data));
    t.diagnostic(`PostgreSQL ${(await db.query('SHOW server_version')).rows[0].server_version}; clúster propio 55480`);
    const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
    await db.query(schema.slice(0, schema.indexOf('-- CPREN-115:')));
    for (const filename of ['023_catalogos_profesionales.sql', '024_usuarios_perfiles_profesionales.sql',
      '025_permisos_autoria_clinica.sql', '026_notas_clinicas.sql', '027_seguimiento_notas_controles.sql']) {
      await applyMigration({ db, filename, sql: migration(filename) });
    }
    await db.query(`INSERT INTO roles(id,nombre) VALUES(1,'director');
      INSERT INTO especialidades_personal(id,nombre) VALUES(1,'Histórico sintético');
      INSERT INTO usuarios(id,nombre_completo,username,password_hash,rol_id,cargo_id,especialidad_id)
        VALUES(1,'Profesional sintético','legacy_fixture','synthetic-no-login',1,3,1);
      UPDATE cargos_personal SET clasificacion_profesional='medico' WHERE id=3;
      INSERT INTO pacientes(id,no_expediente,nombres,apellidos,registrado_por)
        VALUES(1,'SYN-CP10','Sintética','Prueba',1);`);
    const historical = { tipo: 'usuario', usuario_id: 1, nombre_completo: 'Profesional sintético',
      cargo_id: 3, cargo_nombre: 'Médico/a', clasificacion_profesional: 'medico',
      especialidad_id: 1, especialidad_nombre: 'Histórico sintético' };
    const current = Object.fromEntries(Object.entries(historical).filter(([key]) => !key.startsWith('especialidad')));
    await db.query(`INSERT INTO embarazos(id,paciente_id,numero_embarazo,estado) VALUES(1,1,1,'activo');
      INSERT INTO controles_prenatales(id,paciente_id,embarazo_id,numero_control,fecha) VALUES(1,1,1,1,CURRENT_DATE)`);
    await db.query(`INSERT INTO controles_notas_requeridas(control_prenatal_id,tipo,responsable_snapshot,confirmado_por)
        VALUES(1,'nota_evolucion',$1,1)`, [historical]);
    const confirmationsBefore = (await db.query('SELECT * FROM controles_notas_requeridas ORDER BY control_prenatal_id,tipo')).rows;
    const permissionsBefore = (await db.query('SELECT * FROM usuario_permisos ORDER BY id')).rows;
    for (const finalized of [false, true]) {
      await db.query(`INSERT INTO notas_clinicas(paciente_id,tipo,contenido,fecha_atencion,hora_atencion,
        responsable_usuario_id,responsable_snapshot,capturista_usuario_id,estado,finalizador_usuario_id,
        finalizada_at,clave_idempotencia,solicitud_hash)
        VALUES(1,'nota_evolucion','Narrativa sintética','2026-10-20','10:00',1,$1,1,$2,$3,$4,$5,$6)`,
      [historical, finalized ? 'captura_finalizada' : 'borrador', finalized ? 1 : null,
        finalized ? new Date() : null, require('node:crypto').randomUUID(), 'a'.repeat(64)]);
    }
    const before = (await db.query('SELECT * FROM notas_clinicas ORDER BY id')).rows;
    const credentials = (await db.query('SELECT password_hash,rol_id,activo FROM usuarios WHERE id=1')).rows[0];

    await t.test('028 detecta dependencias desconocidas y revierte sin CASCADE', async () => {
      await db.query('CREATE TABLE dependencia_sintetica(id INTEGER REFERENCES especialidades_personal(id))');
      await assert.rejects(applyMigration({ db, filename: '028_retirar_especialidades.sql',
        sql: migration('028_retirar_especialidades.sql') }), { code: '2BP01' });
      assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='usuarios' AND column_name='especialidad_id'")).rows[0].n, 1);
      await db.query('DROP TABLE dependencia_sintetica');
    });
    await t.test('028 retira tabla/columna/índices/FK y conserva snapshots íntegros sin reescribir historial', async () => {
      const filename = '028_retirar_especialidades.sql';
      assert.equal(await applyMigration({ db, filename, sql: migration(filename) }), true);
      assert.equal(await applyMigration({ db, filename, sql: migration(filename) }), false);
      assert.deepEqual((await db.query('SELECT * FROM notas_clinicas ORDER BY id')).rows, before);
      assert.equal((await db.query("SELECT to_regclass('public.especialidades_personal') tabla, to_regclass('public.idx_usuarios_especialidad') indice")).rows[0].tabla, null);
      assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='usuarios' AND column_name='especialidad_id'")).rows[0].n, 0);
      assert.deepEqual((await db.query('SELECT password_hash,rol_id,activo FROM usuarios WHERE id=1')).rows[0], credentials);
      await db.query("UPDATE notas_clinicas SET contenido='Texto sintético editado', version=version+1 WHERE id=1");
      await db.query("UPDATE notas_clinicas SET estado='captura_finalizada',finalizador_usuario_id=1,finalizada_at=NOW(),version=version+1 WHERE id=1");
      assert.deepEqual((await db.query('SELECT responsable_snapshot FROM notas_clinicas WHERE id=1')).rows[0].responsable_snapshot, historical);
      await assert.rejects(db.query('UPDATE notas_clinicas SET responsable_snapshot=$1,version=version+1 WHERE id=2', [current]), { code: '23514' });
    });
    await t.test('snapshot nuevo exige solo identidad, cargo y clasificación; nunca admite extras nuevos', async () => {
      const insert = snapshot => db.query(`INSERT INTO notas_clinicas(paciente_id,tipo,responsable_usuario_id,
        responsable_snapshot,capturista_usuario_id,clave_idempotencia,solicitud_hash)
        VALUES(1,'nota_evolucion',1,$1,1,$2,$3) RETURNING id`,
      [snapshot, require('node:crypto').randomUUID(), 'b'.repeat(64)]);
      await assert.rejects(insert(historical), { code: '23514' });
      await assert.rejects(insert({ ...current, cargo_nombre: null }), { code: '23514' });
      await assert.rejects(insert({ ...current, usuario_id: 2 }), { code: '23514' });
      const created = await insert(current); assert.equal(created.rowCount, 1);
    });
    await t.test('029 normaliza, admite legados NULL y garantiza formato, longitud y unicidad concurrente', async () => {
      const filename = '029_usuarios_email.sql';
      assert.equal(await applyMigration({ db, filename, sql: migration(filename) }), true);
      assert.equal(await applyMigration({ db, filename, sql: migration(filename) }), false);
      assert.equal((await db.query('SELECT email FROM usuarios WHERE id=1')).rows[0].email, null);
      assert.deepEqual((await db.query('SELECT password_hash,rol_id,activo FROM usuarios WHERE id=1')).rows[0], credentials);
      await db.query("UPDATE usuarios SET email='  PERSONA@EXAMPLE.TEST  ' WHERE id=1");
      assert.equal((await db.query('SELECT email FROM usuarios WHERE id=1')).rows[0].email, 'persona@example.test');
      for (const email of ['', '  ', 'sin-arroba', 'a@b', 'a b@example.test']) {
        await assert.rejects(db.query('UPDATE usuarios SET email=$1 WHERE id=1', [email]), { code: '23514' });
      }
      await assert.rejects(db.query('UPDATE usuarios SET email=$1 WHERE id=1', ['a'.repeat(250) + '@example.test']), { code: '22001' });
      const insert = (id, email) => db.query(`INSERT INTO usuarios(id,nombre_completo,username,password_hash,rol_id,email)
        VALUES($1,'Sintético',$2,'synthetic-no-login',1,$3)`, [id, `mail_fixture_${id}`, email]);
      const results = await Promise.allSettled([insert(2, 'RACE@EXAMPLE.TEST'), insert(3, 'race@example.test')]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const failure = results.find(result => result.status === 'rejected').reason;
      assert.equal(failure.code, '23505'); assert.equal(failure.constraint, 'ux_usuarios_email');
      await insert(4, null); await insert(5, null);
    });
    await t.test('CHECKPOINT-11: 029→030 elimina clasificación, no asigna códigos y preserva historia',async()=>{
      const filename='030_cargos_autoria_estable.sql';
      // Simula un catálogo inconsistente preexistente; nunca cambia una base persistente.
      await db.query('DROP INDEX ux_cargos_personal_codigo');
      await db.query(`INSERT INTO cargos_personal(nombre,codigo,clasificacion_profesional) VALUES('Duplicado sintético',' ae ','enfermeria_ae')`);
      await assert.rejects(applyMigration({db,filename,sql:migration(filename)}),/duplicados/);
      assert.equal((await db.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cargos_personal' AND column_name='clasificacion_profesional'`)).rows[0].n,1);
      await db.query(`DELETE FROM cargos_personal WHERE nombre='Duplicado sintético';
        CREATE UNIQUE INDEX ux_cargos_personal_codigo ON cargos_personal(catalogo_personal_clave(codigo)) WHERE codigo IS NOT NULL`);
      await db.query(`INSERT INTO cargos_personal(nombre,codigo,clasificacion_profesional) VALUES('Contradicción sintética','MED','no_clinico')`);
      await assert.rejects(applyMigration({db,filename,sql:migration(filename)}),/contradictorio/);
      assert.equal((await db.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cargos_personal' AND column_name='clasificacion_profesional'`)).rows[0].n,1);
      await db.query(`DELETE FROM cargos_personal WHERE codigo='MED'`);
      const cargosBefore=(await db.query('SELECT id,codigo,nombre,activo FROM cargos_personal ORDER BY id')).rows;
      const legacy=(await db.query(`INSERT INTO notas_clinicas(paciente_id,tipo,responsable_usuario_id,responsable_snapshot,capturista_usuario_id,clave_idempotencia,solicitud_hash)
        VALUES(1,'nota_evolucion',1,$1,1,$2,$3) RETURNING id`,[current,require('node:crypto').randomUUID(),'c'.repeat(64)])).rows[0].id;
      const notesBefore030 = (await db.query('SELECT * FROM notas_clinicas ORDER BY id')).rows;
      assert.equal(await applyMigration({db,filename,sql:migration(filename)}),true);
      assert.equal(await applyMigration({db,filename,sql:migration(filename)}),false);
      const repeatClient = await db.connect();
      try {
        await repeatClient.query('BEGIN'); await repeatClient.query(migration(filename)); await repeatClient.query('COMMIT');
      } catch (error) { await repeatClient.query('ROLLBACK'); throw error; }
      finally { repeatClient.release(); }
      assert.equal((await db.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cargos_personal' AND column_name='clasificacion_profesional'`)).rows[0].n,0);
      assert.deepEqual((await db.query('SELECT id,codigo,nombre,activo FROM cargos_personal ORDER BY id')).rows,cargosBefore);
      assert.deepEqual((await db.query('SELECT * FROM notas_clinicas ORDER BY id')).rows,notesBefore030);
      assert.deepEqual((await db.query('SELECT * FROM usuario_permisos ORDER BY id')).rows,permissionsBefore);
      assert.deepEqual((await db.query('SELECT * FROM controles_notas_requeridas ORDER BY control_prenatal_id,tipo')).rows,confirmationsBefore);
      await assert.rejects(db.query(`INSERT INTO cargos_personal(nombre,codigo) VALUES('Duplicado posterior',' ae ')`),{code:'23505'});
      await assert.rejects(db.query('DELETE FROM cargos_personal WHERE id=3'), error => ['23503', '23001'].includes(error.code));
      await assert.rejects(db.query('UPDATE controles_notas_requeridas SET responsable_snapshot=responsable_snapshot WHERE control_prenatal_id=1'),{code:'23514'});
      await db.query(`UPDATE notas_clinicas SET contenido='Historia preservada',fecha_atencion='2026-10-23',hora_atencion='09:30',version=version+1 WHERE id=$1`,[legacy]);
      await db.query(`UPDATE notas_clinicas SET estado='captura_finalizada',finalizador_usuario_id=1,finalizada_at=NOW(),version=version+1 WHERE id=$1`,[legacy]);
      assert.deepEqual((await db.query('SELECT responsable_snapshot FROM notas_clinicas WHERE id=$1',[legacy])).rows[0].responsable_snapshot,current);
      const snapshot={...current,cargo_codigo:'MED'};delete snapshot.clasificacion_profesional;
      const insert=body=>db.query(`INSERT INTO notas_clinicas(paciente_id,tipo,responsable_usuario_id,responsable_snapshot,capturista_usuario_id,clave_idempotencia,solicitud_hash)
        VALUES(1,'nota_evolucion',1,$1,1,$2,$3)`,[body,require('node:crypto').randomUUID(),'d'.repeat(64)]);
      await insert(snapshot);await assert.rejects(insert(current),{code:'23514'});await assert.rejects(insert({...snapshot,cargo_codigo:'AE'}),{code:'23514'});
    });
    await t.test('instalación oficial vacía, reejecución y checksums de todas las migraciones', async () => {
      await db.query('CREATE DATABASE checkpoint10_bootstrap');
      for (let i = 0; i < 2; i++) {
        const result = await migrate({ db: new Pool({ ...config, database: 'checkpoint10_bootstrap' }),
          logger: { log() {}, error() {} }, setExitCode() {} });
        assert.equal(result.ok, true, result.error?.message);
      }
      const fresh = new Pool({ ...config, database: 'checkpoint10_bootstrap' });
      try {
        await assertSchemaCompatible(fresh);
        assert.equal((await fresh.query("SELECT to_regclass('public.especialidades_personal') tabla")).rows[0].tabla, null);
        assert.equal((await fresh.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='usuarios' AND column_name='especialidad_id'")).rows[0].n, 0);
        assert.equal((await fresh.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cargos_personal' AND column_name='clasificacion_profesional'")).rows[0].n, 0);
      } finally { await fresh.end(); }
    });
  } finally {
    if (db) await db.end();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
