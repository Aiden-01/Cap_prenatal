'use strict';

// Contrato del diagnóstico de Chrome 148. Sin I/O ni lanzamiento de navegador.
const requiredFields = Object.freeze({
  'Layer 1 Sandbox': 'Namespace',
  'PID namespaces': 'Yes',
  'Network namespaces': 'Yes',
  'Seccomp-BPF sandbox': 'Yes',
});
// Filas adicionales presentes en el diagnóstico real. No acreditan los controles
// obligatorios: por ejemplo, Yama Non-broker=No no es PID/Network/seccomp=No.
const optionalFields = Object.freeze([
  'Seccomp-BPF sandbox supports TSYNC',
  'Ptrace Protection with Yama LSM (Broker)',
  'Ptrace Protection with Yama LSM (Non-broker)',
]);
// Resolver primero la etiqueta más larga evita confundir TSYNC con seccomp.
const labels = Object.freeze([...Object.keys(requiredFields), ...optionalFields]
  .sort((left, right) => right.length - left.length));
const confirmation = 'You are adequately sandboxed.';

function reject(reason) {
  const error = new Error(`Chrome sandbox no confirmado: ${reason}`);
  error.code = 'PREDEPLOY02_CHROME_SANDBOX_UNSAFE';
  throw error;
}

function validateChromeSandboxStatus(diagnostic) {
  if (typeof diagnostic !== 'string') reject('diagnóstico no textual');
  // Solo espacio ASCII, tabulación y finales de línea; conservar texto y valores.
  let remaining = diagnostic.replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, '');
  const fields = new Map();
  let headerSeen = false;
  let confirmationSeen = false;
  const startsWithEntry = entry => remaining === entry || remaining.startsWith(`${entry} `);
  const consume = entry => { remaining = remaining.slice(entry.length).replace(/^ /, ''); };

  while (remaining) {
    if (startsWithEntry('Sandbox Status')) {
      if (headerSeen) reject('cabecera repetida');
      headerSeen = true;
      consume('Sandbox Status');
      continue;
    }
    if (startsWithEntry(confirmation)) {
      if (confirmationSeen) reject('confirmación global repetida');
      confirmationSeen = true;
      consume(confirmation);
      continue;
    }
    const label = labels.find(candidate => remaining.startsWith(`${candidate} `));
    if (!label) reject('fila desconocida, truncada o mensaje global no positivo');
    if (fields.has(label)) reject(`campo repetido o contradictorio: ${label}`);
    const rest = remaining.slice(label.length + 1);
    const separator = rest.indexOf(' ');
    const value = separator < 0 ? rest : rest.slice(0, separator);
    if (Object.hasOwn(requiredFields, label)) {
      if (value !== requiredFields[label]) reject(`valor inseguro o no reconocido: ${label}`);
    } else if (value !== 'Yes' && value !== 'No') {
      reject(`valor no reconocido en fila adicional: ${label}`);
    }
    fields.set(label, value);
    remaining = separator < 0 ? '' : rest.slice(separator + 1);
  }

  for (const label of Object.keys(requiredFields)) {
    if (!fields.has(label)) reject(`campo obligatorio ausente: ${label}`);
  }
  if (!confirmationSeen) reject('confirmación global ausente');
  return Object.freeze({
    layer1: fields.get('Layer 1 Sandbox'),
    pidNamespaces: true,
    networkNamespaces: true,
    seccompBpf: true,
    globallyConfirmed: true,
  });
}

module.exports = { validateChromeSandboxStatus };
