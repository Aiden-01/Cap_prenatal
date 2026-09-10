import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("antecedentes obstétricos usa un grid intrínseco y separación estructural", async () => {
  const [component, styles] = await Promise.all([
    source("src/pages/FichaRiesgo.jsx"),
    source("src/pages/clinical-secondary-workflows.css"),
  ]);

  const obstetricSection = component.slice(
    component.indexOf("<h3>Antecedentes obstétricos</h3>"),
    component.indexOf('<div className="risk-toggle-grid">', component.indexOf("<h3>Antecedentes obstétricos</h3>")),
  );
  const compactGridRule = styles.match(
    /\.secondary-workflow \.secondary-compact-grid\s*\{[\s\S]*?\}/,
  )?.[0] || "";
  const riskGroupRule = styles.match(/(?:^|\n)\.risk-factor-group\s*\{[\s\S]*?\}/)?.[0] || "";

  assert.match(obstetricSection, /className="form-section-body col-4 secondary-compact-grid"/);
  assert.match(compactGridRule, /repeat\(auto-fit, minmax\(min\(100%, 12rem\), 1fr\)\)/);
  assert.match(compactGridRule, /align-items:\s*start/);
  assert.match(compactGridRule, /row-gap:\s*1rem/);
  assert.match(riskGroupRule, /display:\s*grid/);
  assert.match(riskGroupRule, /gap:\s*0\.85rem/);
});
