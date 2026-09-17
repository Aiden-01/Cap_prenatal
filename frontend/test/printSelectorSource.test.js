import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Expediente abre el selector central y retira impresiones distribuidas", async () => {
  const source = await fs.readFile(path.join(__dirname, "../src/pages/ExpedientePaciente.jsx"), "utf8");
  const plan = await fs.readFile(path.join(__dirname, "../src/pages/PlanPartoForm.jsx"), "utf8");
  const risk = await fs.readFile(path.join(__dirname, "../src/pages/FichaRiesgo.jsx"), "utf8");
  const styles = await fs.readFile(path.join(__dirname, "../src/index.css"), "utf8");
  assert.match(source, /onClick=\{\(\) => setPrintModalOpen\(true\)\}/);
  assert.match(source, /<PrintDocumentsModal/);
  assert.match(source, /documentos\/pdf/);
  assert.doesNotMatch(source, /imprimirFichaMspas|imprimirFichaRiesgo|imprimirPlanParto/);
  assert.equal((source.match(/>Imprimir</g) || []).length, 0);
  assert.doesNotMatch(plan, />Imprimir</);
  assert.doesNotMatch(risk, />Imprimir</);
  assert.match(styles, /\.print-modal-body \{[^}]*overflow-y: auto/);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*?max-height: 100dvh/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});
