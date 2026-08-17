import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

function initFieldNames(pageSource) {
  const start = pageSource.indexOf("const INIT");
  assert.notEqual(start, -1, "el formulario debe conservar un INIT auditable");
  const tail = pageSource.slice(start);
  const simpleEnd = tail.indexOf("\n};");
  const frozenEnd = tail.indexOf("\n});");
  const end = simpleEnd >= 0 ? simpleEnd : frozenEnd;
  assert.notEqual(end, -1, "el bloque INIT debe tener un cierre reconocible");
  const block = tail.slice(0, end);
  return [...block.matchAll(/(?:^|[,{]\s*)([a-z][a-z0-9_]*)\s*:/gm)]
    .map((match) => match[1])
    .sort();
}

test("UX-02D protege la cantidad de propiedades clínicas de los seis formularios", async () => {
  const expectations = [
    ["src/pages/NuevoControl.jsx", 73],
    ["src/pages/FichaRiesgo.jsx", 51],
    ["src/pages/PlanPartoForm.jsx", 68],
    ["src/pages/PuerperioForm.jsx", 23],
    ["src/pages/MorbilidadForm.jsx", 9],
    ["src/pages/VacunaForm.jsx", 4],
  ];

  for (const [path, expectedCount] of expectations) {
    const fields = initFieldNames(await source(path));
    assert.equal(fields.length, expectedCount, `${path} cambió su cantidad de propiedades`);
    assert.equal(new Set(fields).size, expectedCount, `${path} contiene propiedades duplicadas`);
  }
});

test("los 41 inputs numéricos de UX-02 conservan protección local sin bloquear el teclado", async () => {
  const pages = await Promise.all([
    source("src/pages/NuevoControl.jsx"),
    source("src/pages/FichaRiesgo.jsx"),
    source("src/pages/PlanPartoForm.jsx"),
    source("src/pages/PuerperioForm.jsx"),
    source("src/pages/MorbilidadForm.jsx"),
    source("src/pages/VacunaForm.jsx"),
  ]);
  const expectedCounts = [14, 10, 10, 7, 0, 0];

  pages.forEach((page, index) => {
    assert.equal((page.match(/type="number"/g) || []).length, expectedCounts[index]);
  });

  for (const page of pages.slice(0, 4)) {
    assert.match(page, /\.currentTarget\.blur\(\)/);
    assert.doesNotMatch(page, /onKeyDown=.*(?:ArrowUp|ArrowDown)/s);
  }
});

test("NuevoControl ofrece pestañas operables con flechas y controles etiquetados", async () => {
  const control = await source("src/pages/NuevoControl.jsx");
  const fieldOpenings = [...control.matchAll(/<Field\s+[^>]*>/g)].map((match) => match[0]);

  assert.match(control, /handleTabKeyDown/);
  assert.match(control, /event\.key === "ArrowRight"/);
  assert.match(control, /event\.key === "Home"/);
  assert.match(control, /tabIndex=\{tab === t\.id \? 0 : -1\}/);
  assert.match(control, /aria-orientation="horizontal"/);
  assert.ok(fieldOpenings.length > 10);
  fieldOpenings.forEach((opening) => assert.match(opening, /htmlFor=/));
  assert.match(control, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(control, /className="field-error-text" role="alert"/);
});

test("el diálogo de referencia contiene el foco, admite Escape y lo devuelve", async () => {
  const risk = await source("src/pages/FichaRiesgo.jsx");

  assert.match(risk, /ref=\{referralDialogRef\}/);
  assert.match(risk, /referralPrimaryActionRef\.current\?\.focus\(\)/);
  assert.match(risk, /event\.key === "Escape"/);
  assert.match(risk, /event\.key !== "Tab"/);
  assert.match(risk, /previousFocus\?\.focus\(\)/);
  assert.match(risk, /document\.body\.style\.overflow = "hidden"/);
});

test("Puerperio, Morbilidad y Vacunas asocian errores con sus controles", async () => {
  const [puerperium, morbidity, vaccine] = await Promise.all([
    source("src/pages/PuerperioForm.jsx"),
    source("src/pages/MorbilidadForm.jsx"),
    source("src/pages/VacunaForm.jsx"),
  ]);

  for (const page of [puerperium, morbidity, vaccine]) {
    assert.match(page, /aria-invalid=/);
    assert.match(page, /aria-describedby=/);
    assert.match(page, /role="alert"/);
  }
  assert.match(puerperium, /name=\{name\}/);
  assert.match(morbidity, /name="tratamiento_referencia"/);
  assert.match(vaccine, /id="vaccine-type-error"/);
});

test("los selectores de Vacunas siguen el patrón de radiogroup mediante teclado", async () => {
  const flow = await source("src/components/VaccineFlow.jsx");

  assert.match(flow, /function handleRadioNavigation/);
  assert.match(flow, /"ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"/);
  assert.match(flow, /\[role="radio"\]:not\(:disabled\)/);
  assert.match(flow, /radios\[nextIndex\]\.focus\(\)/);
  assert.match(flow, /radios\[nextIndex\]\.click\(\)/);
  assert.match(flow, /tabIndex=\{active \|\|/);
});

test("el estado de acciones conserva el detalle completo en pantallas angostas", async () => {
  const styles = await source("src/components/clinical/clinical-workflow.css");
  const mobile = styles.slice(styles.indexOf("@media (max-width: 767px)"), styles.indexOf("@media (max-width: 390px)"));

  assert.match(mobile, /\.clinical-action-status strong\s*\{[\s\S]*?white-space:\s*normal/);
  assert.doesNotMatch(styles, /\.clinical-action-bar\s*\{[^}]*position:\s*(?:sticky|fixed)/s);
});

test("Vacunas elimina sus transiciones visuales con movimiento reducido", async () => {
  const styles = await source("src/pages/clinical-tertiary-workflows.css");
  const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));

  assert.match(reducedMotion, /\.vaccine-workflow \.vaccine-clinical-dialog/);
  assert.match(reducedMotion, /\.vaccine-workflow \.vaccine-choice/);
  assert.match(reducedMotion, /\.vaccine-workflow \.vaccine-dose-choice/);
  assert.match(reducedMotion, /\.vaccine-workflow \.vaccine-moment-choice/);
  assert.match(reducedMotion, /animation:\s*none !important/);
  assert.match(reducedMotion, /transition:\s*none !important/);
});
