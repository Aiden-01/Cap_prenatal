const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const test = require('node:test');
const express = require('express');
const { validateAccountEmailConfig } = require('../src/config/env');
const { accountEmailMessage, accountEmailWebhook, accountEmailDeliveryPath,
  createAccountEmailTransport, describeAccountEmailFailure } = require('../src/services/accountEmailTransport');
const { guardAccountEmailWebhook } = require('../../n8n/security/private-webhook-preload.cjs');
const workflow = require('../../n8n/security/recuperacion-password.json');
const senders = require('../../n8n/email-senders.json');

test('la integración exige loopback y secretos HMAC y Header Auth independientes', () => {
  assert.deepEqual(validateAccountEmailConfig({}), { enabled: false });
  const secret = randomBytes(32).toString('hex');
  const webhookSecret = randomBytes(32).toString('hex');
  const env = {
    NODE_ENV: 'development', ACCOUNT_EMAIL_ENABLED: 'true', ACCOUNT_EMAIL_HMAC_SECRET: secret,
    ACCOUNT_EMAIL_WEBHOOK_SECRET: webhookSecret,
    ACCOUNT_EMAIL_WEBHOOK_URL: 'http://127.0.0.1:5678' + accountEmailWebhook,
  };
  assert.throws(() => validateAccountEmailConfig({ ...env, JWT_SECRET: secret }), /ACCOUNT_EMAIL_HMAC_SECRET/);
  assert.throws(() => validateAccountEmailConfig({ ...env, ACCOUNT_EMAIL_WEBHOOK_SECRET: secret }), /ACCOUNT_EMAIL_WEBHOOK_SECRET/);
  for (const endpoint of [
    'http://example.invalid:5678' + accountEmailWebhook, 'http://localhost:5678' + accountEmailWebhook,
    'http://127.0.0.1:5678/webhook-test/cap-prenatal-seguridad-recuperacion',
    env.ACCOUNT_EMAIL_WEBHOOK_URL + '?x=1',
  ]) assert.throws(() => validateAccountEmailConfig({ ...env, ACCOUNT_EMAIL_WEBHOOK_URL: endpoint }), /ACCOUNT_EMAIL_WEBHOOK_URL/);
  assert.deepEqual(validateAccountEmailConfig(env), {
    enabled: true, webhookUrl: env.ACCOUNT_EMAIL_WEBHOOK_URL, webhookSecret, secret,
  });
});

