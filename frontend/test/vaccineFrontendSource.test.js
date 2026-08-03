import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

async function sourceFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);
    return entry.isDirectory() ? sourceFiles(url) : [url];
  }));
  return nested.flat().filter((url) => /\.(?:js|jsx|css)$/.test(url.pathname));
}

test("fuente frontend no contiene el tipo combinado obsoleto", async () => {
  const obsoleteCombinedType = ["td", "tdap"].join("_");
  const files = await sourceFiles(new URL("../src/", import.meta.url));
  const contents = await Promise.all(files.map(async (url) => [url.pathname, await readFile(url, "utf8")]));
  assert.deepEqual(contents.filter(([, content]) => content.includes(obsoleteCombinedType)).map(([path]) => path), []);
});

test("textos visibles del flujo no usan lenguaje técnico", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const components = await source("src/components/VaccineFlow.jsx");
  const dialog = await source("src/components/VaccineClinicalDialog.jsx");
  for (const visibleSource of [form, components, dialog]) {
    assert.doesNotMatch(visibleSource, /backend/i);
    assert.doesNotMatch(visibleSource, /endpoint/i);
    assert.doesNotMatch(visibleSource, /payload/i);
    assert.doesNotMatch(visibleSource, /validación del servidor/i);
    assert.doesNotMatch(visibleSource, /secuencia técnica/i);
  }
  assert.match(form, /La información será verificada al guardar/);
});

test("usuario selecciona posición visual sin campo numérico libre", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const components = await source("src/components/VaccineFlow.jsx");
  const formState = await source("src/utils/vaccineFormState.js");
  assert.match(components, /function DoseSelector/);
  assert.match(components, /aria-label="Posición de dosis"/);
  assert.match(components, /role="radio"/);
  assert.match(components, /Selecciona la dosis según el carné o antecedente disponible/);
  assert.match(form, /buildVaccineRequestData\(form\)/);
  assert.match(formState, /numero_dosis: form\.tipo_vacuna === VACCINE_TYPES\.INFLUENZA/);
  assert.match(formState, /\? 1\s*: Number\(form\.numero_dosis\)/);
  assert.doesNotMatch(form, /type="number"/);
});

test("sugerencia clínica no impone la posición y permite historias parciales", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const components = await source("src/components/VaccineFlow.jsx");
  assert.match(components, /Sugerida según el historial/);
  assert.match(components, /unavailablePositions/);
  assert.match(form, /firstAvailablePosition/);
  assert.match(form, /setForm\(\(current\) => \(\{ \.\.\.current, numero_dosis: dose \}\)\)/);
  assert.match(form, /Las dosis anteriores no constan en el sistema/);
});

test("usuario selecciona uno de tres momentos y se conserva en la solicitud", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const components = await source("src/components/VaccineFlow.jsx");
  const schedule = await source("src/utils/vaccineSchedule.js");
  const formState = await source("src/utils/vaccineFormState.js");
  assert.match(components, /function MomentSelector/);
  assert.match(schedule, /value: VACCINE_MOMENTS\.BEFORE_PREGNANCY/);
  assert.match(schedule, /value: VACCINE_MOMENTS\.DURING_PREGNANCY/);
  assert.match(schedule, /value: VACCINE_MOMENTS\.POSTPARTUM/);
  assert.match(form, /buildVaccineRequestData\(form\)/);
  assert.match(formState, /momento: form\.momento/);
  assert.doesNotMatch(form, /deriveVaccineMoment/);
  assert.doesNotMatch(components, />No</);
});

test("Tdap previa se explica como antecedente que no consume la aplicación actual", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  assert.match(form, /quedará como antecedente previo/);
  assert.match(form, /no consumirá la aplicación correspondiente al embarazo actual/);
  assert.match(form, /currentTdapExists/);
  assert.match(form, /relatedPriorTdapExists/);
});

test("recomendación usa posición seleccionada y posiciones existentes", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  assert.match(form, /getAppointmentRecommendation\([\s\S]*?selectedDose/);
  assert.match(form, /existingPositions: selectableStatus\?\.registeredPositions/);
  assert.match(form, /existingPositions: acceptedPositions/);
});

test("historial muestra momento, relación y huecos documentales", async () => {
  const expediente = await source("src/pages/ExpedientePaciente.jsx");
  const components = await source("src/components/VaccineFlow.jsx");
  assert.match(expediente, /function VaccineSchemeSummary/);
  assert.match(expediente, /No registrada en el sistema/);
  assert.match(expediente, /data-label="Momento"/);
  assert.match(expediente, /vaccineMomentLabel\(v\.momento\)/);
  assert.match(expediente, /data-label="Relación"/);
  assert.match(components, /No registrada en el sistema/);
  assert.match(components, /vaccineMomentLabel\(record\.momento\)/);
});

test("edición espera respuesta exitosa y permite cambiar posición y momento", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const submitBlock = form.match(/const submit = async \(event\) => \{[\s\S]*?\n {2}\};/)?.[0] || "";
  assert.match(submitBlock, /await api\.put/);
  assert.match(submitBlock, /const accepted = response\.data/);
  assert.match(submitBlock, /clinicalDateFromRecord\(accepted\)/);
  assert.match(form, /modificar la fecha, posición o momento puede alterar la cronología/);
  assert.match(form, /getVaccineErrorPresentation\(error\)/);
});

test("controles y mensajes se reorganizan sin desbordamiento desde 320 píxeles", async () => {
  const css = await source("src/index.css");
  const vaccineStyles = css.indexOf(".vaccine-form-page");
  const mobileStart = css.indexOf("@media (max-width: 720px)", vaccineStyles);
  const mobileEnd = css.indexOf("@media (max-width: 420px)", mobileStart);
  const mobile = css.slice(mobileStart, mobileEnd);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(mobile, /\.vaccines-table-wrap\s*\{[\s\S]*?overflow: visible/);
  assert.match(mobile, /\.vaccine-moment-grid[\s\S]*?grid-template-columns: 1fr/);
  assert.match(css.slice(mobileEnd), /\.vaccine-dose-grid\s*\{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(mobile, /content: attr\(data-label\)/);
});
