import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

const lazyRoutes = [
  "Pacientes",
  "NuevaPaciente",
  "ExpedientePaciente",
  "NuevoControl",
  "FichaRiesgo",
  "PlanPartoForm",
  "PuerperioForm",
  "MorbilidadForm",
  "VacunaForm",
  "Reportes",
  "Usuarios",
  "MapaRiesgo",
  "Comunidades",
  "NotFoundPage",
];

test("las páginas ajenas a Login y Dashboard se cargan por ruta", () => {
  for (const page of lazyRoutes) {
    assert.match(appSource, new RegExp(`const ${page} = lazy\\(\\(\\) => import\\(\\"\\./pages/${page}\\"\\)\\)`));
  }
  assert.match(appSource, /import Login from "\.\/pages\/Login"/);
  assert.match(appSource, /import Dashboard from "\.\/pages\/Dashboard"/);
});

test("toda ruta lazy usa el fallback compartido", () => {
  assert.match(appSource, /function LazyPage\(\{ children \}\)/);
  assert.match(appSource, /<Suspense fallback=\{<div className="card"[^>]*>Cargando módulo\.\.\.<\/div>\}>/);

  for (const page of lazyRoutes) {
    assert.match(appSource, new RegExp(`<LazyPage><${page} \\/><\\/LazyPage>`));
  }
});

test("auth y permisos envuelven las rutas antes de renderizar páginas lazy", () => {
  assert.match(appSource, /<Route path="\/" element=\{<PrivateRoute><Layout \/><\/PrivateRoute>\}>/);
  assert.match(appSource, /path="comunidades" element=\{<PrivateRoute directorOnly><LazyPage><Comunidades \/><\/LazyPage><\/PrivateRoute>\}/);
  assert.match(appSource, /path="usuarios" element=\{<PrivateRoute adminOnly><LazyPage><Usuarios \/><\/LazyPage><\/PrivateRoute>\}/);
});
