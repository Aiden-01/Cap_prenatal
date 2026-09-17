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

test("mobile navigation toggle morphs, closes on a second press and respects reduced motion", () => {
  const layout = readFileSync(new URL("../src/components/Layout.jsx", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("../src/components/Sidebar.jsx", import.meta.url), "utf8");

  assert.match(layout, /setMenuOpen\(\(open\) => !open\)/);
  assert.match(layout, /aria-expanded=\{menuOpen\}/);
  assert.match(layout, /mobile-menu-toggle \$\{menuOpen \? "is-open" : ""\}/);
  assert.match(sidebar, /\{!isMobile && <button/);
  assert.match(sidebar, /className="sidebar-mobile-overlay"[\s\S]*?aria-hidden="true"/);
  assert.match(sidebar, /onClick=\{\(\) => setMenuOpen\(false\)\}/);
  assert.match(css, /\.mobile-menu-toggle\.is-open\s*\{[\s\S]*?border-radius:[\s\S]*?transform:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.mobile-menu-toggle/);
});

test("mobile sidebar reserves a safe-area-aware structural slot above navigation", () => {
  const sidebar = readFileSync(new URL("../src/components/Sidebar.jsx", import.meta.url), "utf8");

  assert.match(sidebar, /isMobile && <div className="mobile-sidebar-toggle-slot" aria-hidden="true"/);
  assert.match(sidebar, /<nav className="sidebar-nav"/);
  assert.match(css, /--mobile-sidebar-toggle-size:\s*44px/);
  assert.match(css, /--mobile-sidebar-toggle-gap:\s*14px/);
  assert.match(css, /\.mobile-menu-toggle\s*\{[\s\S]*?top:\s*max\(14px, env\(safe-area-inset-top\)\)/);
  assert.match(
    css,
    /@media \(max-width: 767px\)[\s\S]*?\.mobile-sidebar-toggle-slot\s*\{[\s\S]*?height:\s*calc\([\s\S]*?var\(--mobile-sidebar-toggle-size\)[\s\S]*?var\(--mobile-sidebar-toggle-gap\)[\s\S]*?env\(safe-area-inset-top\)/,
  );
});

test("desktop main consumes the space left by the fixed sidebar without widening the document", () => {
  assert.match(
    css,
    /\.app-main\s*\{[\s\S]*?width:\s*auto;[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;/,
  );
  assert.doesNotMatch(
    css,
    /html,\s*body,\s*#root,\s*\.app-shell,\s*\.app-main\s*\{[\s\S]*?width:\s*100%;/,
  );
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
