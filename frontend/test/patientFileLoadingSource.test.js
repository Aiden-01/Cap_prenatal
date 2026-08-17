import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("la animación abre el expediente mientras carga la misma petición", async () => {
  const pacientes = await source("src/pages/Pacientes.jsx");
  const handlerStart = pacientes.indexOf("const openPatientFile = async");
  const handlerEnd = pacientes.indexOf("const totalPaginas", handlerStart);
  const handler = pacientes.slice(handlerStart, handlerEnd);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(handler, /Promise\.allSettled\(\[/);
  assert.match(handler, /api\.get\(`\/pacientes\/\$\{patient\.id\}\/expediente`\)/);
  assert.equal(handler.match(/api\.get\(`\/pacientes\/\$\{patient\.id\}\/expediente`\)/g)?.length, 1);
  assert.match(handler, /openingPatientRequestRef\.current !== null/);
  assert.match(handler, /openingPatientRequestRef\.current = patient\.id/);
  assert.match(handler, /const transitionDuration = prefersReducedMotion \? 0 : PATIENT_FILE_TRANSITION_MS/);
  assert.match(handler, /window\.setTimeout\(resolve, transitionDuration\)/);
  assert.match(handler, /patientFilePrefetch:/);
  assert.match(handler, /data: expedienteResult\.value\.data/);
  assert.match(handler, /toast\(EXPEDIENTE_LOAD_ERROR, "error"\)/);
  assert.doesNotMatch(handler, /useEffect/);
});

test("el expediente consume la precarga y conserva la carga de acceso directo", async () => {
  const expediente = await source("src/pages/ExpedientePaciente.jsx");

  assert.match(expediente, /getPatientFilePrefetch\(location\.state, id, selectedEmbarazoId\)/);
  assert.match(expediente, /useState\(\(\) => initialFilePrefetch\?\.data \|\| null\)/);
  assert.match(expediente, /useState\(\(\) => initialFilePrefetch \? requestKey : ""\)/);
  assert.match(expediente, /initialFilePrefetch\?\.status === "rejected" \? EXPEDIENTE_LOAD_ERROR : ""/);
  assert.match(expediente, /if \(loadedRequestKey === requestKey\) return undefined;/);
  assert.match(expediente, /api\.get\(`\/pacientes\/\$\{id\}\/expediente`/);
  assert.match(expediente, /Cargando expediente\.\.\./);
});
