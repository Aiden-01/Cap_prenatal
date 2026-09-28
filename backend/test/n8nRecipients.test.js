const assert = require('node:assert/strict');
const test = require('node:test');
const { renderWorkflow, recipientFor, PROFILES } = require('../../scripts/render-n8n-workflows');

const workflows = [
  ['recordatorio-citas-resend-v1.json', 'CAP_NOTIFICATION_RECIPIENT', 1],
  ['seguimiento-inasistencias-resend-v1.json', 'CAP_NOTIFICATION_RECIPIENT', 1],
  ['censo-primer-control-26-25-resend-v1.json', 'CAP_NOTIFICATION_RECIPIENT', 2],
  ['censo-primer-control-mes-cerrado-resend-v1.json', 'CAP_NOTIFICATION_RECIPIENT', 2],
  ['seguimiento-tdap-el-chal-resend-v1.json', 'CAP_TDAP_RECIPIENT', 1],
  ['watchdog-calidad-datos-resend-v1.json', 'CAP_WATCHDOG_RECIPIENT', 1],
];

for (const [filename, variable, expectedCount] of workflows) {
  test(`${filename} se versiona con fallback seguro y se prepara sin $env`, () => {
    const workflow = require(`../../n8n/workflows/${filename}`);
    const recipients = workflow.nodes.flatMap(({ parameters = {} }) => {
      if (typeof parameters.to === 'string') return [parameters.to];
      if (parameters.url === 'https://api.resend.com/emails') return [parameters.jsonBody];
      return [];
    });
    assert.equal(recipients.length, expectedCount);
    for (const recipient of recipients) {
      assert.ok(recipient.includes('responsable@example.invalid'));
      assert.doesNotMatch(recipient, /\$env|\$vars/);
      for (const address of recipient.match(/[\w.+-]+@[\w.-]+/g) || []) {
        assert.ok(address.endsWith('@example.invalid') || address.endsWith('.example.invalid'));
      }
    }
    assert.doesNotMatch(JSON.stringify(workflow), /@gmail\.com|@hotmail\.com|@outlook\.com/i);
    assert.equal(recipientFor(variable, {}), 'responsable@example.invalid');
    for (const [profile, expectedBase] of [
      ['production-host', 'http://127.0.0.1:3335'],
      ['local', 'http://127.0.0.1:3001'],
    ]) {
      const rendered = renderWorkflow(workflow, filename, profile, {
        [variable]: 'operador@example.test',
        N8N_ENCRYPTION_KEY: 'valor-sintetico-no-secret',
      });
      const serialized = JSON.stringify(rendered);
      assert.ok(serialized.includes('operador@example.test'));
      const m2mUrls = rendered.nodes.map(({ parameters = {} }) => parameters.url)
        .filter((url) => typeof url === 'string' && url.includes('/api/automatizaciones/'));
      assert.ok(m2mUrls.length > 0);
      assert.ok(m2mUrls.every((url) => url.startsWith(`${expectedBase}/api/automatizaciones/`)));
      assert.doesNotMatch(serialized, /valor-sintetico-no-secret|\$env/);
      assert.equal(rendered.active, false);
      assert.ok(JSON.stringify(workflow).includes('responsable@example.invalid'));
    }
  });
}

test('solo se admiten los perfiles host actuales', () => {
  assert.deepEqual(Object.keys(PROFILES).sort(), ['local', 'production-host']);
  const filename = workflows[0][0];
  const workflow = require(`../../n8n/workflows/${filename}`);
  for (const profile of ['docker', 'host', '', '../otro']) {
    assert.throws(() => renderWorkflow(workflow, filename, profile), /Perfil inválido/);
  }
});

test('preparador rechaza destinatarios múltiples o con caracteres de expresión', () => {
  for (const value of ['uno@example.test,dos@example.test', "uno'@example.test", 'sin-correo']) {
    assert.throws(() => recipientFor('CAP_TDAP_RECIPIENT', { CAP_TDAP_RECIPIENT: value }));
  }
});
