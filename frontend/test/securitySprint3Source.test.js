import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("el expediente conserva GET de lectura y usa POST explicito para crear embarazo", async () => {
  const expediente = await source("src/pages/ExpedientePaciente.jsx");

  assert.match(expediente, /api\.get\(`\/pacientes\/\$\{id\}\/expediente`/);
  assert.match(expediente, /api\.post\(`\/pacientes\/\$\{id\}\/embarazos`/);
  assert.match(expediente, /creatingPregnancy/);
  assert.match(expediente, /Sin embarazo registrado/);
  assert.match(expediente, /disabled=\{printing \|\| !hasEmbarazo\}/);
  assert.match(expediente, /canCreatePregnancy\(exp, puedeEditarPacientes\)/);
  assert.match(expediente, /Complete y cierre el puerperio antes de registrar un embarazo nuevo\./);
  assert.match(expediente, /hasEmbarazo && puedeCrearEmbarazo/);
  assert.doesNotMatch(expediente, /Esto cerrara el embarazo activo/);

  // Esta llamada literal tambien forma parte del contrato seguro del chatbot.
  assert.match(expediente, /setPregnancyStatus\(estadoEmbarazo\)/);
});

test("las defensas frontend no navegan ni escriben con embarazo_id ausente", async () => {
  const [timeline, control, pacientes] = await Promise.all([
    source("src/components/TimelineControles.jsx"),
    source("src/pages/NuevoControl.jsx"),
    source("src/pages/Pacientes.jsx"),
  ]);

  assert.match(timeline, /!isReadOnly && puedeCrear && hasEmbarazoId/);
  assert.match(timeline, /encodeURIComponent\(embarazoId\)/);
  assert.match(control, /if \(!hasEmbarazoId\)/);
  assert.match(control, /Selecciona un embarazo antes de guardar el control/);
  assert.match(pacientes, /"sin embarazo"/i);
});

test("Axios mantiene CSRF automatico para el POST explicito", async () => {
  const axiosSource = await source("src/api/axios.js");

  assert.match(axiosSource, /\["post", "put", "patch", "delete"\]\.includes\(method\)/);
  assert.match(axiosSource, /config\.headers\["X-CSRF-Token"\]/);
});
