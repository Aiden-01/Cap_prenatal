// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

const React = await import("react");
const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;
const PrintDocumentsModal = (await import("../src/components/PrintDocumentsModal.jsx")).default;

afterEach(cleanup);

function renderModal(overrides = {}) {
  const calls = [];
  render(React.createElement(PrintDocumentsModal, {
    availability: { expediente: true, plan: true, riesgo: true },
    busy: false,
    onClose: () => calls.push("close"),
    onGenerate: (mode, selected) => calls.push({ mode, selected }),
    ...overrides,
  }));
  return calls;
}

test("inicia en modo individual y exige al menos un documento", async () => {
  const user = userEvent.setup();
  renderModal();
  assert.equal(screen.getByRole("dialog").getAttribute("aria-modal"), "true");
  assert.equal(screen.getByRole("radio", { name: /documentos individuales/i }).checked, true);
  const expediente = screen.getByRole("checkbox", { name: /expediente/i });
  assert.equal(expediente.checked, true);
  await user.click(expediente);
  assert.equal(screen.getByRole("button", { name: /generar pdf/i }).disabled, true);
});

test("los modos son excluyentes y combinado bloquea la selección individual en orden", async () => {
  const user = userEvent.setup();
  renderModal();
  await user.click(screen.getByRole("radio", { name: /todo en un solo pdf/i }));
  assert.equal(screen.getByRole("radio", { name: /documentos individuales/i }).checked, false);
  screen.getAllByRole("checkbox").forEach((checkbox) => assert.equal(checkbox.disabled, true));
  assert.deepEqual(screen.getAllByRole("listitem").map((item) => item.textContent), [
    "Expediente", "Plan de parto", "Ficha de riesgo",
  ]);
  await user.click(screen.getByRole("radio", { name: /documentos individuales/i }));
  assert.equal(screen.getByRole("checkbox", { name: /expediente/i }).disabled, false);
});

test("documento faltante queda deshabilitado e impide combinado", async () => {
  renderModal({ availability: { expediente: true, plan: false, riesgo: true } });
  assert.equal(screen.getByRole("checkbox", { name: /plan de parto/i }).disabled, true);
  assert.equal(screen.getByRole("radio", { name: /todo en un solo pdf/i }).disabled, true);
});

test("cierra por botón y Escape", () => {
  const calls = renderModal();
  fireEvent.keyDown(document, { key: "Escape" });
  assert.deepEqual(calls, ["close"]);
  fireEvent.click(screen.getByRole("button", { name: /cerrar selector/i }));
  assert.deepEqual(calls, ["close", "close"]);
});

test("genera exactamente los documentos individuales seleccionados", async () => {
  const user = userEvent.setup();
  const calls = renderModal();
  await user.click(screen.getByRole("checkbox", { name: /expediente/i }));
  await user.click(screen.getByRole("checkbox", { name: /plan de parto/i }));
  await user.click(screen.getByRole("checkbox", { name: /ficha de riesgo/i }));
  await user.click(screen.getByRole("button", { name: /generar pdf/i }));
  assert.deepEqual(calls, [{ mode: "individual", selected: ["plan", "riesgo"] }]);
});

test("loading bloquea controles, cierre y doble envío", () => {
  const calls = renderModal({ busy: true });
  screen.getAllByRole("radio").forEach((control) => assert.equal(control.disabled, true));
  screen.getAllByRole("checkbox").forEach((control) => assert.equal(control.disabled, true));
  assert.equal(screen.getByRole("button", { name: /generando pdf/i }).disabled, true);
  fireEvent.keyDown(document, { key: "Escape" });
  assert.deepEqual(calls, []);
});

test("restaura foco y scroll al desmontar", () => {
  const trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();
  renderModal();
  assert.notEqual(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, "hidden");
  cleanup();
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, "");
  trigger.remove();
});
