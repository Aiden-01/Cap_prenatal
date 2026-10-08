const test = require('node:test');
const assert = require('node:assert/strict');
const { VIH_FIELDS, ocultarDatosVih } = require('../src/utils/datosSensibles');

function fixture() {
  const protectedFields = Object.fromEntries([...VIH_FIELDS].map(key => [key, 'synthetic-protected']));
  return {
    ...protectedFields,
    fur: '2024-02-29', fpp: '2026-12-31', timestampText: '2026-01-01T12:34:56.000Z',
    created_at: new Date('2026-01-01T12:34:56Z'), invalid: new Date(NaN),
    empty: null, normal: { text: 'synthetic', number: 0, flag: false, blank: '' },
    nested: { ...protectedFields, updated_at: new Date('2026-02-01T01:02:03Z'),
      items: [null, '2026-01-31', 7, false, new Date('2026-12-31T23:59:59Z'),
        [new Date(NaN), { ...protectedFields, date: '2026-02-28', deeper: { ...protectedFields, ok: true } }]] },
  };
}

function assertNoProtectedFields(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!VIH_FIELDS.has(key), `Protected field leaked: ${key}`);
    assertNoProtectedFields(child);
  }
}

function snapshot(value) {
  if (value instanceof Date) return { dateEpoch: Number.isNaN(value.getTime()) ? 'invalid' : value.getTime() };
  if (Array.isArray(value)) return value.map(snapshot);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, snapshot(child)]));
}

for (const permissions of [[], ['pacientes.ver'], ['controles.ver_vih_extra']]) {
  test(`sin permiso VIH: fechas y valores preservados, redacción recursiva y original intacto (${permissions})`, () => {
    const input = fixture();
    const before = snapshot(input);
    const result = ocultarDatosVih(input, permissions);
    assertNoProtectedFields(result);
    assert.notEqual(result, input);
    assert.notEqual(result.nested.items, input.nested.items);
    assert.notEqual(result.created_at, input.created_at);
    assert.equal(result.created_at.getTime(), input.created_at.getTime());
    assert.ok(result.invalid instanceof Date);
    assert.ok(Number.isNaN(result.invalid.getTime()));
    const json = JSON.parse(JSON.stringify(result));
    assert.equal(json.created_at, '2026-01-01T12:34:56.000Z');
    assert.equal(json.invalid, null); // Normal JSON semantics of Invalid Date.
    assert.equal(json.nested.updated_at, '2026-02-01T01:02:03.000Z');
    assert.deepEqual(json.nested.items, [null, '2026-01-31', 7, false,
      '2026-12-31T23:59:59.000Z', [null, { date: '2026-02-28', deeper: { ok: true } }]]);
    for (const key of ['fur', 'fpp', 'timestampText', 'empty', 'normal']) assert.deepEqual(result[key], input[key]);
    result.created_at.setTime(0);
    assert.deepEqual(snapshot(input), before);
  });
}

test('con permiso VIH: identidad, campos protegidos y serialización actuales intactos', () => {
  const input = fixture();
  const before = snapshot(input);
  const result = ocultarDatosVih(input, ['pacientes.ver', 'controles.ver_vih']);
  assert.equal(result, input);
  assert.equal(result.created_at, input.created_at);
  assert.equal(JSON.parse(JSON.stringify(result)).created_at, '2026-01-01T12:34:56.000Z');
  assert.equal(JSON.parse(JSON.stringify(result)).invalid, null);
  for (const key of VIH_FIELDS) assert.equal(result.nested.items[5][1][key], 'synthetic-protected');
  assert.deepEqual(snapshot(input), before);
});

test('hojas Date válidas/inválidas y primitivos mantienen la semántica JSON normal', () => {
  for (const permissions of [[], ['controles.ver_vih']]) {
    for (const value of [new Date(0), new Date(NaN), null, undefined, '', '2026-01-01', 0, false, []]) {
      assert.equal(JSON.stringify(ocultarDatosVih(value, permissions)), JSON.stringify(value));
    }
  }
});

test('Date se clona como hoja y no propaga propiedades VIH añadidas', () => {
  const input = new Date('2026-01-01T12:34:56Z');
  input.vih_resultado = 'synthetic-protected';
  const result = ocultarDatosVih(input);
  assertNoProtectedFields(result);
  assert.equal(result.getTime(), input.getTime());
  assert.equal(input.vih_resultado, 'synthetic-protected');
});

const controllerCases = [
  ['pacientes', 'obtener', 'obtenerPaciente', 'object'],
  ['pacientes', 'expedienteCompleto', 'expedienteCompleto', 'expediente'],
  ['controlesPrenatales', 'listar', 'listarControles', 'array'],
  ['controlesPrenatales', 'obtener', 'obtenerControl', 'object'],
  ['controlesPrenatales', 'crear', 'crearControl', 'object'],
  ['controlesPrenatales', 'actualizar', 'actualizarControl', 'object'],
  ['riesgo', 'obtener', 'obtenerFichaRiesgo', 'object'],
  ['riesgo', 'guardar', 'guardarFichaRiesgo', 'object'],
  ['riesgo', 'actualizar', 'actualizarFichaRiesgo', 'object'],
];

for (const [name, handler, serviceMethod, shape] of controllerCases) {
  for (const allowed of [false, true]) {
    test(`${name}.${handler}: JSON con fechas y redacción VIH (${allowed ? 'autorizado' : 'sin permiso'})`, async () => {
      const servicePath = require.resolve(`../src/services/${name}Service`);
      const controllerPath = require.resolve(`../src/controllers/${name}Controller`);
      const previousService = require.cache[servicePath];
      const previousController = require.cache[controllerPath];
      const leaf = fixture();
      const dto = shape === 'array' ? [leaf] : shape === 'expediente'
        ? { paciente: leaf, controles: [fixture()], ficha_riesgo: fixture(), embarazo_seleccionado: { fur: '2024-02-29' } }
        : leaf;
      const before = snapshot(dto);
      require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true,
        exports: { [serviceMethod]: async () => dto } };
      delete require.cache[controllerPath];
      try {
        const controller = require(controllerPath);
        const req = { params: { id: 'synthetic', pacienteId: 'synthetic' }, query: {}, body: {},
          usuario: { permisos: allowed ? ['controles.ver_vih'] : ['pacientes.ver'] } };
        let json;
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
          json(value) { json = JSON.parse(JSON.stringify(value)); return this; } };
        await controller[handler](req, res, error => { throw error; });
        assert.equal(res.statusCode, handler === 'crear' ? 201 : 200);
        if (!allowed) assertNoProtectedFields(json);
        else assert.deepEqual(json, JSON.parse(JSON.stringify(dto)));
        const record = shape === 'array' ? json[0] : shape === 'expediente' ? json.paciente : json;
        assert.equal(record.created_at, '2026-01-01T12:34:56.000Z');
        assert.equal(record.invalid, null);
        assert.equal(record.fur, '2024-02-29');
        assert.equal(record.fpp, '2026-12-31');
        assert.deepEqual(snapshot(dto), before);
      } finally {
        if (previousService) require.cache[servicePath] = previousService; else delete require.cache[servicePath];
        if (previousController) require.cache[controllerPath] = previousController; else delete require.cache[controllerPath];
      }
    });
  }
}
