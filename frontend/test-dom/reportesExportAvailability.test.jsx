// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const apiGet = vi.fn();
const toast = vi.fn();
vi.mock("../src/api/axios", () => ({ default: { get: apiGet } }));
vi.mock("../src/hooks/useAuth", () => ({
  useAuth: () => ({ usuario: { permisos: ["reportes.exportar"] } }),
}));
vi.mock("../src/context/ToastContext", () => ({ useGlobalToast: () => toast }));

const React = await import("react");
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const Reportes = (await import("../src/pages/Reportes.jsx")).default;

const REPORT_CASES = [
  { title: "Captadas en primer control", endpoint: "/reportes/censo/primer-control", empty: { total: 0, indicadores: {}, pacientes: [] }, one: { total: 1, indicadores: {}, pacientes: [{ id: 1, nombre_completo: "Paciente" }] } },
  { title: "Embarazos activos", endpoint: "/reportes/censo", empty: { total: 0, indicadores: {}, pacientes: [] }, one: { total: 1, indicadores: {}, pacientes: [{ id: 1, nombre_completo: "Paciente" }] } },
  { title: "Próximas a dar a luz", endpoint: "/reportes/proximas-a-parir", empty: [], one: [{ id: 1, nombre: "Paciente" }] },
  { title: "Sin control reciente", endpoint: "/reportes/sin-control-reciente", empty: [], one: [{ id: 1, nombre: "Paciente", estado_seguimiento: "nunca_control" }] },
  { title: "Riesgo obstétrico", endpoint: "/reportes/pacientes-riesgo", empty: [], one: [{ id: 1, nombre: "Paciente" }] },
  { title: "Resumen por comunidad", endpoint: "/reportes/resumen-comunidades", empty: { comunidades: [], totales: {} }, one: { comunidades: [{ comunidad: "Centro" }], totales: {} } },
];

function exportButton() {
  return screen.getByRole("button", { name: /^exportar$/i });
}

function selectReport(title) {
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(title, "i") }));
}

beforeEach(() => {
  apiGet.mockReset();
  toast.mockReset();
  window.history.replaceState({}, "", "/reportes");
});

afterEach(cleanup);

test("sin generar y durante la carga Exportar permanece deshabilitado y no abre el modal", async () => {
  let resolveRequest;
  apiGet.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
  render(React.createElement(Reportes));
  assert.equal(exportButton().disabled, true);
  fireEvent.click(exportButton());
  assert.equal(screen.queryByRole("dialog"), null);
  fireEvent.click(screen.getByRole("button", { name: /generar reporte/i }));
  assert.equal(exportButton().disabled, true);
  resolveRequest({ data: REPORT_CASES[0].one });
  await waitFor(() => assert.equal(exportButton().disabled, false));
});

test.each(REPORT_CASES)("$title bloquea cero registros y habilita uno o más", async ({ title, endpoint, empty, one }) => {
  apiGet.mockResolvedValueOnce({ data: empty }).mockResolvedValueOnce({ data: one });
  render(React.createElement(Reportes));
  if (title !== REPORT_CASES[0].title) selectReport(title);
  fireEvent.click(screen.getByRole("button", { name: /generar reporte/i }));
  await waitFor(() => assert.equal(apiGet.mock.calls[0][0], endpoint));
  assert.equal(exportButton().disabled, true);
  assert.ok(screen.getByRole("alert").textContent.includes("No hay datos para exportar con los filtros actuales."));
  assert.deepEqual(toast.mock.calls, []);
  fireEvent.pointerDown(exportButton());
  assert.ok(screen.getByRole("alert").textContent.includes("No es posible exportar porque no existen datos."));
  fireEvent.click(exportButton());
  assert.equal(screen.queryByRole("dialog"), null);
  fireEvent.click(screen.getByRole("button", { name: /generar reporte/i }));
  await waitFor(() => assert.equal(exportButton().disabled, false));
});

test("cambiar filtros invalida el resultado y regenerar lo habilita de nuevo", async () => {
  apiGet.mockResolvedValue({ data: REPORT_CASES[0].one });
  render(React.createElement(Reportes));
  fireEvent.click(screen.getByRole("button", { name: /generar reporte/i }));
  await waitFor(() => assert.equal(exportButton().disabled, false));
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-02" } });
  assert.equal(exportButton().disabled, true);
  fireEvent.click(screen.getByRole("button", { name: /generar reporte/i }));
  await waitFor(() => assert.equal(exportButton().disabled, false));
});

test("cambiar de reporte no hereda la disponibilidad anterior", async () => {
  apiGet.mockResolvedValue({ data: REPORT_CASES[0].one });
  render(React.createElement(Reportes));
  fireEvent.click(screen.getByRole("button", { name: /generar reporte/i }));
  await waitFor(() => assert.equal(exportButton().disabled, false));
  selectReport("Riesgo obstétrico");
  assert.equal(exportButton().disabled, true);
});
