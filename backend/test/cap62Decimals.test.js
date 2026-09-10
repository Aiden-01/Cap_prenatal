const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const { riesgoSchema } = require('../src/validations/riesgo.schemas');
const riesgoRepository = require('../src/repositories/riesgoRepository');
const { buildRiskCellMap } = require('../src/controllers/pdfController');
const { renderRiskPdf } = require('../src/services/riskPdfRenderer');

const root = path.resolve(__dirname, '..');

test('CAP-62 acepta todos los decimales requeridos y enteros existentes', () => {
  for (const value of ['0.25', '0.5', '1', '1.5']) {
    const result = riesgoSchema.parse({ fecha: '2026-09-09', tiempo_horas: value });
    assert.equal(result.tiempo_horas, Number(value));
  }
  for (const value of ['0.5', '1', '1.5']) {
    const result = riesgoSchema.parse({ fecha: '2026-09-09', distancia_servicio_km: value });
    assert.equal(result.distancia_servicio_km, Number(value));
  }
});

test('CAP-62 repositorio guarda y recupera NUMERIC sin casts ni redondeo', async () => {
  const calls = [];
  const stored = { distancia_servicio_km: '0.50', tiempo_horas: '0.25' };
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [stored] };
    },
  };

  const inserted = await riesgoRepository.insertar({
    paciente_id: 41,
    embarazo_id: 91,
    distancia_servicio_km: 0.5,
    tiempo_horas: 0.25,
  }, db);
  const loaded = await riesgoRepository.obtenerPorEmbarazo(91, db);

  assert.equal(calls[0].params.includes(0.5), true);
  assert.equal(calls[0].params.includes(0.25), true);
  assert.doesNotMatch(calls[0].sql, /parseInt|round|::integer/i);
  assert.equal(inserted.tiempo_horas, '0.25');
  assert.equal(loaded.distancia_servicio_km, '0.50');
});

test('CAP-62 rechaza negativos, valores no numericos y rangos excedidos', () => {
  for (const payload of [
    { distancia_servicio_km: '-0.5' },
    { tiempo_horas: '-0.25' },
    { distancia_servicio_km: 'medio kilometro' },
    { tiempo_horas: 'un cuarto' },
    { distancia_servicio_km: '500.01' },
    { tiempo_horas: '72.01' },
  ]) {
    assert.equal(riesgoSchema.safeParse({ fecha: '2026-09-09', ...payload }).success, false);
  }
});

test('CAP-62 schema y migracion conservan centesimas solo en tiempo_horas', () => {
  const schema = fs.readFileSync(path.join(root, 'src/db/schema.sql'), 'utf8');
  const migration = fs.readFileSync(
    path.join(root, 'src/db/migrations/016_riesgo_tiempo_horas_decimales.sql'),
    'utf8'
  );

  assert.match(schema, /distancia_servicio_km\s+DECIMAL\(6,2\)/);
  assert.match(schema, /tiempo_horas\s+DECIMAL\(4,2\)/);
  assert.match(migration, /ALTER COLUMN tiempo_horas TYPE NUMERIC\(4,2\)/);
  assert.match(migration, /USING tiempo_horas::NUMERIC\(4,2\)/);
  assert.doesNotMatch(migration, /distancia_servicio_km/);
});

function pdfOperators(bytes) {
  const source = Buffer.from(bytes).toString('latin1');
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      try { return zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { return ''; }
    })
    .join('\n');
}

test('CAP-62 PDF oficial imprime 0.25, 0.5 y 1.5 sin ayudas ni conversiones', async () => {
  for (const value of ['0.25', '0.5', '1.5']) {
    const data = {
      paciente: { nombres: 'Paciente', apellidos: 'Decimal' },
      embarazo: {},
      riesgo: { distancia_servicio_km: value, tiempo_horas: value },
    };
    const cellMap = buildRiskCellMap(data);
    const pdf = await renderRiskPdf(data);
    const operators = pdfOperators(pdf);

    assert.equal(cellMap.K18, value);
    assert.equal(cellMap.X18, value);
    assert.match(operators, new RegExp(Buffer.from(value, 'latin1').toString('hex'), 'i'));
    for (const converted of ['500 m', '15 min', '30 min', '1 h 30 min']) {
      assert.doesNotMatch(operators, new RegExp(Buffer.from(converted, 'latin1').toString('hex'), 'i'));
    }
  }
});
