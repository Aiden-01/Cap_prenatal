import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

test("los dos factores por edad son automáticos y los demás permanecen manuales", async () => {
  const source = await fs.readFile(path.join(dirname, "../src/pages/FichaRiesgo.jsx"), "utf8");
  const styles = await fs.readFile(path.join(dirname, "../src/pages/clinical-secondary-workflows.css"), "utf8");
  assert.match(source, /<Toggle label="Menor de 20 años" name="menor_20_anos" automatic \{\.\.\.automaticP\}/);
  assert.match(source, /<Toggle label="Mayor de 35 años" name="mayor_35_anos" automatic \{\.\.\.automaticP\}/);
  assert.match(source, /disabled=\{automatic\}/);
  assert.match(source, /delete payload\.menor_20_anos/);
  assert.match(source, /delete payload\.mayor_35_anos/);
  assert.match(source, /<Toggle label="Anemia" name="anemia" \{\.\.\.p\} \/>/);
  assert.match(source, /val \? "Automático" : "Según edad"/);
  assert.match(styles, /\.toggle-control\.is-automatic\.is-on/);
  assert.match(styles, /@media \(max-width: 390px\)[\s\S]*?\.toggle-automatic/);
  assert.match(source, /deriveAgeRiskFactors\(paciente\?\.fecha_nacimiento, form\.fecha\)/);
  assert.doesNotMatch(source, /function calcularEdadAnios/);
});
