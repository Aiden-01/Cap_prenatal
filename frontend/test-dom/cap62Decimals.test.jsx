// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";

const React = await import("react");
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes } = await import("react-router-dom");
const { ToastContext } = await import("../src/context/ToastContext.js");
const api = (await import("../src/api/axios.js")).default;
const FichaRiesgo = (await import("../src/pages/FichaRiesgo.jsx")).default;

const USER = { id: 7, rol: "admin", permisos: ["controles.ver_vih"] };
const BASE_RESPONSE = {
  paciente: { id: 41, nombres: "Paciente", apellidos: "Decimal", fecha_nacimiento: "1995-01-01" },
  embarazo_seleccionado: { id: 91 },
  ficha_riesgo: null,
  is_read_only: false,
};

let originalGet;
let originalPost;
let originalPut;

function renderRisk() {
  return render(
    React.createElement(
      ToastContext.Provider,
      { value: () => {} },
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/pacientes/41/riesgo?embarazo_id=91"] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: "/pacientes/:id/riesgo", element: React.createElement(FichaRiesgo) }),
          React.createElement(Route, { path: "/pacientes/:id", element: React.createElement("div", null, "Expediente") })
        )
      )
    )
  );
}

beforeEach(() => {
  originalGet = api.get;
  originalPost = api.post;
  originalPut = api.put;
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("usuario", JSON.stringify(USER));
  api.get = async (url) => url === "/auth/me" ? { data: USER } : { data: BASE_RESPONSE };
});

afterEach(() => {
  cleanup();
  api.get = originalGet;
  api.post = originalPost;
  api.put = originalPut;
});

test('CAP-62 captura 0.5 km y 0.25 h y conserva ambos en el payload', async () => {
  let request;
  api.post = async (...args) => {
    request = args;
    return { status: 201, data: {} };
  };
  renderRisk();

  const distance = await screen.findByLabelText("Distancia al servicio (km)");
  const time = screen.getByLabelText("Tiempo al servicio (horas)");
  assert.equal(distance.getAttribute("step"), "0.01");
  assert.equal(time.getAttribute("step"), "0.01");
  assert.ok(screen.getByText("Ej.: 0.5 km = 500 m"));
  assert.ok(screen.getByText("Ej.: 0.25 h = 15 min · 0.5 h = 30 min · 1.5 h = 1 h 30 min"));

  fireEvent.change(distance, { target: { value: "0.5" } });
  fireEvent.change(time, { target: { value: "0.25" } });
  fireEvent.submit(distance.closest("form"));

  await waitFor(() => assert.ok(request));
  assert.equal(request[1].distancia_servicio_km, "0.5");
  assert.equal(request[1].tiempo_horas, "0.25");
});

test('CAP-62 carga decimales existentes sin redondearlos al editar', async () => {
  api.get = async (url) => url === "/auth/me"
    ? { data: USER }
    : { data: { ...BASE_RESPONSE, ficha_riesgo: {
      fecha: "2026-09-09",
      distancia_servicio_km: "1.50",
      tiempo_horas: "0.25",
    } } };
  renderRisk();

  assert.equal((await screen.findByLabelText("Distancia al servicio (km)")).value, "1.50");
  assert.equal(screen.getByLabelText("Tiempo al servicio (horas)").value, "0.25");
});
