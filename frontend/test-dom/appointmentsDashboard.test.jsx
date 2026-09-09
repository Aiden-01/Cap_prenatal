// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";

const React = await import("react");
const { cleanup, fireEvent, render, screen, waitFor, within } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;
const { MemoryRouter } = await import("react-router-dom");
const { ToastContext } = await import("../src/context/ToastContext.js");
const api = (await import("../src/api/axios.js")).default;
const Dashboard = (await import("../src/pages/Dashboard.jsx")).default;

const PATIENT_A = Object.freeze({
  paciente_id: 1,
  embarazo_id: 101,
  paciente_nombre: "Paciente Alfa",
  comunidad: "El Centro",
  ultimo_control_fecha: "2026-09-01",
  motivo: "ultimo_control_sin_cita",
});

const PATIENT_B = Object.freeze({
  paciente_id: 2,
  embarazo_id: 202,
  paciente_nombre: "Paciente Beta",
  comunidad: "La Esperanza",
  ultimo_control_fecha: "2026-09-02",
  motivo: "sin_cita_previa",
});

const USER = Object.freeze({
  id: 99,
  nombre_completo: "Pruebas CAP-67",
  rol: "admin",
  permisos: ["pacientes.ver", "controles.editar"],
});

const STATS = Object.freeze({
  embarazos_activos: 2,
  controles_este_mes: 0,
  pacientes_con_riesgo: 0,
  proximas_a_parir_count: 0,
});

let originalGet;
let originalPost;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function installApi({ queueGets, post }) {
  let queueIndex = 0;
  const calls = [];
  api.get = async (url, config) => {
    calls.push({ method: "GET", url, signal: config?.signal });
    if (url === "/auth/me") return { data: USER };
    if (url === "/reportes/estadisticas") return { data: STATS };
    if (url === "/reportes/proximas-a-parir") return { data: [] };
    if (url === "/reportes/sin-control-reciente") return { data: [] };
    if (url === "/citas/sin-proxima") {
      const response = queueGets[Math.min(queueIndex, queueGets.length - 1)];
      queueIndex += 1;
      return typeof response === "function" ? response(config) : response;
    }
    throw new Error(`GET inesperado: ${url}`);
  };
  api.post = async (url, body, config) => {
    calls.push({ method: "POST", url, body, config });
    return post(url, body, config);
  };
  return calls;
}

function renderDashboard(toast = () => {}) {
  return render(
    React.createElement(
      ToastContext.Provider,
      { value: toast },
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/dashboard"] },
        React.createElement(Dashboard)
      )
    )
  );
}

async function openQueue(user) {
  const tab = await screen.findByRole("button", { name: /Sin próxima cita \(2\)/ });
  await user.click(tab);
  await screen.findByText(PATIENT_A.paciente_nombre);
}

async function assignPatientA(user) {
  const row = screen.getByText(PATIENT_A.paciente_nombre).closest("tr");
  await user.click(within(row).getByRole("button", { name: /Asignar cita/ }));
  fireEvent.change(screen.getByLabelText("Fecha programada"), {
    target: { value: "2026-09-30" },
  });
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: /^Asignar cita$/ }));
}

beforeEach(() => {
  originalGet = api.get;
  originalPost = api.post;
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("usuario", JSON.stringify(USER));
});

afterEach(() => {
  cleanup();
  api.get = originalGet;
  api.post = originalPost;
});

test("POST 201 seguido de GET reducido elimina la fila y actualiza 2 a 1", async () => {
  const toastCalls = [];
  const calls = installApi({
    queueGets: [
      Promise.resolve({ data: { items: [PATIENT_A, PATIENT_B] } }),
      Promise.resolve({ data: { items: [PATIENT_A, PATIENT_B] } }),
      Promise.resolve({ data: { items: [PATIENT_B] } }),
    ],
    post: async () => ({ status: 201, data: { cita: { id: 303 } } }),
  });
  const user = userEvent.setup({ document });
  renderDashboard((...args) => toastCalls.push(args));
  await openQueue(user);

  await assignPatientA(user);

  await waitFor(() => assert.equal(screen.queryByText(PATIENT_A.paciente_nombre), null));
  assert.ok(screen.getByText(PATIENT_B.paciente_nombre));
  assert.ok(screen.getByRole("button", { name: /Sin próxima cita \(1\)/ }));
  assert.deepEqual(
    calls.filter(({ url }) => url === "/citas/sin-proxima").map(({ method }) => method),
    ["GET", "GET", "GET"]
  );
  assert.equal(calls.filter(({ method }) => method === "POST").length, 1);
  assert.deepEqual(toastCalls, [["Cita asignada correctamente", "success"]]);
});

