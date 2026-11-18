const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { prepararCapturaControl } = require('../src/utils/controlPrenatalCapture');
const repository = require('../src/repositories/controlesPrenatalesRepository');

test('PostgreSQL local032: captura, snapshot histórico, legado y FK sin mutaciones persistentes', { skip: process.env.RUN_CONTROL_CAPTURE_LOCAL !== '1' }, async () => {
  const ec = require('../src/config/env'); ec.loadEnvironmentFile();
  const app = ec.validateAppConfig(process.env);
  const config = ec.validateDatabaseConfig(process.env, { nodeEnv: app.nodeEnv });
  assert.equal(app.nodeEnv, 'development'); assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.host));
  const db = new Client(config); await db.connect();
  try {
    await db.query('BEGIN');
    const key = crypto.randomBytes(5).toString('hex');
    const paciente = (await db.query("INSERT INTO pacientes(no_expediente,nombres,apellidos) VALUES($1,'Paciente sintética','Captura032') RETURNING id", ['SYN32-' + key])).rows[0];
    const embarazo = (await db.query("INSERT INTO embarazos(paciente_id,numero_embarazo,estado) VALUES($1,1,'activo') RETURNING id", [paciente.id])).rows[0];
    const cargo = (await db.query('INSERT INTO cargos_personal(codigo,nombre) VALUES($1,$2) RETURNING *', ['SYN32-' + key, 'Cargo sintético032 ' + key])).rows[0];
    const legacy = (await db.query("INSERT INTO controles_prenatales(paciente_id,embarazo_id,numero_control,fecha,nombre_cargo_atiende,situacion_fetal,presentacion_fetal) VALUES($1,$2,1,CURRENT_DATE,'Texto legado sin inferir','Situación antigua','Funicular') RETURNING *", [paciente.id, embarazo.id])).rows[0];
    assert.equal(legacy.nombre_atiende, null); assert.equal(legacy.cargo_atiende_snapshot, null); assert.equal(legacy.cargo_atiende_id, null);
    const capture = await prepararCapturaControl({ body: { nombre_atiende: 'Nombre libre sintético', cargo_atiende_id: cargo.id }, before: legacy, db, obtenerCargo: repository.obtenerCargoAtiende });
    assert.equal(capture.presentacion_fetal, 'Funicular');
    let updated = await repository.actualizar({ id: legacy.id, embarazoId: embarazo.id, pacienteId: paciente.id, updatedBy: null,
      data: capture, campos: ['nombre_atiende','cargo_atiende_id','cargo_atiende_snapshot'] }, db);
    assert.equal(updated.nombre_cargo_atiende, legacy.nombre_cargo_atiende);
    assert.equal(updated.situacion_fetal, legacy.situacion_fetal); assert.equal(updated.presentacion_fetal, 'Funicular');
    assert.deepEqual(updated.cargo_atiende_snapshot, { id: cargo.id, nombre: cargo.nombre, codigo: cargo.codigo });
    await db.query("UPDATE cargos_personal SET nombre=$1,activo=FALSE WHERE id=$2", ['Cargo renombrado ' + key, cargo.id]);
    const preserved = await prepararCapturaControl({ body: { cargo_atiende_id: cargo.id }, before: updated, db, obtenerCargo: repository.obtenerCargoAtiende });
    assert.deepEqual(preserved.cargo_atiende_snapshot, updated.cargo_atiende_snapshot);
    await assert.rejects(prepararCapturaControl({ body: { cargo_atiende_id: cargo.id }, db, obtenerCargo: repository.obtenerCargoAtiende }), error => error.status === 400);
    await db.query('SAVEPOINT invalid_snapshot');
    await assert.rejects(db.query('UPDATE controles_prenatales SET cargo_atiende_snapshot=$1 WHERE id=$2', [JSON.stringify({id: cargo.id, nombre: 'Cargo', codigo: 'AE', usuario_id: 1}), legacy.id]), error => error.code === '23514');
    await db.query('ROLLBACK TO SAVEPOINT invalid_snapshot');
    await db.query('SAVEPOINT referenced_catalog');
    await assert.rejects(db.query('DELETE FROM cargos_personal WHERE id=$1', [cargo.id]), error => ['23001', '23503'].includes(error.code) && error.constraint === 'controles_prenatales_cargo_atiende_id_fkey');
    await db.query('ROLLBACK TO SAVEPOINT referenced_catalog');
    const cleared = await prepararCapturaControl({ body: { cargo_atiende_id: null, situacion_fetal: null, presentacion_fetal: null }, before: updated, db });
    updated = await repository.actualizar({ id: legacy.id, embarazoId: embarazo.id, pacienteId: paciente.id,
      data: cleared, campos: ['cargo_atiende_id','cargo_atiende_snapshot','situacion_fetal','presentacion_fetal'] }, db);
    assert.equal(updated.cargo_atiende_id, null); assert.equal(updated.cargo_atiende_snapshot, null);
    assert.equal(updated.presentacion_fetal, null); assert.equal(updated.nombre_cargo_atiende, legacy.nombre_cargo_atiende);
    // Run the actual service with a transaction-bound repository. No commits,
    // stubs of clinical validation or application-source overrides are needed.
    await db.query('UPDATE cargos_personal SET activo=TRUE WHERE id=$1', [cargo.id]);
    const actor = (await db.query("INSERT INTO usuarios(nombre_completo,username,password_hash,rol_id) VALUES('Actor sintético032',$1,'synthetic-no-login',(SELECT id FROM roles WHERE nombre='personal_salud')) RETURNING id", ['syn-control-' + key])).rows[0];
    const req = { usuario: { id: actor.id, rol: 'personal_salud', permisos: ['pacientes.ver','controles.crear','controles.editar'] }, ip: '127.0.0.1', headers: { 'user-agent': 'synthetic-local-test' } };
    const service = require('../src/services/controlesPrenatalesService');
    const originalTransaction = repository.enTransaccion;
    repository.enTransaccion = operation => operation(db);
    try {
      const body = { numero_control: 2, fecha: '2026-06-15', nombre_atiende: 'Persona declarada sintética', cargo_atiende_id: cargo.id, situacion_fetal: 'Longitudinal', presentacion_fetal: 'Cefálica' };
      const created = await service.crearControl({ pacienteId: paciente.id, embarazoId: embarazo.id, body, req });
      assert.equal(created.nombre_atiende, body.nombre_atiende); assert.equal(created.cargo_atiende_id, cargo.id);
      assert.equal(created.cargo_atiende_snapshot.nombre, 'Cargo renombrado ' + key);
      const retried = await service.crearControl({ pacienteId: paciente.id, embarazoId: embarazo.id, body: { numero_control: 2, fecha: body.fecha, motivo_consulta: 'Reintento sintético' }, req });
      assert.equal(retried.id, created.id); assert.equal(retried.nombre_atiende, created.nombre_atiende);
      assert.deepEqual(retried.cargo_atiende_snapshot, created.cargo_atiende_snapshot); assert.equal(retried.presentacion_fetal, 'Cefálica');
      const edited = await service.actualizarControl({ pacienteId: paciente.id, embarazoId: embarazo.id, id: created.id, body: { nombre_atiende: 'Corrección declarada' }, req });
      assert.equal(edited.nombre_atiende, 'Corrección declarada'); assert.deepEqual(edited.cargo_atiende_snapshot, created.cargo_atiende_snapshot);
      await assert.rejects(service.actualizarControl({ pacienteId: paciente.id, embarazoId: embarazo.id, id: created.id, body: { presentacion_fetal: 'Funicular' }, req }), error => error.status === 400);
      await db.query('UPDATE cargos_personal SET activo=FALSE WHERE id=$1', [cargo.id]);
      await assert.rejects(service.crearControl({ pacienteId: paciente.id, embarazoId: embarazo.id, body: { ...body, numero_control: 3 }, req }), error => error.status === 400);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM controles_prenatales WHERE embarazo_id=$1', [embarazo.id])).rows[0].n, 2);
    } finally { repository.enTransaccion = originalTransaction; }

  } finally { await db.query('ROLLBACK'); await db.end(); }
});