test('ambas plantillas de envío, en HTML y texto, preservan su contenido sin enlaces ni adornos', () => {
  const reset = accountEmailMessage('recuperar', '00001234');
  const notice = accountEmailMessage('aviso', '00001234');
  for (const message of [reset, notice]) {
    for (const content of [message.html, message.text]) {
      assert.match(content, /Centro de Atención Permanente El Chal/);
      assert.doesNotMatch(content, /https?:|<a\s|[\p{Extended_Pictographic}]|&#(?:x1f|12[0-9]{4})/iu);
      assert.doesNotMatch(content, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    }
  }
  for (const content of [reset.html, reset.text]) {
    assert.match(content, /Restablecer contraseña/);
    assert.match(content, /Válido durante 15 minutos · Un solo uso/);
    assert.equal(content.match(/00001234/g)?.length, 1);
  }
  assert.doesNotMatch(notice.html + notice.text, /\d{8}/);
  assert.throws(() => accountEmailMessage('recuperar', '<script>'), /Plantilla/);
});

test('el transporte simulado recoge una vez el correo, autentica ambas rutas y no registra datos privados', async t => {
  const app = express();
  app.use(express.json());
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const secret = randomBytes(32).toString('hex');
  const transport = createAccountEmailTransport({ webhookUrl: origin + accountEmailWebhook, webhookSecret: secret });
  app.post(accountEmailDeliveryPath + '/:messageId', transport.claim);
  const seen = [];
  app.post(accountEmailWebhook, async (req, res) => {
    try {
      assert.equal(req.get('X-CAP-Account-Email-Key'), secret);
      assert.deepEqual(Object.keys(req.body), ['messageId']);
      const url = origin + accountEmailDeliveryPath + '/' + req.body.messageId;
      const forbidden = await fetch(url, { method: 'POST' });
      const headers = { 'X-CAP-Account-Email-Key': secret };
      const first = await fetch(url, { method: 'POST', headers });
      const second = await fetch(url, { method: 'POST', headers });
      assert.deepEqual([forbidden.status, first.status, second.status], [403, 200, 404]);
      assert.equal(first.headers.get('cache-control'), 'no-store');
      seen.push(await first.json());
      return res.json({ status: 'accepted' });
    } catch (error) { return res.status(500).json({ status: 'failed' }); }
  });
  const message = { kind: 'recuperar', to: 'persona@example.test', code: '00001234', id: randomUUID() };
  await transport.send(message);
  assert.deepEqual(seen, [{ messageId: message.id, to: message.to, ...accountEmailMessage(message.kind, message.code) }]);
  const failed = createAccountEmailTransport({
    webhookUrl: origin + accountEmailWebhook, webhookSecret: secret,
    fetchImpl: async () => new Response(JSON.stringify({ status: 'rate_limited', detail: 'persona@example.test 00001234' }), { status: 429 }),
  });
  await assert.rejects(failed.send(message), error =>
    describeAccountEmailFailure(error) === 'RESEND_LIMITE' && !error.message.includes(message.to));
  const uncertain = createAccountEmailTransport({
    webhookUrl: origin + accountEmailWebhook, webhookSecret: secret,
    fetchImpl: async () => { throw new Error(message.code); },
  });
  await assert.rejects(uncertain.send(message), error =>
    describeAccountEmailFailure(error) === 'ENTREGA_INCIERTA' && !error.message.includes(message.code));
});

test('el workflow local conserva la credencial de tipo Resend, la política y la sanitización previa al historial', async () => {
  const [hook, pull, gate, resend] = workflow.nodes;
  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.pinData, {});
  assert.ok(workflow.nodes.every(node => !Object.hasOwn(node, 'credentials')));
  assert.deepEqual([
    workflow.settings.saveDataErrorExecution, workflow.settings.saveDataSuccessExecution,
    workflow.settings.saveManualExecutions, workflow.settings.saveExecutionProgress,
  ], ['none', 'none', false, false]);
  assert.equal(hook.parameters.authentication, 'headerAuth');
  assert.equal(hook.parameters.options.ipWhitelist, '127.0.0.1,::1');
  assert.equal(pull.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(resend.parameters.nodeCredentialType, 'resendApi');
  assert.equal(resend.parameters.headerParameters.parameters[0].name, 'Idempotency-Key');
  assert.match(resend.parameters.headerParameters.parameters[0].value, /messageId/);
  assert.equal(resend.parameters.jsonBody.split("from: '")[1].split("'")[0], senders.identities.TECHNICAL.from);
  assert.equal(resend.retryOnFail, false);
  assert.equal(gate.type, 'n8n-nodes-base.if');

  class ProbeWebhook {
    async webhook(context) { return context.result; }
  }
  guardAccountEmailWebhook(ProbeWebhook);
  const instance = new ProbeWebhook();
  const messageId = randomUUID();
  const mockResponse = {
    status: null,
    writeHead(status) { this.status = status; },
    end() {},
  };
  const makeContext = (path, body) => ({
    getNode() { return { parameters: { path } }; },
    getResponseObject() { return mockResponse; },
    result: { workflowData: [[{ json: { headers: { 'x-cap-account-email-key': 'private' }, body, query: { untrusted: 'value' } } }]] },
  });
  const route = hook.parameters.path;
  assert.deepEqual(await instance.webhook(makeContext(route, { messageId })), { workflowData: [[{ json: { body: { messageId } } }]] });
  assert.deepEqual(await instance.webhook(makeContext(route, { messageId, code: '00001234' })), { noWebhookResponse: true });
  assert.equal(mockResponse.status, 400);
  const other = makeContext('clinico', { field: 'unchanged' });
  assert.deepEqual(await instance.webhook(other), other.result);
});

test('confirmación y aviso de correo reutilizan la identidad institucional sin divulgar la dirección nueva', () => {
  const confirm = accountEmailMessage('confirmar-correo', '00001234');
  const notice = accountEmailMessage('aviso-correo', '00001234');
  assert.match(confirm.html, /Centro de Atención Permanente El Chal/);
  assert.match(confirm.text, /00001234/);
  assert.match(notice.text, /se cerraron todas sus sesiones/);
  assert.doesNotMatch(notice.html + notice.text, /00001234|@example\.invalid/);
  assert.throws(() => accountEmailMessage('confirmar-correo', '<script>'), /Plantilla/);
});
