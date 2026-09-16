import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

test("declares the real mobile viewport", () => {
  assert.match(
    html,
    /<meta\s+name=["']viewport["']\s+content=["']width=device-width,\s*initial-scale=1\.0["']\s*\/?>/i,
  );
});

test("keeps shared mobile controls and overlays usable", () => {
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*font-size:\s*16px/);
  assert.match(css, /max-height:\s*calc\(100dvh - 1rem\)/);
  assert.match(css, /\.content-tabs\s*\{[\s\S]*overflow-x:\s*auto/);
});

test("keeps native date controls inside their responsive field columns", () => {
  assert.match(css, /\.form-group\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
  assert.match(
    css,
    /input\[type=["']date["']\]\.input-field\s*\{[\s\S]*?inline-size:\s*100%;[\s\S]*?min-inline-size:\s*0;[\s\S]*?max-inline-size:\s*100%;/,
  );
  assert.match(
    css,
    /@supports \(-webkit-touch-callout:\s*none\)[\s\S]*?input\[type=["']date["']\]\.input-field\s*\{[\s\S]*?width:\s*-webkit-fill-available;[\s\S]*?-webkit-appearance:\s*none;/,
  );
  assert.match(css, /::-webkit-date-and-time-value\s*\{[\s\S]*?min-width:\s*0;/);
});
