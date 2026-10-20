'use strict';
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../n8n/email-senders.json');
const DOMAIN = 'notificaciones.hercor-nexus.com';

function mailNodes(workflow) {
  return workflow.nodes.filter(({ type, parameters: p = {} }) =>
    /resend|emailSend|smtp/i.test(type) ||
    (type === 'n8n-nodes-base.httpRequest' &&
      (/resend\.com/i.test(p.url || '') || /\bfrom\s*[:"']/i.test(p.jsonBody || ''))));
}

function applyEmailPolicy(workflow, filename, render = false) {
  const nodes = mailNodes(workflow);
  // Retired SMTP reference, never rendered/imported by this preparer.
  if (filename === 'proximas-citas-v1.json') {
    const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(workflow)).digest('hex');
    if (workflow.active !== false || hash !== 'da5176cf12b663097400ad7e56ac94d0eb988d6f9534a4c3f0d4365e9b939e82') {
      throw Error('Referencia SMTP retirada inconsistente');
    }
    return nodes;
  }
  if (!nodes.length && !Object.hasOwn(policy.workflows, filename)) return nodes;
  const category = policy.workflows[filename];
  const identity = policy.identities[category];
  if (!identity) throw Error(`Correo sin categoría declarada: ${filename}`);
  if (!identity.from.endsWith(`@${DOMAIN}>`)) throw Error('Dominio de remitente no autorizado');
  if (!nodes.length) throw Error(`Workflow sin transporte de correo: ${filename}`);
  for (const node of nodes) {
    const p = node.parameters;
    let from;
    let marker;
    if (node.type === 'n8n-nodes-resend.resend') {
      from = p.from;
    } else if (node.type === 'n8n-nodes-base.httpRequest' && p.url === 'https://api.resend.com/emails') {
      const matches = [...(p.jsonBody || '').matchAll(/\bfrom\s*:\s*(['"])([^'"\r\n]+)\1(?=\s*[,}])/g)];
      const keys = (p.jsonBody || '').match(/(?:\bfrom|["']from["'])\s*:/g) || [];
      if (matches.length !== 1 || keys.length !== 1) throw Error(`Remitente HTTP ambiguo: ${filename}`);
      from = matches[0][2];
      marker = matches[0][0];
    } else throw Error(`Transporte de correo no autorizado: ${filename}`);
    if (from !== identity.from && from !== identity.placeholder) {
      throw Error(`Remitente inconsistente o dominio no autorizado: ${filename}`);
    }
    if (render) {
      if (marker) p.jsonBody = p.jsonBody.replace(marker, `from: '${identity.from}'`);
      else p.from = identity.from;
    }
  }
  return nodes;
}

function validateDirectory(directory) {
  const filenames = fs.readdirSync(directory).filter(name => name.endsWith('.json'));
  for (const filename of Object.keys(policy.workflows)) {
    if (!filenames.includes(filename)) throw Error(`Falta workflow declarado: ${filename}`);
  }
  for (const filename of filenames) {
    applyEmailPolicy(JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8')), filename);
  }
}

module.exports = { policy, mailNodes, applyEmailPolicy, validateDirectory };
