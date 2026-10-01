const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuditHistoryService } = require('../src/services/auditHistoryService');
const { permissionHistoryDetail } = require('../src/services/audit/permissionHistoryDetail');
const base = { id: '1', accion: 'actualizar', modulo: 'permisos', entidad_afectada: 'usuario_permisos',
  evento_codigo: 'permisos_reemplazados', usuario_id: 7, usuario_objetivo_id: 12,
  catalogo_permisos: ['auditoria.ver', 'reportes.ver'] };
for (const [label, delta, expected] of [
  ['grant', { permisos_agregados: ['auditoria.ver'] }, [{ codigo: 'auditoria.ver', anterior: false, nuevo: true }]],
  ['revoke', { permisos_retirados: ['auditoria.ver'] }, [{ codigo: 'auditoria.ver', anterior: true, nuevo: false }]],
  ['multiple', { permisos_agregados: ['reportes.ver'], permisos_retirados: ['auditoria.ver'] },
    [{ codigo: 'auditoria.ver', anterior: true, nuevo: false }, { codigo: 'reportes.ver', anterior: false, nuevo: true }]],
]) test(`API ${label} expone solo diff y preserva actor/target`, async () => {
  const service = createAuditHistoryService({ repository: { listar: async () => [{ ...base, ...delta,
    datos_nuevos: { password_hash: 'CANARIO', permisos: ['pacientes.ver'] }, ip: 'CANARIO' }] } });
  const { items: [item] } = await service.listar({});
  assert.deepEqual(item.detalle_permisos, expected);
  assert.equal(item.usuario.id, 7); assert.equal(item.usuario_objetivo.id, 12);
  assert.doesNotMatch(JSON.stringify(item), /CANARIO|password_hash|datos_nuevos|pacientes.ver/);
});
test('legacy, sin diff y metadata malformada degradan sin interpretar snapshots', () => {
  for (const delta of [{}, { evento_codigo: null }, { permisos_agregados: {} },
    { permisos_agregados: ['auditoria.ver', 'auditoria.ver'] },
    { permisos_agregados: ['auditoria.ver'], permisos_retirados: ['auditoria.ver'] },
    { permisos_retirados: ['CANARIO secreto'] }, { permisos_agregados: ['secreto.token'] }, { permisos_agregados: [true] },
    { modulo: 'autenticacion', permisos_agregados: ['auditoria.ver'] }]) {
    assert.deepEqual(permissionHistoryDetail({ ...base, ...delta }), []);
  }
});
