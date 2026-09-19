// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const React = await import("react");
const { cleanup, fireEvent, render, screen, waitFor, within } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;
const api = (await import("../src/api/axios.js")).default;
const { ToastContext } = await import("../src/context/ToastContext.js");
const AppointmentCalendar = (await import("../src/components/AppointmentCalendar.jsx")).default;
const AppointmentDetailDialog = (await import("../src/components/AppointmentDetailDialog.jsx")).default;

const BASE = Object.freeze({
  patient_id: 7,
  pregnancy_id: 70,
  patient_name: "Paciente Calendario",
  community: "El Centro",
  rescheduled_to: null,
  editable: true,
});

let originalGet;
let originalPatch;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-19T16:00:00.000Z"));
  originalGet = api.get;
  originalPatch = api.patch;
});

afterEach(() => {
  cleanup();
  api.get = originalGet;
  api.patch = originalPatch;
  vi.useRealTimers();
});

function detail(appointment) {
  return render(React.createElement(AppointmentDetailDialog, {
    appointment: { ...BASE, ...appointment },
    canManage: true,
    onAction: () => {},
    onClose: () => {},
    onViewPatient: () => {},
    returnFocusTarget: null,
  }));
}

test("programada futura conserva Reprogramar y Cancelar", () => {
  detail({ id: "future", date: "2026-09-25", status: "programada" });
  assert.ok(screen.getByRole("button", { name: /Reprogramar/ }));
  assert.ok(screen.getByRole("button", { name: /Cancelar cita/ }));
  assert.equal(screen.queryByRole("button", { name: /Asignar nueva cita/ }), null);
});

test("programada vencida ofrece seguimiento, no cancelacion ni reprogramacion normal", () => {
  detail({ id: "expired", date: "2026-09-15", status: "programada" });
  assert.ok(screen.getByRole("button", { name: /Asignar nueva cita/ }));
  assert.equal(screen.queryByRole("button", { name: /^Reprogramar$/ }), null);
  assert.equal(screen.queryByRole("button", { name: /Cancelar cita/ }), null);
});

test("inasistente pendiente ofrece solo Asignar nueva cita", () => {
  detail({
    id: "missed", date: "2026-09-15", status: "inasistente", editable: false,
    follow_up_pending: true, follow_up_date: null,
  });
  assert.ok(screen.getAllByText("No asistió").length >= 1);
  assert.ok(screen.getByRole("button", { name: /Asignar nueva cita/ }));
  assert.equal(screen.queryByRole("button", { name: /^Reprogramar$/ }), null);
  assert.equal(screen.queryByRole("button", { name: /Cancelar cita/ }), null);
});

test("inasistente resuelta presenta estado secundario y fecha solo si existe hija", () => {
  const view = detail({
    id: "resolved-child", date: "2026-09-15", status: "inasistente", editable: false,
    follow_up_pending: false, follow_up_date: "2026-09-23",
  });
  assert.ok(screen.getByText("Seguimiento resuelto"));
  assert.ok(screen.getByText("23-09-2026"));
  assert.equal(screen.queryByRole("button", { name: /Asignar nueva cita/ }), null);
  assert.equal(screen.queryByText("Reprogramada para"), null);
  view.unmount();

  detail({
    id: "resolved-control", date: "2026-09-15", status: "inasistente", editable: false,
    follow_up_pending: false, follow_up_date: null,
  });
  assert.ok(screen.getByText("Seguimiento resuelto"));
  assert.equal(screen.queryByText("Nueva cita"), null);
});

