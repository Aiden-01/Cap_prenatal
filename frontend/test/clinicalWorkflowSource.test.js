import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("los componentes clínicos compartidos permanecen presentacionales", async () => {
  const components = await source("src/components/clinical/ClinicalWorkflow.jsx");

  for (const exportName of [
    "ClinicalWorkflowShell",
    "ClinicalSection",
    "ClinicalNotice",
    "ClinicalActionBar",
    "ClinicalLoadingSkeleton",
  ]) {
    assert.match(components, new RegExp(`export function ${exportName}`));
  }

  assert.doesNotMatch(components, /\bapi\b|axios|useState|useEffect|useAuth|embarazo_id|numero_control/);
  assert.match(components, /children/);
});

test("NuevoControl conserva rutas, payload y barreras funcionales", async () => {
  const control = await source("src/pages/NuevoControl.jsx");

  assert.match(control, /api\.get\(`\/pacientes\/\$\{id\}\/controles\/\$\{controlId\}`/);
  assert.match(control, /api\.get\(`\/pacientes\/\$\{id\}\/controles`/);
  assert.match(control, /api\.put\(`\/pacientes\/\$\{id\}\/controles\/\$\{controlId\}`, payload/);
  assert.match(control, /api\.post\(`\/pacientes\/\$\{id\}\/controles`, payload/);
  assert.match(control, /const payload = \{\s*\.\.\.form,/);
  assert.match(control, /delete payload\.vih_realizado/);
  assert.match(control, /canConsultPrenatalControl/);
  assert.match(control, /canEditPrenatalControl/);
  assert.match(control, /fieldset disabled=\{soloLectura\}/);
  assert.match(control, /disabled=\{loading\}/);
});

test("UX-02A mantiene pestañas, accesibilidad y movimiento reducible", async () => {
  const control = await source("src/pages/NuevoControl.jsx");
  const sharedStyles = await source("src/components/clinical/clinical-workflow.css");
  const controlStyles = await source("src/pages/nuevo-control.css");

  for (const tabId of ["general", "laboratorio", "suplementacion", "orientaciones"]) {
    assert.match(control, new RegExp(`id: "${tabId}"`));
    assert.match(control, new RegExp(`control-panel-${tabId}`));
  }

  assert.match(control, /role="tablist"/);
  assert.match(control, /aria-selected=\{tab === t\.id\}/);
  assert.match(control, /aria-pressed=\{Boolean\(val\)\}/);
  assert.match(control, /function blurNumberInputOnWheel\(event\)/);
  assert.match(control, /onWheel=\{type === "number" \? blurNumberInputOnWheel : undefined\}/);
  assert.doesNotMatch(sharedStyles, /\.clinical-action-bar\s*\{[^}]*position:\s*sticky/s);
  assert.match(sharedStyles, /prefers-reduced-motion: reduce/);
  assert.match(controlStyles, /prefers-reduced-motion: reduce/);
  assert.match(controlStyles, /overflow-x: auto/);
});
