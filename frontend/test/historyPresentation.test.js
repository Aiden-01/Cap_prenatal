import test from 'node:test';
import assert from 'node:assert/strict';
import { historyActivity, historyResult } from '../src/utils/historyPresentation.js';

test('el resultado contextual controlado tiene prioridad sobre el tipo almacenado', () => {
  const results = [
    ['completado', 'Completado', 'success'],
    ['registrado', 'Registrado', 'neutral'],
    ['fallido', 'Fallido', 'failed'],
    ['acceso_denegado', 'Acceso denegado', 'failed'],
    ['no_disponible', 'No disponible', 'neutral'],
  ];
  for (const [code, label, tone] of results) {
    assert.deepEqual(historyResult('estado', code), { label, tone });
  }
});

test('resultado ausente o desconocido conserva compatibilidad sin mostrar texto libre', () => {
  const unknownResults = [undefined, null, 'TEXTO_LIBRE', 'constructor', '__proto__',
    { label: 'TEXTO_LIBRE', tone: 'success' }, ['completado']];
  for (const result of unknownResults) {
    assert.deepEqual(historyResult('estado', result), { label: 'Registrado', tone: 'neutral' });
    assert.deepEqual(historyResult('login', result), { label: 'Completado', tone: 'success' });
    assert.deepEqual(historyResult('logout', result), { label: 'Completado', tone: 'success' });
    assert.deepEqual(historyResult('login_fallido', result), { label: 'Fallido', tone: 'failed' });
    assert.deepEqual(historyResult('login_usuario_inactivo', result), { label: 'Acceso denegado', tone: 'failed' });
    assert.deepEqual(historyResult('desconocido', result), { label: 'No disponible', tone: 'neutral' });
  }
});

test('una actividad conserva el resultado contextual de logout guardado como estado', () => {
  const activity = historyActivity({ tipo: 'estado', presentacion: { titulo: 'Cerró sesión',
    modulo: 'Acceso y sesiones', categoria: 'Acceso y seguridad', resultado: 'completado' } });
  assert.equal(activity.title, 'Cerró sesión');
  assert.equal(activity.module, 'Acceso y sesiones');
  assert.deepEqual(activity.result, { label: 'Completado', tone: 'success' });
});
