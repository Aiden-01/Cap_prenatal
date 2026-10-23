import test from 'node:test';
import assert from 'node:assert/strict';
import { inicioCapturaGuatemala, errorNota, validarNota } from '../src/utils/notasClinicas.js';

test('captura usa medianoche de Guatemala, independiente de la zona del navegador', () => {
  for (const [instant, expected] of [
    ['2026-10-23T05:59:00Z', { fecha: '2026-10-22', hora: '23:59' }],
    ['2026-10-23T06:00:00Z', { fecha: '2026-10-23', hora: '00:00' }],
    ['2027-01-01T05:59:00Z', { fecha: '2026-12-31', hora: '23:59' }],
  ]) assert.deepEqual(inicioCapturaGuatemala(new Date(instant)), expected);
});
test('errores clínicos distinguen sesión, permisos, recurso, concurrencia y validación', () => {
  for (const [status, text] of [[401, 'sesión'], [403, 'permiso'], [404, 'ruta'], [409, 'cambió'], [400, 'datos'], [422, 'datos'], [500, 'servidor']]) {
    assert.ok(errorNota({ response: { status } }).includes(text));
  }
  assert.match(validarNota({ fecha: '2026-01-01', hora: '08:30', contenido: '', responsable: {}, requiereResponsable: true }), /responsable/);
  assert.match(errorNota({ response: { status: 404, data: { code: 'PACIENTE_NO_ENCONTRADA' } } }), /paciente en este entorno/);
});
