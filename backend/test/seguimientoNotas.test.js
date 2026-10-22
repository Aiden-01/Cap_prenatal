const test = require('node:test');
const assert = require('node:assert/strict');
const { querySchema, bodySchema } = require('../src/validations/seguimientoNotas.schemas');
const { buildAuditPayload } = require('../src/services/audit/auditDiffBuilder');

test('seguimiento valida lotes acotados y rechaza campos manipulables', () => {
  assert.deepEqual(querySchema.parse({ embarazo_id: '11', controles_ids: '1,2,1' }), { embarazo_id: 11, controles_ids: [1, 2] });
  for (const controles_ids of ['0', '-1', '1 OR 1=1', '1,', '', Array.from({ length: 101 }, (_, index) => index + 1).join(',')]) {
    assert.equal(querySchema.safeParse({ embarazo_id: '11', controles_ids }).success, false);
  }
  const body = { embarazo_id: 11, tipo: 'nota_evolucion', version: 1, responsable: { tipo: 'usuario', usuario_id: 2 } };
  assert.equal(bodySchema.safeParse(body).success, true);
  for (const field of ['confirmado_por', 'capturista_usuario_id', 'estado', 'contenido', 'responsable_snapshot']) {
    assert.equal(bodySchema.safeParse({ ...body, [field]: 1 }).success, false);
  }
});

test('auditoría de seguimiento admite solo metadatos controlados y rechaza identidad/narrativa', () => {
  const payload = buildAuditPayload({ next: { version: 2, contenido: 'Narrativa reservada', nombre_completo: 'Persona reservada' },
    metadata: { tipo_nota: 'nota_enfermeria', resultado: 'exitoso' } },
  { context: { categoria: 'clinica', entidad: 'control_prenatal', evento: 'seguimiento_nota_confirmado' } });
  const serialized = JSON.stringify(payload);
  assert.ok(serialized.includes('nota_enfermeria')); assert.ok(serialized.includes('version'));
  assert.equal(serialized.includes('Narrativa reservada'), false); assert.equal(serialized.includes('Persona reservada'), false);
});
