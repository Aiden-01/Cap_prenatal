// @vitest-environment jsdom
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

const React = await import("react");
const { cleanup, fireEvent, render, screen, within } = await import("@testing-library/react");
const api = (await import("../src/api/axios.js")).default;
const AppointmentCalendar = (await import("../src/components/AppointmentCalendar.jsx")).default;
const originalGet = api.get;

afterEach(() => { cleanup(); api.get = originalGet; });

const statuses = ["programada", "atendida", "reprogramada", "cancelada", "inasistente"];
const appointments = statuses.map((status, index) => ({
  id: String(index + 1), patient_id: index + 1, pregnancy_id: index + 10,
  patient_name: `Paciente ${index + 1}`, community: "El Centro",
  date: "2026-09-15", status, editable: false,
}));

async function calendar() {
  api.get = async () => ({ data: { items: appointments } });
  const view = render(React.createElement(AppointmentCalendar, {
    canManageAppointments: false, onViewPatient: () => {},
  }));
  await screen.findByRole("button", { name: /Paciente 1, cita programada/ });
  return view;
}

test("área libre y número abren el modal, listan todas las citas y cierran con Escape", async () => {
  const view = await calendar();
  const cell = screen.getAllByRole("button", { name: /Ver citas del 15 de septiembre/ })[0].closest("td");
  fireEvent.click(cell.querySelector(".calendar-cell-button"));
  let dialog = screen.getByRole("dialog");
  assert.match(dialog.textContent, /5 citas/);
  for (const label of ["Programada", "Atendida", "Reprogramada", "Cancelada", "No asistió"]) {
    assert.ok(within(dialog).getByText(label));
  }
  assert.equal(within(dialog).getAllByRole("button", { name: /Paciente \d/ }).length, 5);
  assert.equal(view.container.querySelector(".appointment-day-agenda"), null);
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
  fireEvent.click(cell.querySelector(".calendar-day-button"));
  assert.ok(screen.getByRole("dialog"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar citas del día" }));
  assert.equal(screen.queryByRole("dialog"), null);
});

test("tarjeta abre únicamente el modal individual; una cita de la lista lo reemplaza", async () => {
  await calendar();
  fireEvent.click(screen.getByRole("button", { name: /Paciente 1, cita programada/ }));
  assert.equal(screen.getAllByRole("dialog").length, 1);
  assert.ok(screen.getByRole("button", { name: "Cerrar detalle de la cita" }));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar detalle de la cita" }));
  fireEvent.click(screen.getAllByRole("button", { name: /Ver citas del 15 de septiembre/ })[0]);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Paciente 5/ }));
  assert.equal(screen.getAllByRole("dialog").length, 1);
  assert.ok(within(screen.getByRole("dialog")).getAllByText("No asistió").length);
});

test("día sin citas muestra mensaje sencillo", async () => {
  await calendar();
  fireEvent.click(screen.getAllByRole("button", { name: /Ver citas del 16 de septiembre/ })[0]);
  const dialog = screen.getByRole("dialog");
  assert.match(dialog.textContent, /0 citas/);
  assert.ok(within(dialog).getByText("No hay citas registradas para este día."));
});
