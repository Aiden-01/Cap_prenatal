import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
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

  assert.match(detail, /api\.get\(`\/pacientes\/\$\{id\}\/controles\/\$\{controlId\}`/);
  assert.match(detail, /const readOnly = Boolean\(expediente\?\.is_read_only\)/);
  assert.match(detail, /if \(readOnly && !editando\)/);
  assert.match(detail, /setForm\(parseControl\(data\)\)/);
  assert.match(detail, /disabled=\{soloLectura\}/);
  assert.match(detail, /Solo lectura/);
  assert.match(detail, /\{puedeEditar && \(/);
  assert.match(detail, /\{soloLectura \? "Volver" : "Cancelar"\}/);
  assert.doesNotMatch(detail, />\s*Eliminar\s*</);
});

test("el expediente entrega permisos separados de lectura y creacion", async () => {
  const expediente = await source("src/pages/ExpedientePaciente.jsx");

  assert.match(expediente, /puedeConsultarControles.*"pacientes\.ver"/);
  assert.match(expediente, /puedeCrearControles.*"controles\.crear"/);
  assert.match(expediente, /puedeConsultar=\{puedeConsultarControles\}/);
  assert.match(expediente, /puedeCrear=\{puedeCrearControles\}/);
});
