'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { policy, applyEmailPolicy, mailNodes, validateDirectory } = require('../../scripts/n8n-email-policy');
const { renderWorkflow } = require('../../scripts/render-n8n-workflows');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'n8n/workflows');
const read = filename => JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
const baseline = '7722601d20bbd09584f8c4577b5e9cbe79c3398e';

test('inventario completo: seis institucionales y un técnico', () => {
  assert.equal(policy.identities.CLINICAL_INSTITUTIONAL.from, 'CAP Prenatal <citas@notificaciones.hercor-nexus.com>');
  assert.equal(policy.identities.TECHNICAL.from, 'CAP Prenatal - Sistema <sistema@notificaciones.hercor-nexus.com>');
  assert.equal(Object.values(policy.workflows).filter(c => c === 'CLINICAL_INSTITUTIONAL').length, 6);
  assert.equal(Object.values(policy.workflows).filter(c => c === 'TECHNICAL').length, 1);
  validateDirectory(directory);
});

for (const [filename, category] of Object.entries(policy.workflows)) {
  test(`${filename}: identidad, privacidad, conexiones y única diferencia permitida`, () => {
    const input = read(filename);
    const original = JSON.stringify(input);
    const rendered = renderWorkflow(input, filename, 'production-host');
    const from = policy.identities[category].from;
    for (const { parameters: p } of mailNodes(rendered)) {
      if (p.url) assert.ok(p.jsonBody.includes(`from: '${from}'`));
      else assert.equal(p.from, from);
    }
    assert.equal(JSON.stringify(input), original);
    assert.equal(input.active, false);
    for (const node of input.nodes) assert.equal(node.credentials, undefined);
    assert.deepEqual(input.pinData || {}, {});
    for (const address of original.match(/[\w.+-]+@[\w.-]+/g) || []) {
      assert.ok(address.endsWith('.invalid') || ['citas@notificaciones.hercor-nexus.com', 'sistema@notificaciones.hercor-nexus.com'].includes(address), address);
    }
    assert.doesNotMatch(original, /\bre_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9_-]{20,}/);
    const names = new Set(input.nodes.map(n => n.name));
    assert.equal(names.size, input.nodes.length);
    for (const [source, outputs] of Object.entries(input.connections)) {
      assert.ok(names.has(source));
      for (const branches of Object.values(outputs)) for (const branch of branches) for (const edge of branch) assert.ok(names.has(edge.node));
    }
    const previous = JSON.parse(cp.execFileSync('git', ['show', `${baseline}:n8n/workflows/${filename}`], { cwd: root, encoding: 'utf8' }));
    const strip = w => { for (const n of mailNodes(w)) delete n.parameters.from; return w; };
    assert.deepEqual(strip(structuredClone(input)), strip(previous));
    for (const bad of ['CAP Prenatal <otro@evil.test>', policy.identities[category === 'TECHNICAL' ? 'CLINICAL_INSTITUTIONAL' : 'TECHNICAL'].from]) {
      const changed = structuredClone(input);
      const p = mailNodes(changed)[0].parameters;
      if (p.url) p.jsonBody = p.jsonBody.replace(policy.identities[category].placeholder, bad);
      else p.from = bad;
      assert.throws(() => renderWorkflow(changed, filename, 'production-host'), /Remitente/);
    }
  });
}

test('nuevo correo sin categoría y HTTP con remitente ambiguo se rechazan', () => {
  for (const filename of Object.keys(policy.workflows)) {
    assert.throws(() => applyEmailPolicy(read(filename), 'nuevo-workflow.json'), /sin categoría/);
  }
  const filename = 'seguimiento-tdap-el-chal-resend-v1.json';
  const w = read(filename);
  mailNodes(w)[0].parameters.jsonBody += ", from: 'otro@evil.test'";
  assert.throws(() => applyEmailPolicy(w, filename), /ambiguo/);
  const expression = read(filename);
  mailNodes(expression)[0].parameters.jsonBody = mailNodes(expression)[0].parameters.jsonBody.replace("', to:", "' + $json.sender, to:");
  assert.throws(() => applyEmailPolicy(expression, filename), /ambiguo/);
  const folder = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'cpren92-policy-'));
  try {
    for (const name of Object.keys(policy.workflows)) fs.copyFileSync(path.join(directory, name), path.join(folder, name));
    fs.writeFileSync(path.join(folder, 'futuro.json'), JSON.stringify(read(filename)));
    assert.throws(() => validateDirectory(folder), /sin categoría/);
  } finally {
    for (const name of fs.readdirSync(folder)) fs.unlinkSync(path.join(folder, name));
    fs.rmdirSync(folder);
  }
});

test('CLI production-host genera siete JSON sin secretos ni cambios de agenda', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^CAP_.*RECIPIENT$/.test(key)));
  const output = cp.execFileSync(process.execPath, ['scripts/render-n8n-workflows.js', 'production-host'], { cwd: root, env, encoding: 'utf8' });
  assert.match(output, /Preparados 7 workflows/);
  for (const filename of Object.keys(policy.workflows)) {
    const generated = JSON.parse(fs.readFileSync(path.join(root, 'n8n/generated/production-host', filename)));
    assert.deepEqual(generated, renderWorkflow(read(filename), filename, 'production-host'));
    assert.deepEqual(generated.connections, read(filename).connections);
    assert.deepEqual(generated.settings, read(filename).settings);
  }
});
