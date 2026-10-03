import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { ESTABLECIMIENTO_CATALOGS, ESTABLECIMIENTO_DEFAULTS } from '../src/utils/establecimientoCatalogs.js';

const require = createRequire(import.meta.url);
const backend = require('../../backend/src/domain/establecimientoCatalogs.js');

test('catálogos administrativos frontend/backend coinciden exactamente sin duplicados', () => {
  assert.deepEqual(ESTABLECIMIENTO_CATALOGS, backend.ESTABLECIMIENTO_CATALOGS);
  assert.deepEqual(Object.values(ESTABLECIMIENTO_CATALOGS).map((values) => values.length), [5, 6, 1]);
  for (const [field, values] of Object.entries(ESTABLECIMIENTO_CATALOGS)) {
    assert.equal(new Set(values).size, values.length);
    assert.ok(values.includes(ESTABLECIMIENTO_DEFAULTS[field]));
  }
  assert.deepEqual(ESTABLECIMIENTO_DEFAULTS, {
    nombre_establecimiento: 'CAP El Chal', distrito: 'El Chal', area_salud: 'Petén Sur Oriente',
  });
});
