const { timingSafeEqual } = require('node:crypto');
const { accountEmailMessage } = require('./accountEmailTemplates');

const accountEmailWebhook = '/webhook/cap-prenatal-seguridad-recuperacion';
const accountEmailDeliveryPath = '/internal/account-email/delivery';
const authHeader = 'X-CAP-Account-Email-Key';
const identifier = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const knownFailures = Object.freeze({
  rejected: 'RESEND_RECHAZADO',
  rate_limited: 'RESEND_LIMITE',
  uncertain: 'ENTREGA_INCIERTA',
  payload_unavailable: 'MENSAJE_NO_DISPONIBLE',
});

class AccountEmailDeliveryError extends Error {
  constructor(diagnostic) {
    super('No se pudo confirmar la entrega del correo de cuenta');
    this.diagnostic = diagnostic;
  }
}

function describeAccountEmailFailure(error) {
  return error instanceof AccountEmailDeliveryError ? error.diagnostic : 'ERROR_INTERNO';
}

function createAccountEmailTransport({ webhookUrl, webhookSecret, fetchImpl = fetch }) {
  const pending = new Map();
  const expectedAuth = Buffer.from(webhookSecret);

  async function send({ to, kind, code, id }) {
    if (!identifier.test(id) || pending.has(id)) throw new AccountEmailDeliveryError('MENSAJE_INVALIDO');
    pending.set(id, { messageId: id, to, ...accountEmailMessage(kind, code) });
    try {
      let response;
      let reply;
      try {
        response = await fetchImpl(webhookUrl, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: { [authHeader]: webhookSecret, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: id }),
        });
        if ([401, 403, 404].includes(response.status)) {
          await response.body?.cancel();
          throw new AccountEmailDeliveryError('WEBHOOK_NO_AUTORIZADO_O_INACTIVO');
        }
        reply = await response.json();
      } catch (error) {
        if (error instanceof AccountEmailDeliveryError) throw error;
        throw new AccountEmailDeliveryError('ENTREGA_INCIERTA');
      }
      if (!response.ok || reply?.status !== 'accepted') {
        const diagnostic = Object.hasOwn(knownFailures, reply?.status) ? knownFailures[reply.status] : 'ENTREGA_INCIERTA';
        throw new AccountEmailDeliveryError(diagnostic);
      }
    } finally {
      pending.delete(id);
    }
  }

  function claim(req, res) {
    res.set('Cache-Control', 'no-store');
    const incoming = Buffer.from(req.get(authHeader) || '');
    const fromLoopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!fromLoopback || incoming.length !== expectedAuth.length || !timingSafeEqual(incoming, expectedAuth)) {
      return res.status(403).json({ status: 'forbidden' });
    }
    const message = pending.get(req.params.messageId);
    if (!message) return res.status(404).json({ status: 'payload_unavailable' });
    pending.set(req.params.messageId, null);
    return res.json(message);
  }

  return { send, claim };
}

module.exports = {
  accountEmailWebhook, accountEmailDeliveryPath, accountEmailMessage,
  createAccountEmailTransport, describeAccountEmailFailure,
};
