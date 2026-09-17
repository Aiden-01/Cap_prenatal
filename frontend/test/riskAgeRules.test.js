import assert from "node:assert/strict";
import test from "node:test";
import { calculateAgeOnDate, deriveAgeRiskFactors } from "../src/utils/riskAgeRules.js";

test("edad clínica respeta el día exacto del cumpleaños", () => {
  assert.equal(calculateAgeOnDate("2006-09-17", "2026-09-16"), 19);
  assert.equal(calculateAgeOnDate("2006-09-17", "2026-09-17"), 20);
});

test("solo uno o ninguno de los factores automáticos puede estar activo", () => {
  assert.deepEqual(deriveAgeRiskFactors("2007-09-17", "2026-09-17"), {
    valid: true, age: 19, menor_20_anos: true, mayor_35_anos: false,
  });
  assert.deepEqual(deriveAgeRiskFactors("1998-09-17", "2026-09-17"), {
    valid: true, age: 28, menor_20_anos: false, mayor_35_anos: false,
  });
  assert.deepEqual(deriveAgeRiskFactors("1989-09-17", "2026-09-17"), {
    valid: true, age: 37, menor_20_anos: false, mayor_35_anos: true,
  });
});

test("años bisiestos y fechas inconsistentes no inventan edad", () => {
  assert.equal(calculateAgeOnDate("2004-02-29", "2024-02-28"), 19);
  assert.equal(calculateAgeOnDate("2004-02-29", "2024-02-29"), 20);
  assert.equal(deriveAgeRiskFactors("2027-01-01", "2026-09-17").valid, false);
});