test("una excepción del toast no bloquea el refetch ni el render confirmado", async () => {
  installApi({
    queueGets: [
      Promise.resolve({ data: { items: [PATIENT_A, PATIENT_B] } }),
      Promise.resolve({ data: { items: [PATIENT_A, PATIENT_B] } }),
      Promise.resolve({ data: { items: [PATIENT_B] } }),
    ],
    post: async () => ({ status: 201, data: { cita: { id: 303 } } }),
  });
  const user = userEvent.setup({ document });
  renderDashboard(() => { throw new Error("Toast no disponible"); });
  await openQueue(user);

  await assignPatientA(user);

  await waitFor(() => assert.equal(screen.queryByText(PATIENT_A.paciente_nombre), null));
  assert.ok(screen.getByText(PATIENT_B.paciente_nombre));
  assert.ok(screen.getByRole("button", { name: /Sin próxima cita \(1\)/ }));
});

test("una respuesta GET antigua no sobrescribe la cola más reciente", async () => {
  const oldRequest = deferred();
  const freshRequest = deferred();
  installApi({
    queueGets: [
      Promise.resolve({ data: { items: [PATIENT_A, PATIENT_B] } }),
      () => oldRequest.promise,
      () => freshRequest.promise,
    ],
    post: async () => ({ status: 201, data: {} }),
  });
  const user = userEvent.setup({ document });
  renderDashboard();
  const tab = await screen.findByRole("button", { name: /Sin próxima cita \(2\)/ });

  await user.click(tab);
  await user.click(tab);
  freshRequest.resolve({ data: { items: [PATIENT_B] } });
  await screen.findByRole("button", { name: /Sin próxima cita \(1\)/ });
  oldRequest.resolve({ data: { items: [PATIENT_A, PATIENT_B] } });

  await waitFor(() => assert.equal(screen.queryByText(PATIENT_A.paciente_nombre), null));
  assert.ok(screen.getByRole("button", { name: /Sin próxima cita \(1\)/ }));
});

test("si POST falla la paciente permanece y el diálogo muestra el error", async () => {
  installApi({
    queueGets: [Promise.resolve({ data: { items: [PATIENT_A, PATIENT_B] } })],
    post: async () => {
      const error = new Error("POST rechazado");
      error.response = { data: { error: "No se pudo asignar la cita." } };
      throw error;
    },
  });
  const user = userEvent.setup({ document });
  renderDashboard();
  await openQueue(user);

  await assignPatientA(user);

  assert.ok(await screen.findByText(PATIENT_A.paciente_nombre));
  assert.ok(await screen.findByRole("alert"));
  assert.ok(screen.getByRole("button", { name: /Sin próxima cita \(2\)/ }));
});

test("si el GET posterior falla se cierra el diálogo y aparece un error reintentable", async () => {
  installApi({
    queueGets: [
      Promise.resolve({ data: { items: [PATIENT_A, PATIENT_B] } }),
      Promise.resolve({ data: { items: [PATIENT_A, PATIENT_B] } }),
      async () => { throw new Error("GET posterior falló"); },
    ],
    post: async () => ({ status: 201, data: {} }),
  });
  const user = userEvent.setup({ document });
  renderDashboard();
  await openQueue(user);

  await assignPatientA(user);

  await screen.findByRole("alert");
  assert.equal(screen.queryByRole("dialog"), null);
  assert.ok(screen.getByRole("button", { name: /Reintentar/ }));
  assert.ok(screen.getByRole("button", { name: /Sin próxima cita \(2\)/ }));
});
