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
  const user = userEvent.setup();
  renderModal({ availability: { expediente: true, plan: false, riesgo: true } });
  assert.equal(screen.getByRole("checkbox", { name: /plan de parto/i }).disabled, true);
  await user.click(screen.getByRole("radio", { name: /todo en un solo pdf/i }));
  assert.equal(screen.getByRole("button", { name: /generar pdf/i }).disabled, true);
  assert.match(screen.getByRole("alert").textContent, /completa los documentos/i);
});

test("cierra por botón y Escape", () => {
  const calls = renderModal();
  fireEvent.keyDown(document, { key: "Escape" });
  assert.deepEqual(calls, ["close"]);
  fireEvent.click(screen.getByRole("button", { name: /cerrar selector/i }));
  assert.deepEqual(calls, ["close", "close"]);
});
