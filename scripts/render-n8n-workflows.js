const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOWS = Object.freeze({
  'recordatorio-citas-resend-v1.json': 'CAP_NOTIFICATION_RECIPIENT',
  'seguimiento-inasistencias-resend-v1.json': 'CAP_NOTIFICATION_RECIPIENT',
  'censo-primer-control-26-25-resend-v1.json': 'CAP_NOTIFICATION_RECIPIENT',
  'censo-primer-control-mes-cerrado-resend-v1.json': 'CAP_NOTIFICATION_RECIPIENT',
  'seguimiento-tdap-el-chal-resend-v1.json': 'CAP_TDAP_RECIPIENT',
  'watchdog-calidad-datos-resend-v1.json': 'CAP_WATCHDOG_RECIPIENT',
});
const BASE_URL = 'http://backend:3001';
const PROFILES = Object.freeze({
  'production-host': 'http://127.0.0.1:3335',
  local: 'http://127.0.0.1:3001',
});
const FALLBACK = 'responsable@example.invalid';
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function recipientFor(name, environment) {
  const recipient = (environment[name] || '').trim();
  if (!recipient) return FALLBACK;
  if (!EMAIL.test(recipient) || /\.{2}|\.\-|\-\./.test(recipient)) {
    throw new Error(`Destinatario inválido: ${name}`);
  }
  return recipient;
}

function renderWorkflow(workflow, filename, profile, environment = {}) {
  if (!Object.hasOwn(PROFILES, profile)) throw new Error('Perfil inválido');
  const variable = WORKFLOWS[filename];
  if (!variable) throw new Error('Workflow no permitido');
  const rendered = structuredClone(workflow);
  const backend = PROFILES[profile];
  const recipient = recipientFor(variable, environment);
  let requests = 0;
  let deliveries = 0;

  for (const node of rendered.nodes) {
    const parameters = node.parameters || {};
    if (typeof parameters.url === 'string' && parameters.url.includes('/api/automatizaciones/') &&
        !parameters.url.startsWith(`${BASE_URL}/api/automatizaciones/`)) {
      throw new Error(`URL M2M inesperada en ${filename}`);
    }
    if (typeof parameters.url === 'string' && parameters.url.startsWith(`${BASE_URL}/api/automatizaciones/`)) {
      parameters.url = backend + parameters.url.slice(BASE_URL.length);
      requests += 1;
    }
    if (typeof parameters.to === 'string') {
      if (parameters.to !== FALLBACK) throw new Error(`Destinatario inesperado en ${filename}`);
      parameters.to = recipient;
      deliveries += 1;
    }
    if (parameters.url === 'https://api.resend.com/emails') {
      const marker = `to: ['${FALLBACK}']`;
      if (!parameters.jsonBody.includes(marker)) throw new Error(`Destinatario inesperado en ${filename}`);
      parameters.jsonBody = parameters.jsonBody.replace(marker, `to: ['${recipient}']`);
      deliveries += 1;
    }
  }
  if (!requests || !deliveries || rendered.active !== false) {
    throw new Error(`Workflow incompleto o activo: ${filename}`);
  }
  return rendered;
}

function main() {
  const profile = process.argv[2];
  if (!Object.hasOwn(PROFILES, profile) || process.argv.length !== 3) {
    throw new Error('Uso: node scripts/render-n8n-workflows.js production-host|local');
  }
  const output = path.join(ROOT, 'n8n', 'generated', profile);
  const rendered = Object.keys(WORKFLOWS).map((filename) => {
    const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n', 'workflows', filename), 'utf8'));
    return [filename, renderWorkflow(input, filename, profile, process.env)];
  });
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const [filename, workflow] of rendered) {
    fs.writeFileSync(path.join(output, filename), `${JSON.stringify(workflow, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`Preparados ${rendered.length} workflows en n8n/generated/${profile}.\n`);
}

if (require.main === module) main();

module.exports = { renderWorkflow, recipientFor, WORKFLOWS, PROFILES, FALLBACK };
