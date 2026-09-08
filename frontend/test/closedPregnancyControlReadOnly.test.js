import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  canCreatePrenatalControl,
  canConsultPrenatalControl,
  canEditPrenatalControl,
  prenatalControlDetailPath,
} from "../src/utils/prenatalControlAccess.js";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const controlContext = {
  canRead: true,
  pacienteId: 41,
  embarazoId: 88,
  controlId: 201,
};

for (const [estado, permitido] of [
  ["activo", true],
  ["puerperio", false],
  ["cerrado", false],
]) {
  test(`crear control prenatal en embarazo ${estado}: ${permitido ? "permitido" : "rechazado"}`, () => {
    assert.equal(canCreatePrenatalControl({
      canWrite: true,
      pregnancyState: estado,
      pregnancyId: 88,
    }), permitido);
  });
}

test("crear control activo tambien exige permiso e identificador de embarazo", () => {
  assert.equal(canCreatePrenatalControl({
    canWrite: false,
    pregnancyState: "activo",
    pregnancyId: 88,
  }), false);
  assert.equal(canCreatePrenatalControl({
    canWrite: true,
    pregnancyState: "activo",
    pregnancyId: null,
  }), false);
});

for (const estado of ["activo", "puerperio", "cerrado"]) {
  test(`separa consulta y edicion del control en embarazo ${estado}`, () => {
    const puedeConsultar = canConsultPrenatalControl(controlContext);
    const puedeEditar = canEditPrenatalControl({
      canConsult: puedeConsultar,
      canWrite: true,
      isReadOnly: estado === "cerrado",
    });

    assert.equal(puedeConsultar, true);
    assert.equal(puedeEditar, estado !== "cerrado");
  });
}

test("la consulta exige lectura e identificadores validos", () => {
  assert.equal(canConsultPrenatalControl({ ...controlContext, canRead: false }), false);
  assert.equal(canConsultPrenatalControl({ ...controlContext, embarazoId: 0 }), false);
  assert.equal(canConsultPrenatalControl({ ...controlContext, controlId: "otro" }), false);
  assert.equal(canEditPrenatalControl({ canConsult: true, canWrite: false, isReadOnly: false }), false);
});

test("la ruta de detalle conserva el embarazo historico seleccionado", () => {
  assert.equal(
    prenatalControlDetailPath(controlContext),
    "/pacientes/41/controles/201/editar?embarazo_id=88"
  );
  assert.equal(prenatalControlDetailPath({ ...controlContext, embarazoId: "" }), null);
});

test("Abrir navega por permiso de consulta sin depender del acordeon ni de edicion", async () => {
  const timeline = await source("src/components/TimelineControles.jsx");
  const openHandler = timeline.match(/const openControl = \(\) => \{[\s\S]*?\n {2}\};/)?.[0] || "";

  assert.match(openHandler, /if \(!puedeConsultar\) return;/);
  assert.match(openHandler, /navigate\(prenatalControlDetailPath/);
  assert.doesNotMatch(openHandler, /onToggle|puedeEditar|isReadOnly/);
  assert.match(timeline, /onClick=\{onToggle\}/);
  assert.match(timeline, /isOpen=\{expandedId === control\.id\}/);
  assert.match(timeline, /disabled=\{!puedeConsultar\}/);
});

test("el detalle cerrado carga el GET y muestra el formulario en solo lectura", async () => {
  const detail = await source("src/pages/NuevoControl.jsx");
  const workflow = await source("src/components/clinical/ClinicalWorkflow.jsx");

  assert.match(detail, /api\.get\(`\/pacientes\/\$\{id\}\/controles\/\$\{controlId\}`/);
  assert.match(detail, /const readOnly = Boolean\(expediente\?\.is_read_only\)/);
  assert.match(detail, /if \(readOnly && !editando\)/);
  assert.match(detail, /setForm\(parseControl\(data\)\)/);
  assert.match(detail, /disabled=\{soloLectura\}/);
  assert.match(detail, /workflowMode = soloLectura \? "readonly"/);
  assert.match(workflow, /readonly: "Solo lectura"/);
  assert.match(detail, /\{puedeGuardar && \(/);
  assert.match(detail, /\{soloLectura \? "Volver" : "Cancelar"\}/);
  assert.doesNotMatch(detail, />\s*Eliminar\s*</);
});

test("el expediente entrega permisos separados de lectura y creacion", async () => {
  const expediente = await source("src/pages/ExpedientePaciente.jsx");

  assert.match(expediente, /puedeConsultarControles.*"pacientes\.ver"/);
  assert.match(expediente, /puedeCrearControles.*"controles\.crear"/);
  assert.match(expediente, /puedeConsultar=\{puedeConsultarControles\}/);
  assert.match(expediente, /puedeCrear=\{puedeCrearControles\}/);
  assert.match(expediente, /estadoEmbarazo=\{estadoEmbarazo\}/);
  assert.match(expediente, /const puedeRegistrarPrenatal = canCreatePrenatalControl/);
});

test("TimelineControles no ofrece el primer control sin embarazo activo", async () => {
  const timeline = await source("src/components/TimelineControles.jsx");

  assert.match(timeline, /const puedeRegistrar = canCreatePrenatalControl/);
  assert.match(timeline, /pregnancyState: estadoEmbarazo/);
  assert.match(timeline, /!isReadOnly && puedeRegistrar && hasEmbarazoId/);
});

test("la ruta directa de nuevo control rechaza puerperio sin afectar la edicion", async () => {
  const detail = await source("src/pages/NuevoControl.jsx");

  assert.match(detail, /const puedeCrear = canCreatePrenatalControl/);
  assert.match(detail, /if \(!editando && selectedState !== "activo"\)/);
  assert.match(detail, /Los controles prenatales nuevos solo se registran en un embarazo activo/);
  assert.match(detail, /const puedeGuardar = editando \? puedeEditar : puedeCrear/);
  assert.match(detail, /await api\.put\(`\/pacientes\/\$\{id\}\/controles\/\$\{controlId\}`/);
});
