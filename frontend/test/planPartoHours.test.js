import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("plan de parto admite distancias expresadas en fracciones de hora", async () => {
  const form = await source("src/pages/PlanPartoForm.jsx");
  const hoursInput = form.match(
    /<Input\s+[\s\S]*?name="horas_distancia"[\s\S]*?\/>/
  )?.[0] || "";

  assert.match(hoursInput, /type="number"/);
  assert.match(hoursInput, /min="0"/);
  assert.match(hoursInput, /max="72"/);
  assert.match(hoursInput, /step="0\.1"/);
  assert.match(hoursInput, /inputMode="decimal"/);
});
