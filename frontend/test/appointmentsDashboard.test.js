import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, "..");
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");

test("dashboard usa identidad de cita, conserva contrato visible y ofrece acciones autorizadas", async () => {
  const source = await read("src/pages/Dashboard.jsx");
  assert.match(source, /key=\{c\.cita_id\}/);
  assert.match(source, /appointment\.cita_id/);
  assert.match(source, /appointment\.embarazo_id/);
  assert.match(source, /c\.cita_siguiente/);
  assert.match(source, /usuario\?\.permisos\?\.includes\("controles\.editar"\)/);
  assert.match(source, /> Reprogramar/);
  assert.match(source, /> Cancelar/);
  assert.match(source, /Ver expediente/);
  assert.match(source, /Citas en los próximos 7 días/);
});

test("acciones llaman los endpoints anidados y refrescan inmediatamente", async () => {
  const source = await read("src/pages/Dashboard.jsx");
  assert.match(source, /`\/pacientes\/\$\{appointment\.id\}\/citas\/\$\{appointment\.cita_id\}\/\$\{mode\}\?embarazo_id=\$\{appointment\.embarazo_id\}`/);
  assert.match(source, /api\.patch\(endpoint, mode === "reprogramar"/);
  assert.match(source, /await loadStats\(\)/);
  assert.match(source, /Cita reprogramada correctamente/);
  assert.match(source, /Cita cancelada correctamente/);
  assert.match(source, /No fue posible actualizar la cita/);
});

test("dashboard cubre loading, error recuperable y estado vacio", async () => {
  const source = await read("src/pages/Dashboard.jsx");
  assert.match(source, /Cargando estadísticas/);
  assert.match(source, /role="alert"/);
  assert.match(source, />Reintentar</);
  assert.match(source, /No hay citas programadas para los próximos 7 días/);
});

test("dialogo distingue reprogramar de cancelar y valida la nueva fecha", async () => {
  const source = await read("src/components/AppointmentActionDialog.jsx");
  assert.match(source, /Reprogramar cita/);
  assert.match(source, /Cancelar cita/);
  assert.match(source, /La nueva fecha debe ser diferente/);
  assert.match(source, /type="date"/);
  assert.match(source, /min=\{todayGuatemala\(\)\}/);
  assert.match(source, /required/);
  assert.match(source, /Confirmar nueva fecha/);
  assert.match(source, /El registro permanecerá en el historial/);
  assert.match(source, />\s*Volver\s*</);
  assert.match(source, /: "Cancelar cita"/);
});

test("dialogo implementa accesibilidad de teclado, foco y estados", async () => {
  const source = await read("src/components/AppointmentActionDialog.jsx");
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby=\{titleId\}/);
  assert.match(source, /aria-describedby=\{descriptionId\}/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /event\.shiftKey/);
  assert.match(source, /requestAnimationFrame\(\(\) => returnFocusTarget\?\.focus\(\)\)/);
  assert.match(source, /aria-invalid/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-busy=\{busy\}/);
});

test("estilos de citas responden a móvil, foco, tema y movimiento reducido", async () => {
  const css = await read("src/index.css");
  assert.match(css, /\.appointment-actions/);
  assert.match(css, /\.appointment-action-button:focus-visible/);
  assert.match(css, /\.appointment-dialog-backdrop/);
  assert.match(css, /background: var\(--surface\)/);
  assert.match(css, /color: var\(--text\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.appointment-dialog-actions > button/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.appointment-action-button/);
});
