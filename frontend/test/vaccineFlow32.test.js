import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("fecha visible y payload comparten fecha_dosis como única fuente", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  assert.match(form, /name="fecha_dosis"/);
  assert.match(form, /value=\{form\.fecha_dosis\}/);
  assert.match(form, /fecha_dosis: normalizeVaccineDate\(value\)/);
  assert.match(form, /const requestData = buildVaccineRequestData\(form\)/);
  assert.doesNotMatch(form, /fecha_dosis:\s*form\.fecha\b/);
});

test("cambiar vacuna, dosis o momento conserva la fecha controlada", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const vaccineChange = form.slice(form.indexOf("const selectVaccine"), form.indexOf("const selectDose"));
  const doseChange = form.slice(form.indexOf("const selectDose"), form.indexOf("const selectMoment"));
  const momentChange = form.slice(form.indexOf("const selectMoment"), form.indexOf("const setApplicationDate"));
  for (const change of [vaccineChange, doseChange, momentChange]) {
    assert.match(change, /\.\.\.current/);
    assert.doesNotMatch(change, /fecha_dosis:\s*""/);
  }
});

test("prevalidación de intervalo abre diálogo antes de cualquier solicitud", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const start = form.indexOf("const submit = async");
  const end = form.indexOf("if (initialLoading)", start);
  const submit = form.slice(start, end);
  assert.match(submit, /if \(preflightClinicalAlert\)/);
  assert.match(submit, /setClinicalAlert\(preflightClinicalAlert\)/);
  assert.ok(submit.indexOf("setClinicalAlert(preflightClinicalAlert)") < submit.indexOf("api.put"));
  assert.ok(submit.indexOf("setClinicalAlert(preflightClinicalAlert)") < submit.indexOf("api.post"));
});

test("rechazo estructurado reutiliza el mismo diálogo clínico", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const errors = await source("src/utils/vaccineError.js");
  assert.match(form, /if \(presentation\.clinicalAlert\)/);
  assert.match(form, /setClinicalAlert\(presentation\.clinicalAlert\)/);
  assert.match(errors, /createIntervalClinicalAlert/);
  assert.match(errors, /TDAP_BEFORE_20_WEEKS/);
  assert.match(errors, /TD_POSITION_ALREADY_EXISTS/);
  assert.match(errors, /SPR_SR_DURING_PREGNANCY/);
  assert.match(errors, /VACCINE_MOMENT_DATE_MISMATCH/);
  assert.match(form, /maximumSchemeReached/);
  assert.match(form, /createVaccineClinicalAlert\("Esquema completado"/);
});

test("diálogo es accesible, atrapa foco y lo devuelve al botón de registro", async () => {
  const dialog = await source("src/components/VaccineClinicalDialog.jsx");
  const form = await source("src/pages/VacunaForm.jsx");
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /actionRef\.current\?\.focus\(\)/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /returnFocusTarget/);
  assert.match(dialog, />Entendido</);
  assert.match(form, /ref=\{submitButtonRef\}/);
  assert.match(form, /returnFocusRef=\{submitButtonRef\}/);
});

test("modal y advertencia preventiva funcionan desde 320 píxeles sin desbordamiento", async () => {
  const css = await source("src/index.css");
  const components = await source("src/components/VaccineFlow.jsx");
  assert.match(components, /Intervalo pendiente/);
  assert.match(css, /\.vaccine-dialog-backdrop\s*\{[\s\S]*?z-index:\s*12000/);
  assert.match(css, /\.vaccine-clinical-dialog\s*\{[\s\S]*?max-width:\s*100%[\s\S]*?overflow-x:\s*hidden/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.vaccine-clinical-dialog-facts\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("creación y edición regresan al menú canónico con reemplazo y confirmación", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const record = await source("src/pages/ExpedientePaciente.jsx");
  assert.match(form, /expedientePath = `\/pacientes\/\$\{id\}\?embarazo_id=\$\{embarazoId\}&tab=vacunas`/);
  assert.match(form, /navigate\(expedientePath, \{[\s\S]*?replace: true/);
  assert.match(form, /editando[\s\S]*?Aplicación actualizada correctamente/);
  assert.match(form, /vaccineNotice: \{ message, recommendationMessage \}/);
  assert.match(record, /useLocation/);
  assert.match(record, /className="vaccine-return-notice"/);
  assert.match(record, /vaccineNotice\.recommendationMessage/);
  assert.match(record, /api\.get\(`\/pacientes\/\$\{id\}\/expediente`/);
});

test("campos simples enfocan el primer control inválido sin deshabilitar silenciosamente", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  assert.match(form, /firstMissingVaccineField\(form\)/);
  assert.match(form, /focusVaccineField\(missing\.field\)/);
  assert.match(form, /noValidate/);
  assert.match(form, /disabled=\{loading \|\| initialLoading \|\| readOnly\}/);
  assert.doesNotMatch(form, /disabled=\{!canSubmit\}/);
});