test("calendario incluye cinco estados y refresca tras asignar cita a vencida", async () => {
  const initial = [
    { ...BASE, id: "old", date: "2026-09-15", status: "programada" },
  ];
  const refreshed = [
    { ...BASE, id: "old", date: "2026-09-15", status: "inasistente", editable: false },
    { ...BASE, id: "new", date: "2026-09-23", status: "programada" },
  ];
  let gets = 0;
  const patchCalls = [];
  api.get = async () => ({ data: { items: gets++ === 0 ? initial : refreshed } });
  api.patch = async (...args) => {
    patchCalls.push(args);
    return { data: { cita_anterior: { estado: "inasistente" }, cita_nueva: { id: "new" } } };
  };
  const user = userEvent.setup({ document, advanceTimers: vi.advanceTimersByTime });
  render(React.createElement(
    ToastContext.Provider,
    { value: () => {} },
    React.createElement(AppointmentCalendar, {
      canManageAppointments: true,
      onViewPatient: () => {},
    })
  ));

  await screen.findByLabelText(/Paciente Calendario, cita programada/);
  const legend = screen.getByLabelText("Leyenda de estados");
  for (const label of ["Programada", "Atendida", "Reprogramada", "Cancelada", "No asistió"]) {
    assert.ok(within(legend).getByText(label));
  }

  await user.click(screen.getByLabelText(/Paciente Calendario, cita programada/));
  await user.click(screen.getByRole("button", { name: /Asignar nueva cita/ }));
  const dialog = screen.getByRole("dialog");
  assert.ok(within(dialog).getByText(/quedará registrada como ‘No asistió’/));
  fireEvent.change(within(dialog).getByLabelText("Nueva fecha"), {
    target: { value: "2026-09-23" },
  });
  await user.click(within(dialog).getByRole("button", { name: "Asignar nueva cita" }));

  await waitFor(() => assert.equal(gets, 2));
  assert.equal(patchCalls.length, 1);
  assert.match(patchCalls[0][0], /\/reprogramar\?embarazo_id=70$/);
  assert.ok(await screen.findByLabelText(/Paciente Calendario, cita a la que no asistió/));
  assert.ok(screen.getByLabelText(/Paciente Calendario, cita programada, 23 de septiembre/));
});

test("Escape cierra el detalle y el diálogo de acción conserva trampa de foco", async () => {
  let closed = 0;
  render(React.createElement(AppointmentDetailDialog, {
    appointment: { ...BASE, id: "missed", date: "2026-09-15", status: "inasistente" },
    canManage: true,
    onAction: () => {},
    onClose: () => { closed += 1; },
    onViewPatient: () => {},
    returnFocusTarget: null,
  }));
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(closed, 1);
});

test("conflicto al asignar seguimiento muestra mensaje y refresca calendario", async () => {
  const pending = [{
    ...BASE, id: "missed", date: "2026-09-15", status: "inasistente", editable: false,
    follow_up_pending: true, follow_up_date: null,
  }];
  const resolved = [{ ...pending[0], follow_up_pending: false }];
  let gets = 0;
  api.get = async () => ({ data: { items: gets++ === 0 ? pending : resolved } });
  api.patch = async () => {
    const error = new Error("conflicto");
    error.response = { data: {
      code: "CITA_SEGUIMIENTO_YA_RESUELTO",
      message: "Esta inasistencia ya no requiere una nueva cita de seguimiento",
    } };
    throw error;
  };
  const user = userEvent.setup({ document, advanceTimers: vi.advanceTimersByTime });
  render(React.createElement(
    ToastContext.Provider,
    { value: () => {} },
    React.createElement(AppointmentCalendar, {
      canManageAppointments: true,
      onViewPatient: () => {},
    })
  ));
  await user.click(await screen.findByLabelText(/Paciente Calendario, cita a la que no asistió/));
  await user.click(screen.getByRole("button", { name: /Asignar nueva cita/ }));
  const dialog = screen.getByRole("dialog");
  assert.ok(within(dialog).getByText(/inasistencia permanecerá en el historial/));
  fireEvent.change(within(dialog).getByLabelText("Nueva fecha"), {
    target: { value: "2026-09-23" },
  });
  await user.click(within(dialog).getByRole("button", { name: "Asignar nueva cita" }));
  assert.ok(await within(dialog).findByRole("alert"));
  assert.match(within(dialog).getByRole("alert").textContent, /ya no requiere/);
  await waitFor(() => assert.equal(gets, 2));
});
