import test from "node:test";
import assert from "node:assert/strict";

import {
  canCreatePregnancy,
  hasPregnancyBlockingCreation,
  hasPuerperiumPregnancy,
  hasSelectedPregnancy,
  isValidPregnancyId,
  pregnancyActionConfirmation,
  pregnancyActionLabel,
} from "../src/utils/pregnancyState.js";

test("identifica de forma cerrada IDs de embarazo ausentes o invalidos", () => {
  for (const value of [null, undefined, "", " ", "undefined", "null", "abc", "0", 0]) {
    assert.equal(isValidPregnancyId(value), false);
  }

  assert.equal(isValidPregnancyId(12), true);
  assert.equal(isValidPregnancyId("12"), true);
});

test("expediente sin embarazo ofrece inicio explicito", () => {
  const expediente = {
    embarazos: [],
    embarazo_seleccionado: null,
    embarazo_actual: null,
  };

  assert.equal(hasSelectedPregnancy(expediente), false);
  assert.equal(hasPregnancyBlockingCreation(expediente), false);
  assert.equal(canCreatePregnancy(expediente, true), true);
  assert.equal(pregnancyActionLabel(expediente), "Iniciar embarazo");
  assert.match(pregnancyActionConfirmation(expediente), /iniciar un embarazo/i);
  assert.doesNotMatch(pregnancyActionConfirmation(expediente), /cerr/i);
});

test("historial cerrado permite registrar un nuevo embarazo", () => {
  const pregnancy = { id: 7, estado: "cerrado" };
  const expediente = {
    embarazos: [pregnancy],
    embarazo_seleccionado: pregnancy,
    embarazo_actual: null,
  };

  assert.equal(hasSelectedPregnancy(expediente), true);
  assert.equal(hasPregnancyBlockingCreation(expediente), false);
  assert.equal(canCreatePregnancy(expediente, true), true);
  assert.equal(pregnancyActionLabel(expediente), "Nuevo embarazo");
  assert.match(pregnancyActionConfirmation(expediente), /registrar un nuevo embarazo/i);
  assert.doesNotMatch(pregnancyActionConfirmation(expediente), /cerr/i);
});

test("cualquier embarazo activo oculta la accion aunque se consulte un historico", () => {
  const closed = { id: 7, estado: "cerrado" };
  const active = { id: 8, estado: "activo" };
  const expediente = {
    embarazos: [active, closed],
    embarazo_seleccionado: closed,
    embarazo_actual: active,
  };

  assert.equal(hasSelectedPregnancy(expediente), true);
  assert.equal(hasPregnancyBlockingCreation(expediente), true);
  assert.equal(canCreatePregnancy(expediente, true), false);
});

test("un embarazo en puerperio oculta la accion hasta completar y cerrar el puerperio", () => {
  const closed = { id: 7, estado: "cerrado" };
  const puerperium = { id: 8, estado: "puerperio" };
  const expediente = {
    embarazos: [puerperium, closed],
    embarazo_seleccionado: closed,
    embarazo_actual: puerperium,
  };

  assert.equal(hasPregnancyBlockingCreation(expediente), true);
  assert.equal(hasPuerperiumPregnancy(expediente), true);
  assert.equal(canCreatePregnancy(expediente, true), false);
});

test("sin permiso de edicion nunca se muestra la accion de crear embarazo", () => {
  assert.equal(canCreatePregnancy({ embarazos: [] }, false), false);
});
