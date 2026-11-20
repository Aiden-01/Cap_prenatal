const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const test = require('node:test');
const { validateAccountEmailConfig } = require('../src/config/env');
const { accountEmailMessage, createAccountEmailTransport } = require('../src/services/accountEmailTransport');

test('solo habilita correo con secreto HMAC independiente y una configuración explícita', () => {
  assert.deepEqual(validateAccountEmailConfig({}), { enabled: false });
  const secret = randomBytes(32).toString('hex');
  const env = { NODE_ENV: 'production', ACCOUNT_EMAIL_ENABLED: 'true',
    ACCOUNT_EMAIL_FROM: 'seguridad@example.invalid', ACCOUNT_EMAIL_RESEND_KEY: 'synthetic-key', ACCOUNT_EMAIL_HMAC_SECRET: secret };
  assert.throws(() => validateAccountEmailConfig({ ...env, JWT_SECRET: secret }), /ACCOUNT_EMAIL_HMAC_SECRET/);
  assert.throws(() => validateAccountEmailConfig({ ...env, ACCOUNT_EMAIL_HMAC_SECRET: 'short' }), /ACCOUNT_EMAIL_HMAC_SECRET/);
  assert.equal(validateAccountEmailConfig(env).enabled, true);
});

test('plantillas transaccionales incluyen HTML y texto plano sin enlaces con secretos', async () => {
  const captured = [];
  const send = createAccountEmailTransport({ apiKey: 'synthetic-key', sender: 'seguridad@example.invalid',
    fetchImpl: async (url, options) => {
      captured.push({ url, ...options });
      return { ok: true };
    },
  });
  await send({ kind: 'recuperar', to: 'persona@example.invalid', code: '00001234', id: 'mensaje-sintetico' });
  const request = captured[0];
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers['Idempotency-Key'], 'cap-account-mensaje-sintetico');
  const body = JSON.parse(request.body);
  for (const content of [body.html, body.text]) {
    assert.match(content, /00001234/);
    assert.match(content, /15 minutos/);
    assert.match(content, /No lo compartas/);
    assert.doesNotMatch(content, /synthetic-key|https?:|\?token=/);
  }
  assert.doesNotMatch(accountEmailMessage('aviso').text, /\d{8}/);
  assert.throws(() => accountEmailMessage('recuperar', '<script>'), /Plantilla/);
});
