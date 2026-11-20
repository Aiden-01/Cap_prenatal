const subjects = {
  recuperar: 'Código para recuperar tu contraseña de CAP Prenatal',
  aviso: 'Tu contraseña de CAP Prenatal se actualizó',
};

function accountEmailMessage(kind, code) {
  const subject = subjects[kind];
  const withCode = kind === 'recuperar';
  if (!subject || (withCode && !/^\d{8}$/.test(code))) throw new Error('Plantilla de cuenta inválida');
  const title = { recuperar: 'Recupera tu contraseña', aviso: 'Contraseña actualizada' }[kind];
  const intro = {
    recuperar: 'Ingresa este código en CAP Prenatal para establecer una contraseña nueva.',
    aviso: 'La contraseña de tu cuenta cambió y las sesiones anteriores se cerraron.',
  }[kind];
  const note = !withCode
    ? 'Si no reconoces este cambio, comunícate con la administración de CAP Prenatal.'
    : 'El código vence en 15 minutos. No lo compartas con nadie. Si no solicitaste esta acción, ignora este correo.';
  const text = ['CAP Prenatal', title, intro, ...(withCode ? [code] : []), note, 'CAP El Chal · Seguridad de cuentas'].join('\n\n');
  const codeBlock = withCode ? `<p style="margin:24px 0;background:#e7f4f1;color:#12443e;border-radius:12px;padding:16px 8px;text-align:center;font:700 30px ui-monospace,monospace;letter-spacing:.12em">${code}</p>` : '';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
  <body style="margin:0;background:#eef5f4;color:#172e31;font:16px/1.5 Arial,sans-serif">
  <table role="presentation" style="width:100%;border-spacing:0"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" style="width:100%;max-width:520px;background:#fff;border:1px solid #dceae6;border-spacing:0;border-radius:16px">
  <tr><td style="padding:18px 24px;background:#13534b;color:#fff;font-weight:bold;border-radius:16px 16px 0 0">CAP Prenatal</td></tr>
  <tr><td style="padding:24px"><span aria-hidden="true" style="background:#e7f4f1;border-radius:50%;padding:10px">&#128274;</span>
  <h1 style="font-size:24px;line-height:1.25;margin:16px 0 8px">${title}</h1><p>${intro}</p>${codeBlock}
  <p style="color:#395a5a;font-size:14px">${note}</p></td></tr>
  <tr><td style="padding:16px 24px;border-top:1px solid #dceae6;color:#395a5a;font-size:13px">CAP El Chal · Seguridad de cuentas</td></tr>
  </table></td></tr></table></body></html>`;
  return { subject, text, html };
}

function createAccountEmailTransport({ apiKey, sender, fetchImpl = fetch }) {
  return async ({ to, kind, code, id }) => {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `cap-account-${id}` },
      body: JSON.stringify({ from: `CAP Prenatal <${sender}>`, to: [to], ...accountEmailMessage(kind, code) }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('ACCOUNT_EMAIL_DELIVERY_FAILED');
  };
}

module.exports = { accountEmailMessage, createAccountEmailTransport };
