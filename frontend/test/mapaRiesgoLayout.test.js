import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = () => readFile(new URL("../src/pages/MapaRiesgo.jsx", import.meta.url), "utf8");

function cssRule(styles, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\}`))?.[0] || "";
}

test("el mapa de riesgo completa el shell mediante una cadena flex", async () => {
  const component = await source();
  const shellRule = cssRule(component, ".mapa-riesgo-map-shell");
  const mapRule = cssRule(component, ".mapa-riesgo-map");

  assert.match(shellRule, /display:\s*flex/);
  assert.match(shellRule, /flex-direction:\s*column/);
  assert.match(mapRule, /flex:\s*1/);
  assert.match(mapRule, /min-height:\s*0/);
  assert.doesNotMatch(mapRule, /height:\s*100%/);
  assert.doesNotMatch(mapRule, /min-height:\s*620px/);
});
