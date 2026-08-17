import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const numericComponentInputs = (pageSource) =>
  [...pageSource.matchAll(/<Input\s+[\s\S]*?\/>/g)]
    .map((match) => match[0])
    .filter((input) => /type="number"/.test(input));

test("UX-02C conserva los contratos y la secuencia clínica de puerperio", async () => {
  const puerperium = await source("src/pages/PuerperioForm.jsx");
  const heartRate = puerperium.match(/<Input\s+[^>]*name="frecuencia_cardiaca"[^>]*\/>/)?.[0] || "";
  const respiratoryRate = puerperium.match(/<Input\s+[^>]*name="frecuencia_respiratoria"[^>]*\/>/)?.[0] || "";

  for (const section of ["Parto y resultado", "Puerperio inmediato", "Seguimiento y observaciones"]) {
    assert.match(puerperium, new RegExp(section));
  }

  assert.match(puerperium, /const payload = Number\(form\.numero_atencion\) === 2 \? \{ \.\.\.form, tuvo_apego_inmediato: false \} : form/);
  assert.match(puerperium, /api\.put\(`\/pacientes\/\$\{id\}\/controles\/puerperio\/\$\{puerperioId\}`, payload/);
  assert.match(puerperium, /api\.post\(`\/pacientes\/\$\{id\}\/controles\/puerperio`, payload/);
  assert.match(puerperium, /expediente\?\.is_read_only/);
  assert.doesNotMatch(puerperium, /role="progressbar"|\bwizard\b|\bstepper\b/i);

  for (const vital of [heartRate, respiratoryRate]) {
    assert.match(vital, /type="number"/);
    assert.match(vital, /step="1"/);
    assert.match(vital, /inputMode="numeric"/);
  }
  assert.match(heartRate, /min="30"/);
  assert.match(heartRate, /max="220"/);
  assert.match(respiratoryRate, /min="5"/);
  assert.match(respiratoryRate, /max="80"/);
});

test("los siete números de puerperio usan protección local de rueda sin bloquear teclado", async () => {
  const [puerperium, morbidity, vaccine, styles] = await Promise.all([
    source("src/pages/PuerperioForm.jsx"),
    source("src/pages/MorbilidadForm.jsx"),
    source("src/pages/VacunaForm.jsx"),
    source("src/pages/clinical-tertiary-workflows.css"),
  ]);

  assert.equal(numericComponentInputs(puerperium).length, 7);
  assert.equal((morbidity.match(/type="number"/g) || []).length, 0);
  assert.equal((vaccine.match(/type="number"/g) || []).length, 0);
  const wheelHandler = puerperium.match(/function preventNumberWheel\(e\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(wheelHandler, /document\.activeElement === e\.currentTarget/);
  assert.match(wheelHandler, /e\.currentTarget\.blur\(\)/);
  assert.match(puerperium, /onWheel=\{type === "number" \? preventNumberWheel : undefined\}/);
  assert.doesNotMatch(wheelHandler, /preventDefault\(\)/);
  assert.doesNotMatch(puerperium, /onKeyDown=.*ArrowUp|onKeyDown=.*ArrowDown/s);
  assert.doesNotMatch(styles, /input\[type=["']number["']\]/);
});

test("UX-02C mantiene morbilidad como nota compacta con el formulario original", async () => {
  const morbidity = await source("src/pages/MorbilidadForm.jsx");

  for (const section of ["Identidad del evento", "Evaluación", "Conducta"]) {
    assert.match(morbidity, new RegExp(section));
  }

  assert.match(morbidity, /api\.put\(`\/pacientes\/\$\{id\}\/morbilidad\/\$\{morbilidadId\}`, form/);
  assert.match(morbidity, /api\.post\(`\/pacientes\/\$\{id\}\/morbilidad`, form/);
  assert.match(morbidity, /expediente\?\.is_read_only/);
  assert.doesNotMatch(morbidity, /\bwizard\b|\btablist\b|clinicalState|caseState/i);
});

test("Vacunas conserva sus tres pasos, permisos, payload y solicitudes", async () => {
  const [vaccine, vaccineFlow] = await Promise.all([
    source("src/pages/VacunaForm.jsx"),
    source("src/components/VaccineFlow.jsx"),
  ]);

  for (const component of [
    "ClinicalWorkflowShell",
    "ClinicalSection",
    "ClinicalNotice",
    "ClinicalActionBar",
    "ClinicalLoadingSkeleton",
  ]) {
    assert.match(vaccine, new RegExp(component));
  }

  assert.match(vaccine, />Paso 1</);
  assert.match(vaccineFlow, /Paso 2 · Estado clínico/);
  assert.match(vaccine, />Paso 3</);
  assert.match(vaccine, /const requestData = buildVaccineRequestData\(form\)/);
  assert.match(vaccine, /api\.put\(`\/pacientes\/\$\{id\}\/vacunas\/\$\{vacunaId\}`, requestData/);
  assert.match(vaccine, /api\.post\(`\/pacientes\/\$\{id\}\/vacunas`, requestData/);
  assert.match(vaccine, /const canWrite = Boolean\(usuario\?\.permisos\?\.includes\(writePermission\)\)/);
  assert.match(vaccine, /const readOnly = Boolean\(expediente\?\.is_read_only \|\| pregnancyState === "cerrado" \|\| !canWrite\)/);
  assert.match(vaccine, /navigate\(expedientePath/);
});

test("UX-02C queda aislado, neutral en oscuro y adaptable hasta 320 píxeles", async () => {
  const styles = await source("src/pages/clinical-tertiary-workflows.css");

  assert.match(styles, /html\.dark \.tertiary-workflow/);
  assert.match(styles, /--tertiary-panel: #17191f/);
  assert.match(styles, /@media \(max-width: 1020px\)/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /200ms/);
  assert.match(styles, /min-width: 0/);
  assert.doesNotMatch(styles, /position:\s*(?:sticky|fixed)/);
});
