import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const numericInputs = (pageSource) =>
  [...pageSource.matchAll(/<Input\s+[\s\S]*?\/>/g)]
    .map((match) => match[0])
    .filter((input) => /type="number"/.test(input));

test("UX-02B reutiliza la estructura clínica sin alterar contratos de riesgo", async () => {
  const risk = await source("src/pages/FichaRiesgo.jsx");

  for (const component of [
    "ClinicalWorkflowShell",
    "ClinicalSection",
    "ClinicalNotice",
    "ClinicalActionBar",
    "ClinicalLoadingSkeleton",
  ]) {
    assert.match(risk, new RegExp(component));
  }

  assert.match(risk, /const hasRiskFeatures = RISK_FIELDS\.some\(\(field\) => Boolean\(form\[field\]\)\)/);
  assert.match(risk, /if \(hasRiskFeatures && referralMissing\)/);
  assert.match(risk, /const payload = \{ \.\.\.form \}/);
  assert.match(risk, /delete payload\.vih_positivo_sifilis/);
  assert.match(risk, /api\.put\(`\/pacientes\/\$\{id\}\/riesgo`, payload/);
  assert.match(risk, /api\.post\(`\/pacientes\/\$\{id\}\/riesgo`, payload/);
  assert.match(risk, /data\?\.is_read_only/);
  assert.match(risk, /tone=\{hasRiskFeatures \? "danger" : "default"\}/);
  assert.match(risk, /aria-pressed=\{val\}/);
});

test("UX-02B conserva horas decimales y payload del plan de parto", async () => {
  const plan = await source("src/pages/PlanPartoForm.jsx");
  const hoursInput = plan.match(/<Input\s+[\s\S]*?name="horas_distancia"[\s\S]*?\/>/)?.[0] || "";

  assert.match(plan, /const payload = \{\s*\.\.\.form,/);
  assert.match(plan, /normalizePayload\(payload\)/);
  assert.match(plan, /`\/pacientes\/\$\{id\}\/controles\/plan-parto`/);
  assert.match(plan, /data\?\.is_read_only/);
  assert.match(hoursInput, /type="number"/);
  assert.match(hoursInput, /min="0"/);
  assert.match(hoursInput, /max="72"/);
  assert.match(hoursInput, /step="0\.1"/);
  assert.match(hoursInput, /inputMode="decimal"/);

  for (const chapter of [
    "Lugar y planificación",
    "Distancia, transporte y logística",
    "Responsables, acompañantes y contactos",
  ]) {
    assert.match(plan, new RegExp(chapter));
  }

  assert.doesNotMatch(plan, /role="progressbar"|\bwizard\b|\bpuntaje\b|\bscore\b/i);
});

test("todos los números de FichaRiesgo y PlanParto usan protección local de rueda", async () => {
  const [risk, plan, styles] = await Promise.all([
    source("src/pages/FichaRiesgo.jsx"),
    source("src/pages/PlanPartoForm.jsx"),
    source("src/pages/clinical-secondary-workflows.css"),
  ]);

  assert.equal(numericInputs(risk).length, 10);
  assert.equal(numericInputs(plan).length, 10);

  for (const page of [risk, plan]) {
    assert.match(page, /function blurNumberInputOnWheel\(event\) \{\s*event\.currentTarget\.blur\(\);\s*\}/);
    assert.match(page, /onWheel=\{type === "number" \? blurNumberInputOnWheel : undefined\}/);
    assert.doesNotMatch(page, /onKeyDown=.*ArrowUp|onKeyDown=.*ArrowDown/s);
  }

  assert.doesNotMatch(styles, /input\[type=["']number["']\]/);
});

test("UX-02B cubre foco, modo oscuro, móvil y movimiento reducido", async () => {
  const [risk, plan, styles] = await Promise.all([
    source("src/pages/FichaRiesgo.jsx"),
    source("src/pages/PlanPartoForm.jsx"),
    source("src/pages/clinical-secondary-workflows.css"),
  ]);

  assert.match(risk, /role="dialog"/);
  assert.match(risk, /aria-modal="true"/);
  assert.match(risk, /htmlFor=\{inputId\}/);
  assert.match(plan, /htmlFor=\{inputId\}/);
  assert.match(styles, /html\.dark \.secondary-workflow/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /transition-duration: 0\.01ms/);
});
