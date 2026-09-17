// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

const React = await import("react");
const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;
const ReportExportModal = (await import("../src/components/ReportExportModal.jsx")).default;

afterEach(cleanup);

const config = {
  title: "Embarazos activos",
  columns: [{ id: "paciente", label: "Paciente" }, { id: "riesgo", label: "Riesgo" }],
};

function renderModal(overrides = {}) {
  const calls = [];
  const view = render(React.createElement(ReportExportModal, {
    config, busy: false,
    onClose: () => calls.push("close"),
    onExport: (format, columns) => calls.push({ format, columns }),
    ...overrides,
  }));
  return { calls, ...view };
}

test("abre como dialogo accesible y permite cambiar entre Excel y PDF", async () => {
  const user = userEvent.setup();
  renderModal();
  assert.equal(screen.getByRole("dialog").getAttribute("aria-modal"), "true");
  const button = screen.getByRole("button", { name: /^exportar$/i });
  assert.equal(button.disabled, true);
  await user.click(screen.getByRole("radio", { name: /excel/i }));
  assert.equal(screen.getByRole("button", { name: /exportar excel/i }).disabled, false);
  await user.click(screen.getByRole("radio", { name: /pdf/i }));
  assert.equal(screen.getByRole("button", { name: /exportar pdf/i }).disabled, false);
});

test("selecciona columnas, todas, ninguna y valida selección vacía", async () => {
  const user = userEvent.setup();
  renderModal();
  await user.click(screen.getByRole("button", { name: /deseleccionar todas/i }));
  screen.getAllByRole("checkbox").forEach((checkbox) => assert.equal(checkbox.checked, false));
  assert.ok(screen.getByText(/selecciona al menos una columna/i));
  await user.click(screen.getByRole("checkbox", { name: /paciente/i }));
  assert.equal(screen.getByRole("checkbox", { name: /paciente/i }).checked, true);
  await user.click(screen.getByRole("button", { name: /^seleccionar todas$/i }));
  screen.getAllByRole("checkbox").forEach((checkbox) => assert.equal(checkbox.checked, true));
});

test("envía formato y columnas exactamente una vez", async () => {
  const user = userEvent.setup();
  const { calls } = renderModal();
  await user.click(screen.getByRole("radio", { name: /excel/i }));
  await user.click(screen.getByRole("checkbox", { name: /riesgo/i }));
  await user.click(screen.getByRole("button", { name: /exportar excel/i }));
  assert.deepEqual(calls, [{ format: "excel", columns: ["paciente"] }]);
});

test("loading bloquea controles, cambios, Escape y doble clic", () => {
  const { calls } = renderModal({ busy: true });
  screen.getAllByRole("radio").forEach((input) => assert.equal(input.disabled, true));
  screen.getAllByRole("checkbox").forEach((input) => assert.equal(input.disabled, true));
  assert.equal(screen.getByRole("button", { name: /exportando/i }).disabled, true);
  fireEvent.keyDown(document, { key: "Escape" });
  assert.deepEqual(calls, []);
});

test("cierra con botón y Escape y restaura foco", () => {
  const trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();
  const { calls, unmount } = renderModal();
  fireEvent.keyDown(document, { key: "Escape" });
  assert.deepEqual(calls, ["close"]);
  fireEvent.click(screen.getByRole("button", { name: /cerrar exportación/i }));
  assert.deepEqual(calls, ["close", "close"]);
  unmount();
  assert.equal(document.activeElement, trigger);
  trigger.remove();
});
