const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyAgeRiskFactors,
  calculateAgeOnDate,
  deriveAgeRiskFactors,
} = require('../src/domain/riskAgeRules');

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
