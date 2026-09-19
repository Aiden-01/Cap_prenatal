import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const distDir = path.resolve("dist");
const assetsDir = path.join(distDir, "assets");
const htmlPath = path.join(distDir, "index.html");

if (!fs.existsSync(htmlPath)) {
  console.error("No existe dist/index.html. Ejecuta npm run build primero.");
  process.exit(1);
}

const sizeOf = (filePath) => {
  const content = fs.readFileSync(filePath);
  return {
    bytes: content.length,
    gzipBytes: zlib.gzipSync(content, { level: 9 }).length,
  };
};

const toKb = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;
const html = fs.readFileSync(htmlPath, "utf8");
const initialReferences = new Set();
for (const match of html.matchAll(/(?:src|href)="\/?assets\/([^"]+\.(?:js|css))"/g)) {
  initialReferences.add(match[1]);
}

const pending = [...initialReferences].filter((file) => file.endsWith(".js"));
while (pending.length) {
  const file = pending.pop();
  const content = fs.readFileSync(path.join(assetsDir, file), "utf8");
  for (const match of content.matchAll(/(?:from\s*|import\s*)["']\.\/([^"']+\.js)["']/g)) {
    if (!initialReferences.has(match[1])) {
      initialReferences.add(match[1]);
      pending.push(match[1]);
    }
  }
}

const assets = fs.readdirSync(assetsDir)
  .filter((file) => /\.(?:js|css)$/.test(file))
  .map((file) => ({ file, ...sizeOf(path.join(assetsDir, file)) }))
  .sort((left, right) => right.bytes - left.bytes);

const initial = assets.filter(({ file }) => initialReferences.has(file));
const lazy = assets.filter(({ file }) => !initialReferences.has(file));
const totals = (rows) => rows.reduce((sum, row) => ({
  bytes: sum.bytes + row.bytes,
  gzipBytes: sum.gzipBytes + row.gzipBytes,
}), { bytes: 0, gzipBytes: 0 });

function printSection(title, rows) {
  console.log(`\n${title}`);
  console.table(rows.map(({ file, bytes, gzipBytes }) => ({
    asset: file,
    minified: toKb(bytes),
    gzip: toKb(gzipBytes),
  })));
  const total = totals(rows);
  console.log(`Total: ${toKb(total.bytes)} minificado / ${toKb(total.gzipBytes)} gzip`);
  for (const extension of [".js", ".css"]) {
    const subtotal = totals(rows.filter(({ file }) => file.endsWith(extension)));
    console.log(`${extension.slice(1).toUpperCase()}: ${toKb(subtotal.bytes)} minificado / ${toKb(subtotal.gzipBytes)} gzip`);
  }
}

printSection("Assets iniciales", initial);
printSection("Assets diferidos", lazy);
