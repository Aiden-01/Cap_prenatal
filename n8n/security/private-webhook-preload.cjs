const path = require('node:path');

const route = 'cap-prenatal-seguridad-recuperacion';
const identifier = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function guardAccountEmailWebhook(Webhook) {
  const original = Webhook.prototype.webhook;
  Webhook.prototype.webhook = async function guardedWebhook(context) {
    const result = await original.call(this, context);
    if (context.getNode().parameters?.path !== route || !result.workflowData) return result;

    // n8n writes the trigger output before saveExecutionProgress is evaluated.
    // Header Auth is already verified by the original Webhook at this point.
    const body = result.workflowData[0]?.[0]?.json?.body;
    if (!body || Object.keys(body).length !== 1 || typeof body.messageId !== 'string' || !identifier.test(body.messageId)) {
      const response = context.getResponseObject();
      response.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end('{"status":"invalid_message"}');
      return { noWebhookResponse: true };
    }
    return { ...result, workflowData: [[{ json: { body: { messageId: body.messageId } } }]] };
  };
}

const cli = process.argv[1] || '';
if (/[\\/]n8n[\\/]bin[\\/]n8n$/.test(cli)) {
  const installedWebhook = path.resolve(path.dirname(cli), '../../n8n-nodes-base/dist/nodes/Webhook/Webhook.node.js');
  guardAccountEmailWebhook(require(installedWebhook).Webhook);
}

module.exports = { guardAccountEmailWebhook };
