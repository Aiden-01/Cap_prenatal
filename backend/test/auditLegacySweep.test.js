const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SOURCE_ROOT = path.resolve(__dirname, '../src');
const LEGACY_CENTRAL_FILES = new Set([
  'services/auditService.js',
  'utils/auditoria.js',
]);
const AUDIT_REPOSITORY_FILES = new Set([
  'repositories/auditRepository.js',
  'services/auditService.js',
]);

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolutePath] : [];
  });
}

function relativeSourcePath(filePath) {
  return path.relative(SOURCE_ROOT, filePath).replaceAll('\\', '/');
}

function findViolations({ pattern, allowed = new Set(), files = javascriptFiles(SOURCE_ROOT) }) {
  return files.flatMap((filePath) => {
    const relativePath = relativeSourcePath(filePath);
    if (allowed.has(relativePath)) return [];
    const source = fs.readFileSync(filePath, 'utf8');
    return pattern.test(source) ? [relativePath] : [];
  });
}

function assertNoViolations(violations, message) {
  assert.deepEqual(violations, [], `${message}: ${violations.join(', ')}`);
}

test('ningun productor productivo importa o llama la auditoria legacy', () => {
  const violations = findViolations({
    pattern: /utils\/auditoria|\bregistrarEvento\s*\(/,
    allowed: LEGACY_CENTRAL_FILES,
  });
  assertNoViolations(violations, 'Productor legacy encontrado');
});

test('INSERT de auditoria_eventos existe unicamente en auditRepository', () => {
  const violations = findViolations({
    pattern: /INSERT\s+INTO\s+auditoria_eventos/i,
    allowed: new Set(['repositories/auditRepository.js']),
  });
  assertNoViolations(violations, 'INSERT directo de auditoria encontrado');

  const repositorySource = fs.readFileSync(
    path.join(SOURCE_ROOT, 'repositories/auditRepository.js'),
    'utf8'
  );
  assert.match(repositorySource, /INSERT\s+INTO\s+auditoria_eventos/i);
});

test('productores no llaman auditRepository ni construyen payloads legacy', () => {
  assertNoViolations(findViolations({
    pattern: /\bauditRepository\b/,
    allowed: AUDIT_REPOSITORY_FILES,
  }), 'Uso directo de auditRepository encontrado');

  assertNoViolations(findViolations({
    pattern: /\b(datosAnteriores|datosNuevos|datos_anteriores|datos_nuevos)\b/,
    allowed: new Set([
      ...LEGACY_CENTRAL_FILES,
      'repositories/auditRepository.js',
    ]),
  }), 'Payload legacy encontrado');
});

test('productores privados no entregan req.body, headers, cookies o secretos a auditoria', () => {
  const producerFiles = javascriptFiles(SOURCE_ROOT).filter((filePath) => {
    const relativePath = relativeSourcePath(filePath);
    if (relativePath === 'services/auditService.js') return false;
    return fs.readFileSync(filePath, 'utf8').includes('registrarEventoPrivado');
  });
  const violations = findViolations({
    files: producerFiles,
    pattern: /(?:cambios|metadata)\s*:\s*req\.body|JSON\.stringify\s*\(\s*req\.body\s*\)|(?:cambios|metadata)\s*:\s*req\.(?:headers|cookies)/,
  });
  assertNoViolations(violations, 'Entrada HTTP cruda enviada a auditoria');

  const auditSource = fs.readFileSync(path.join(SOURCE_ROOT, 'services/auditService.js'), 'utf8');
  assert.match(auditSource, /ip:\s*null/);
  assert.match(auditSource, /userAgent:\s*null/);
  assert.match(auditSource, /sanitizeAuditValue\(payload\)/);
});

test('referencias conserva su modelo paciente-only sin inventar embarazo_id', () => {
  for (const relativePath of [
    'services/referenciasService.js',
    'repositories/referenciasRepository.js',
  ]) {
    const source = fs.readFileSync(path.join(SOURCE_ROOT, relativePath), 'utf8');
    assert.doesNotMatch(source, /embarazo_id|embarazoId/);
  }
});
