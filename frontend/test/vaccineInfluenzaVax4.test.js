import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Influenza presenta una aplicación simple sin selector de dosis", async () => {
  const form = await source("src/pages/VacunaForm.jsx");
  const flow = await source("src/components/VaccineFlow.jsx");
  const schedule = await source("src/utils/vaccineSchedule.js");
  assert.match(form, /!isInfluenza \? \([\s\S]*?<DoseSelector/);
  assert.match(flow, /<h2>Influenza<\/h2>/);
  assert.match(flow, /Registra la aplicación que consta en el carné o antecedente de la paciente\./);
  assert.match(schedule, /simpleApplication: true/);
  assert.match(schedule, /sequence: Object\.freeze\(\[\]\)/);

  const forbiddenDose = ["Dosis", "1"].join(" ");
  const forbiddenCampaign = ["Dosis", "de", "la", "temporada"].join(" ");
  const influenzaBlock = schedule.slice(
    schedule.indexOf("value: VACCINE_TYPES.INFLUENZA"),
    schedule.indexOf("value: VACCINE_TYPES.SPR_SR")
  );
  assert.doesNotMatch(influenzaBlock, new RegExp(forbiddenDose));
  assert.doesNotMatch(influenzaBlock, new RegExp(forbiddenCampaign, "i"));
});

test("formulario envía el valor interno sin exponerlo y conserva momento y fecha", async () => {
  const formState = await source("src/utils/vaccineFormState.js");
  const form = await source("src/pages/VacunaForm.jsx");
  assert.match(formState, /form\.tipo_vacuna === VACCINE_TYPES\.INFLUENZA[\s\S]*?\? 1/);
  assert.match(form, /<MomentSelector/);
  assert.match(form, /name="fecha_dosis"/);
  assert.match(form, /value=\{form\.fecha_dosis\}/);
  assert.match(form, /Aplicación de Influenza registrada correctamente\./);
  assert.match(form, /replace: true/);
  assert.match(form, /tab=vacunas/);
});

test("Influenza no genera cita, intervalo ni estado de esquema", async () => {
  const schedule = await source("src/utils/vaccineSchedule.js");
  const flow = await source("src/components/VaccineFlow.jsx");
  const specialStatus = schedule.slice(
    schedule.indexOf("if (type === VACCINE_TYPES.INFLUENZA)"),
    schedule.indexOf("const schemeApplications")
  );
  assert.match(specialStatus, /completed: applications\.length/);
  assert.match(specialStatus, /nextDose: null/);
  assert.match(specialStatus, /nextAppointment: null/);
  const simpleCard = flow.slice(
    flow.indexOf("if (type === VACCINE_TYPES.INFLUENZA)"),
    flow.indexOf("const pregnancyState")
  );
  assert.doesNotMatch(simpleCard, /AppointmentCard|ProgressSteps|Esquema/);
});

test("historial muestra cada Influenza separada con fecha, momento y origen", async () => {
  const flow = await source("src/components/VaccineFlow.jsx");
  const schedule = await source("src/utils/vaccineSchedule.js");
  const expediente = await source("src/pages/ExpedientePaciente.jsx");
  assert.match(flow, /status\.applications\.map\(\(record\)/);
  assert.match(flow, /key=\{record\.id\}/);
  assert.match(flow, /vaccineMomentLabel\(record\.momento\)/);
  assert.match(flow, /recordOrigin\(record, pregnancy\)/);
  assert.match(schedule, /Aplicación de Influenza/);
  assert.match(expediente, /vaccineLabel\(v\.tipo_vacuna\)/);
  assert.match(expediente, /vaccineDoseLabel\(v\.tipo_vacuna, v\.numero_dosis\)/);
});

test("flujo simple conserva responsive a 320 píxeles", async () => {
  const css = await source("src/index.css");
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /\.vaccine-form-page/);
  assert.match(css, /\.vaccine-moment-grid/);
});
