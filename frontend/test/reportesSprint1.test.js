import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  getDefaultReportPeriod,
  getReportRiskLevel,
  REPORTES,
  safeDownloadFilename,
} from "../src/utils/reportes.js";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("periodo predeterminado usa el mes actual de Guatemala", () => {
  assert.deepEqual(
    getDefaultReportPeriod(new Date("2026-07-16T18:30:00Z")),
    { desde: "2026-07-01", hasta: "2026-07-16" }
  );
});

test("primer control es el reporte principal y predeterminado", async () => {
  const reportes = await source("src/pages/Reportes.jsx");
  assert.equal(REPORTES.PRIMER_CONTROL, "primer_control");
  assert.match(reportes, /useState\(REPORTES\.PRIMER_CONTROL\)/);
  assert.match(reportes, /principal: true/);
  assert.match(reportes, /Censo mensual|Captadas en primer control/);
});

test("tabla principal muestra datos nominales requeridos y no IDs tecnicos", async () => {
  const reportes = await source("src/pages/Reportes.jsx");
  for (const label of [
    "Expediente", "CUI", "Nombre completo", "Edad", "Etnia", "Comunidad",
    "FUR", "FPP", "Primer control", "Sem.", "Gestas", "Partos", "Abortos", "Riesgo",
  ]) {
    assert.ok(reportes.includes(label), `Falta columna visible: ${label}`);
  }
  assert.doesNotMatch(reportes, /<th>control_id<\/th>|<th>embarazo_id<\/th>/i);
});

test("exportaciones dependen de reportes.exportar e incluyen Excel y PDF", async () => {
  const reportes = await source("src/pages/Reportes.jsx");
  assert.match(reportes, /usuario\?\.permisos\?\.includes\("reportes\.exportar"\)/);
  assert.match(reportes, /resultado && canExport/);
  assert.match(reportes, /exportar\("excel"\)/);
  assert.match(reportes, /exportar\("pdf"\)/);
  assert.match(reportes, /response\.headers\["content-disposition"\]/);
});

test("cambio de reporte cancela solicitudes y limpia resultados anteriores", async () => {
  const reportes = await source("src/pages/Reportes.jsx");
  assert.match(reportes, /requestRef\.current\?\.abort\(\)/);
  assert.match(reportes, /setResultado\(null\)/);
  assert.match(reportes, /if \(loading\) return/);
  for (const endpoint of [
    "/reportes/censo", "/reportes/proximas-a-parir", "/reportes/sin-control-reciente",
    "/reportes/pacientes-riesgo", "/reportes/resumen-comunidades",
  ]) assert.ok(reportes.includes(endpoint));
});

test("seguimiento sin control separa nunca atendidas y controles atrasados", async () => {
  const reportes = await source("src/pages/Reportes.jsx");
  assert.match(reportes, /Nunca han tenido control/);
  assert.match(reportes, /Control atrasado/);
  assert.match(reportes, /estado_seguimiento === "nunca_control"/);
  assert.match(reportes, /estado_seguimiento === "control_atrasado"/);
});

test("riesgo visual mantiene clasificacion existente", () => {
  assert.equal(getReportRiskLevel({ tiene_riesgo: true, edad: 25 }), "alto");
  assert.equal(getReportRiskLevel({ tiene_riesgo: false, edad: 19 }), "medio");
  assert.equal(getReportRiskLevel({ tiene_riesgo: false, edad: 35 }), "bajo");
  assert.equal(getReportRiskLevel({ nivel_riesgo: "ALTO", edad: 35 }), "alto");
});

test("nombre de descarga respeta cabecera y elimina rutas o controles", () => {
  assert.equal(
    safeDownloadFilename('attachment; filename="censo_2026.pdf"', "fallback.pdf"),
    "censo_2026.pdf"
  );
  assert.equal(
    safeDownloadFilename('attachment; filename="..\\reporte\n.pdf"', "fallback.pdf"),
    "..-reporte-.pdf"
  );
});

test("dashboard muestra embarazos activos y no renombra pacientes historicas", async () => {
  const dashboard = await source("src/pages/Dashboard.jsx");
  assert.match(dashboard, /label="Embarazos activos"/);
  assert.match(dashboard, /value=\{stats\?\.embarazos_activos\}/);
  assert.doesNotMatch(dashboard, /label="Total de pacientes"[\s\S]{0,100}value=\{stats\?\.total_pacientes\}/);
});
