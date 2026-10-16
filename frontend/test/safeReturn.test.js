import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReturn } from '../src/utils/safeReturn.js';
test('return only accepts exact approved internal paths without personal/access parameters', () => {
  assert.equal(safeReturn('/pacientes'), '/pacientes');
  assert.equal(safeReturn('/reportes/seguimiento-inasistencias'), '/dashboard');
  for (const path of [undefined, '//evil.invalid', 'https://evil.invalid', '/\\evil.invalid', '/reportes?token=fiction', '/pacientes/123', '/reportes#patient', '%2f%2fevil.invalid', { to: '/reportes' }]) assert.equal(safeReturn(path), '/dashboard');
});
