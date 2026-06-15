const DEFAULT_TIMEOUT_MS = 5000;

function enabled() {
  return String(process.env.NOTIFICATIONS_ENABLED || '').toLowerCase() === 'true';
}

function getConfig() {
  return {
    enabled: enabled(),
    webhookUrl: process.env.N8N_WEBHOOK_URL,
    secret: process.env.N8N_WEBHOOK_SECRET,
    timeoutMs: Number(process.env.N8N_WEBHOOK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

async function sendEvent(event, payload = {}) {
  const config = getConfig();

  if (!config.enabled || !config.webhookUrl) {
    return { skipped: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.secret ? { 'x-cap-prenatal-secret': config.secret } : {}),
      },
      body: JSON.stringify({
        event,
        source: 'cap-prenatal',
        occurred_at: new Date().toISOString(),
        payload,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`n8n webhook responded with ${response.status} for event ${event}`);
    }

    return { ok: response.ok, status: response.status };
  } catch (err) {
    console.warn(`n8n webhook failed for event ${event}: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  sendEvent,
};
