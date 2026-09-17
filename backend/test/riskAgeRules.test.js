const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const {
  applyAgeRiskFactors,
  calculateAgeOnDate,
  deriveAgeRiskFactors,
  normalizeClinicalDate,
} = require('../src/domain/riskAgeRules');

test('normaliza las representaciones legítimas que producen PostgreSQL y la API', () => {
  const birthFromPostgres = new Date(2009, 3, 12);
  const evaluationFromPostgres = new Date(2026, 5, 17);

  assert.equal(normalizeClinicalDate(birthFromPostgres), '2009-04-12');
  assert.equal(normalizeClinicalDate(evaluationFromPostgres), '2026-06-17');
  assert.equal(normalizeClinicalDate('2026-06-17'), '2026-06-17');
  assert.equal(normalizeClinicalDate('2026-06-17T06:00:00.000Z'), '2026-06-17');
  assert.deepEqual(deriveAgeRiskFactors(birthFromPostgres, evaluationFromPostgres), {
    valid: true,
    age: 17,
    menor_20_anos: true,
    mayor_35_anos: false,
  });
});

test('normalizar un DATE clínico no cambia el día por timezone', () => {
  const modulePath = path.resolve(__dirname, '../src/domain/riskAgeRules.js');
  const script = `const { normalizeClinicalDate } = require(${JSON.stringify(modulePath)}); process.stdout.write(normalizeClinicalDate(new Date(2026, 5, 17)));`;
  for (const timezone of ['UTC', 'America/Guatemala', 'Asia/Tokyo']) {
    const output = execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, TZ: timezone },
      encoding: 'utf8',
    });
    assert.equal(output, '2026-06-17');
  }
});

test('calcula edad por año, mes y día alrededor del cumpleaños 20', () => {
  assert.equal(calculateAgeOnDate('2006-09-17', '2026-09-16'), 19);
  assert.equal(calculateAgeOnDate('2006-09-17', '2026-09-17'), 20);
});

test('aplica límites exactos de menor de 20 y mayor de 35', () => {
  const cases = [
    ['2007-09-17', '2026-09-17', 19, true, false],
    ['2006-09-17', '2026-09-17', 20, false, false],
    ['1992-09-17', '2026-09-17', 34, false, false],
    ['1991-09-17', '2026-09-17', 35, false, false],
    ['1990-09-17', '2026-09-17', 36, false, true],
    ['1990-09-18', '2026-09-17', 35, false, false],
  ];
  for (const [birth, reference, age, younger, older] of cases) {
    assert.deepEqual(deriveAgeRiskFactors(birth, reference), {
      valid: true,
      age,
      menor_20_anos: younger,
      mayor_35_anos: older,
    });
  }
});

test('maneja año bisiesto y rechaza fechas inválidas o nacimiento posterior', () => {
  assert.equal(calculateAgeOnDate('2004-02-29', '2024-02-28'), 19);
  assert.equal(calculateAgeOnDate('2004-02-29', '2024-02-29'), 20);
  for (const [birth, reference] of [
    [null, '2026-09-17'],
    ['fecha-invalida', '2026-09-17'],
    ['2000-02-30', '2026-09-17'],
    ['17/06/2000', '2026-09-17'],
    ['2000-01-01', '17/06/2026'],
    ['2027-01-01', '2026-09-17'],
    ['2000-01-01', null],
  ]) assert.equal(deriveAgeRiskFactors(birth, reference).valid, false);
});

test('sobrescribe valores contradictorios existentes sin permitir ambos activos', () => {
  assert.deepEqual(
    applyAgeRiskFactors({ fecha: '2026-09-17', menor_20_anos: true, mayor_35_anos: true }, '1998-09-17'),
    {
      fecha: '2026-09-17',
      menor_20_anos: false,
      mayor_35_anos: false,
      tiene_riesgo: false,
    }
  );

  const withManualRisk = applyAgeRiskFactors({
    fecha: '2026-09-17',
    menor_20_anos: true,
    mayor_35_anos: true,
    anemia: true,
  }, '1998-09-17');
  assert.equal(withManualRisk.tiene_riesgo, true);
});
