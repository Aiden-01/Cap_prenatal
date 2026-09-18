// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

const React = await import("react");
const { cleanup, render, screen } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;
const { MemoryRouter, Route, Routes, useLocation } = await import("react-router-dom");
const NotFoundPage = (await import("../src/pages/NotFoundPage.jsx")).default;

afterEach(cleanup);

function CurrentPath() {
  const location = useLocation();
  return React.createElement("output", { "aria-label": "ruta actual" }, location.pathname);
}

function renderPage(initialEntries = ["/ruta-inexistente"], initialIndex = initialEntries.length - 1) {
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries, initialIndex },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, { path: "*", element: React.createElement(React.Fragment, null,
          React.createElement(NotFoundPage), React.createElement(CurrentPath)) })
      )
    )
  );
}

test("muestra el contenido aprobado y solo las tres acciones solicitadas", () => {
  renderPage();

  assert.ok(screen.getByRole("heading", { name: /esta sección\s*no está disponible/i }));
  assert.ok(screen.getByText("ERROR 404"));
  const actions = screen.getByRole("navigation", { name: "Opciones de navegación" });
  assert.deepEqual(
    Array.from(actions.querySelectorAll("a, button"), (element) => element.textContent.trim()),
    ["Inicio", "Regresar"]
  );
});

test("Inicio navega al dashboard", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getByRole("link", { name: "Inicio" }));
  assert.equal(screen.getByLabelText("ruta actual").textContent, "/dashboard");
});

test("Regresar vuelve a la ruta anterior", async () => {
  const user = userEvent.setup();
  renderPage(["/dashboard", "/ruta-inexistente"], 1);

  await user.click(screen.getByRole("button", { name: "Regresar" }));
  assert.equal(screen.getByLabelText("ruta actual").textContent, "/dashboard");
});
