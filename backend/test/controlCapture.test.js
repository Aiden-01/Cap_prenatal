const test = require('node:test');
const assert = require('node:assert/strict');
const { prepararCapturaControl, SITUACIONES_FETALES, PRESENTACIONES_FETALES } = require('../src/utils/controlPrenatalCapture');
const { controlCreateSchema, controlUpdateSchema } = require('../src/validations/controles.schemas');
const { buildAuditDiff } = require('../src/services/audit/auditDiffBuilder');

test('captura separada valida nombre y cargo real, conserva el texto legado sin inferencias', async () => {
  const before = { nombre_cargo_atiende: 'Texto histórico sin identificar' };
  const omitted = await prepararCapturaControl({ body: {}, before, obtenerCargo: () => assert.fail('No inferir catálogo') });
  assert.equal(omitted.nombre_atiende, null); assert.equal(omitted.cargo_atiende_id, null);
  assert.equal(omitted.nombre_cargo_atiende, before.nombre_cargo_atiende);
  for (const codigo of ['MED', 'AE', 'EP', null]) {
    const cargo = { id: 9, codigo, nombre: 'Cargo sintético', activo: true };
    const result = await prepararCapturaControl({ body: { nombre_atiende: ' Nombre libre ', cargo_atiende_id: '9' }, obtenerCargo: async id => { assert.equal(id, 9); return cargo; } });
    assert.equal(result.nombre_atiende, 'Nombre libre');
    assert.deepEqual(result.cargo_atiende_snapshot, { id: 9, nombre: cargo.nombre, codigo });
    assert.ok(!Object.hasOwn(result, 'usuario_id'));
  }
});
test('snapshot anterior sobrevive renombre/inactivación y PATCH omitido; null desvincula explícitamente', async () => {
  const before = { nombre_atiende: 'Declarado', cargo_atiende_id: 9, cargo_atiende_snapshot: { id: 9, nombre: 'Cargo histórico', codigo: 'AE' } };
  for (const body of [{}, { cargo_atiende_id: 9 }]) {
    const result = await prepararCapturaControl({ body, before, obtenerCargo: () => assert.fail('No refrescar historia desde catálogo vigente') });
    assert.deepEqual(result.cargo_atiende_snapshot, before.cargo_atiende_snapshot);
    assert.equal(result.nombre_atiende, before.nombre_atiende);
  }
  const cleared = await prepararCapturaControl({ body: { cargo_atiende_id: null }, before });
  assert.equal(cleared.cargo_atiende_id, null); assert.equal(cleared.cargo_atiende_snapshot, null);
});
test('rechaza cargo inexistente/inactivo, ID mal formado y snapshot enviado por cliente', async () => {
  for (const cargo of [null, { id: 1, activo: false }]) await assert.rejects(prepararCapturaControl({ body: { cargo_atiende_id: 1 }, obtenerCargo: async () => cargo }), error => error.status === 400);
  for (const id of [true, false, -1, '1.2', '1x', 2147483648]) {
    assert.equal(controlUpdateSchema.safeParse({ cargo_atiende_id: id }).success, false);
    await assert.rejects(prepararCapturaControl({ body: { cargo_atiende_id: id } }), error => error.status === 400);
  }
  assert.equal(controlUpdateSchema.safeParse({ cargo_atiende_snapshot: {} }).success, false);
  await assert.rejects(prepararCapturaControl({ body: { cargo_atiende_snapshot: {} } }), error => error.status === 400);
  assert.equal(controlCreateSchema.safeParse({ numero_control: 1, fecha: '2026-06-15', nombre_atiende: 'n'.repeat(151) }).success, false);
});
test('opciones fetales canónicas y campos sin evaluar se aceptan; nuevos textos arbitrarios se rechazan', async () => {
  for (const value of [...SITUACIONES_FETALES, null, '']) await prepararCapturaControl({ body: { situacion_fetal: value } });
  for (const value of [...PRESENTACIONES_FETALES, null, '']) await prepararCapturaControl({ body: { presentacion_fetal: value } });
  assert.ok(!PRESENTACIONES_FETALES.includes('Funicular'));
  for (const field of ['situacion_fetal', 'presentacion_fetal']) await assert.rejects(prepararCapturaControl({ body: { [field]: 'valor no admitido' } }), error => error.status === 400);
  await assert.rejects(prepararCapturaControl({ body: { presentacion_fetal: 'Funicular' } }), error => error.status === 400);
});
test('valores fetales históricos no estándar sobreviven omisión/reenvío idéntico pero no se propagan a nuevos controles', async () => {
  const before = { situacion_fetal: 'Situación antigua', presentacion_fetal: 'Funicular' };
  for (const body of [{}, { situacion_fetal: before.situacion_fetal, presentacion_fetal: before.presentacion_fetal }]) {
    const result = await prepararCapturaControl({ body, before }); assert.equal(result.situacion_fetal, before.situacion_fetal); assert.equal(result.presentacion_fetal, before.presentacion_fetal);
  }
  await assert.rejects(prepararCapturaControl({ body: { situacion_fetal: before.situacion_fetal } }), error => error.status === 400);
  const cleared = await prepararCapturaControl({ body: { situacion_fetal: null, presentacion_fetal: '' }, before });
  assert.equal(cleared.situacion_fetal, null); assert.equal(cleared.presentacion_fetal, null);
});
test('auditoría no expone nombre declarado ni snapshot profesional', () => {
  const diff = buildAuditDiff({}, { nombre_atiende: 'NOMBRE_SINTETICO_PRIVADO', cargo_atiende_snapshot: { id: 9, nombre: 'CARGO_SINTETICO_PRIVADO', codigo: 'AE' }, cargo_atiende_id: 9 }, { context: { categoria: 'clinica', entidad: 'control_prenatal', evento: 'actualizar' } });
  const text = JSON.stringify(diff);
  assert.ok(!text.includes('NOMBRE_SINTETICO_PRIVADO')); assert.ok(!text.includes('CARGO_SINTETICO_PRIVADO'));
});
