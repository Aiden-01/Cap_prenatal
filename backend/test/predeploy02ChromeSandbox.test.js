const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateChromeSandboxStatus } = require('../../.github/clinical/chrome-sandbox-status.cjs');

const realDiagnostic = fs.readFileSync(path.join(__dirname, 'fixtures/chrome-sandbox-148.txt'), 'utf8').replace(/\r\n?/g, '\n');
const requiredRows = [
  ['Layer 1 Sandbox', 'Namespace'], ['PID namespaces', 'Yes'],
  ['Network namespaces', 'Yes'], ['Seccomp-BPF sandbox', 'Yes'],
];
const rejects = diagnostic => assert.throws(() => validateChromeSandboxStatus(diagnostic),
  { code: 'PREDEPLOY02_CHROME_SANDBOX_UNSAFE' });

test('sandbox: texto real Chrome148 del segundo ensayo acredita cada control', () => {
  const result = validateChromeSandboxStatus(realDiagnostic);
  assert.deepEqual(result, { layer1: 'Namespace', pidNamespaces: true,
    networkNamespaces: true, seccompBpf: true, globallyConfirmed: true });
  assert.ok(Object.isFrozen(result));
});

test('sandbox: espacios, tabulaciones, líneas vacías y finales LF/CRLF/CR son inocuos', () => {
  for (const diagnostic of [realDiagnostic.replace(/\t/g, '    '),
    realDiagnostic.replace(/\n/g, '\r\n'), realDiagnostic.replace(/\n/g, '\r'),
    ` \t\r\n${realDiagnostic}\r\n \t`, realDiagnostic.replace(/\t/g, '\n'),
    realDiagnostic.replace(/ /g, '\t\n  '), realDiagnostic.replace(/\n/g, ' \t ')]) {
    assert.equal(validateChromeSandboxStatus(diagnostic).globallyConfirmed, true);
  }
});

test('sandbox: contrato mínimo sin cabecera ni campos adicionales también exige los cinco controles', () => {
  const minimal = requiredRows.map(([label, value]) => `${label} ${value}`).join('\n')
    + '\nYou are adequately sandboxed.';
  assert.equal(validateChromeSandboxStatus(minimal).globallyConfirmed, true);
});

for (const [label, value] of requiredRows) {
  test(`sandbox: ${label}=No es rechazado`, () => {
    rejects(realDiagnostic.replace(`${label}\t${value}`, `${label}\tNo`));
  });
  test(`sandbox: ausencia de ${label} es rechazada`, () => {
    rejects(realDiagnostic.replace(`${label}\t${value}\n`, ''));
  });
}

test('sandbox: Layer1 distinto de Namespace es rechazado', () => {
  rejects(realDiagnostic.replace('Layer 1 Sandbox\tNamespace', 'Layer 1 Sandbox\tSetuid'));
});

test('sandbox: diagnóstico truncado en campo o confirmación global es rechazado', () => {
  for (const diagnostic of [realDiagnostic.slice(0, realDiagnostic.indexOf('Network namespaces') + 8),
    realDiagnostic.replace('You are adequately sandboxed.\n', ''),
    realDiagnostic.replace('You are adequately sandboxed.', 'You are adequately sandbox')]) rejects(diagnostic);
});

test('sandbox: mensaje global negativo es rechazado', () => {
  rejects(realDiagnostic.replace('You are adequately sandboxed.', 'You are NOT adequately sandboxed.'));
});

test('sandbox: Yes en TSYNC u otros campos no acredita seccomp ni PID ausentes', () => {
  rejects(realDiagnostic.replace('Seccomp-BPF sandbox\tYes\n', ''));
  rejects(realDiagnostic.replace('PID namespaces\tYes\n', ''));
  rejects(realDiagnostic.replace('PID namespaces\tYes', 'PID namespaces\tNo'));
});

test('sandbox: diagnóstico con campos contradictorios es rechazado en ambos órdenes', () => {
  rejects(realDiagnostic + '\nPID namespaces No');
  rejects('PID namespaces No\n' + realDiagnostic);
  rejects(realDiagnostic + '\nLayer 1 Sandbox Setuid');
});

test('sandbox: campos o confirmación duplicados se rechazan incluso si son positivos', () => {
  rejects(realDiagnostic + '\nPID namespaces Yes');
  rejects(realDiagnostic + '\nYou are adequately sandboxed.');
});

test('sandbox: confirmación positiva acompañada de mensaje negativo no es válida', () => {
  rejects(realDiagnostic + '\nYou are NOT adequately sandboxed.');
});

test('sandbox: valores positivos como subcadena o en filas ajenas no son prueba', () => {
  rejects(realDiagnostic.replace('PID namespaces\tYes', 'PID namespaces\tYesButUnverified'));
  rejects(realDiagnostic.replace('PID namespaces\tYes', 'Other namespaces\tYes'));
  rejects(realDiagnostic.replace('Layer 1 Sandbox\tNamespace', 'Layer 1 Sandbox\tNamespaceDisabled'));
});

test('sandbox: fila adicional contradictoria o texto residual se rechazan', () => {
  rejects(realDiagnostic + '\nSeccomp-BPF sandbox supports TSYNC No');
  rejects(realDiagnostic + '\nIncomplete diagnostic');
});

test('sandbox: no se normalizan valores, mayúsculas ni espacios Unicode', () => {
  rejects(realDiagnostic.replace('PID namespaces\tYes', 'PID namespaces\tyes'));
  rejects(realDiagnostic.replace('PID namespaces\tYes', 'PID namespaces\u00a0Yes'));
});

test('sandbox: vacío y entradas no textuales se rechazan sin iniciar procesos', () => {
  for (const value of ['', ' \t\r\n', null, undefined, {}, true, 1]) rejects(value);
});
