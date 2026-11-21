const institution = 'Centro de Atención Permanente El Chal';

function accountEmailMessage(kind, code) {
  const recovering = kind === 'recuperar';
  if ((!recovering && kind !== 'aviso') || (recovering && !/^\d{8}$/.test(code))) {
    throw new Error('Plantilla de cuenta inválida');
  }

  const title = recovering ? 'Restablecer contraseña' : 'Contraseña actualizada';
  const subject = title + ' | CAP Prenatal';
  const instruction = recovering
    ? 'Ingresa este código en CAP Prenatal para elegir una contraseña nueva.'
    : 'Tu contraseña de CAP Prenatal se actualizó. Las sesiones anteriores se cerraron.';
  const validity = 'Válido durante 15 minutos · Un solo uso';
  const warning = recovering
    ? 'No compartas este código. Si no solicitaste recuperar tu contraseña, ignora este correo y no respondas.'
    : 'Si no reconoces el cambio, comunícate con el equipo del centro. No respondas a este correo.';

  const codeBlock = recovering ? [
    '<tr><td align="center" class="code-bg" bgcolor="#EDF4F3" style="background-color:#EDF4F3;padding:20px 8px 16px;">',
    '<p class="accent" style="margin:0;color:#173E42;font-family:Consolas,Menlo,Courier New,monospace;font-size:36px;font-weight:bold;line-height:1.2;letter-spacing:0.11em;white-space:nowrap;">' + code + '</p>',
    '<p class="muted" style="margin:10px 0 0;color:#40595C;font-size:13px;line-height:1.5;">' + validity + '</p>',
    '</td></tr>',
  ].join('\n') : '';
  const html = [
    '<!doctype html>',
    '<html lang="es" dir="ltr"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="supported-color-schemes" content="light dark">',
    '<title>' + subject + '</title>',
    '<style>',
    ':root {color-scheme:light dark;supported-color-schemes:light dark;}',
    '@media (prefers-color-scheme: dark) {',
    '  .page {background-color:#151C20 !important;}',
    '  .paper {background-color:#202A2F !important;}',
    '  .ink {color:#E7EEEE !important;}',
    '  .muted {color:#B9CDCD !important;}',
    '  .accent {color:#BFEBE4 !important;}',
    '  .code-bg {background-color:#263C3E !important;}',
    '  .rule {border-color:#415358 !important;}',
    '}',
    '[data-ogsc] .page {background-color:#151C20 !important;}',
    '[data-ogsc] .paper {background-color:#202A2F !important;}',
    '[data-ogsc] .ink {color:#E7EEEE !important;}',
    '[data-ogsc] .muted {color:#B9CDCD !important;}',
    '[data-ogsc] .accent {color:#BFEBE4 !important;}',
    '[data-ogsc] .code-bg {background-color:#263C3E !important;}',
    '[data-ogsc] .rule {border-color:#415358 !important;}',
    '</style></head>',
    '<body class="page" bgcolor="#F3F5F5" style="margin:0;padding:0;background-color:#F3F5F5;-webkit-text-size-adjust:100%;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="page" bgcolor="#F3F5F5" style="width:100%;background-color:#F3F5F5;">',
    '<tr><td align="center" style="padding:28px 12px;">',
    '<!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="paper" bgcolor="#FFFFFF" style="width:100%;max-width:560px;background-color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;">',
    '<tr><td style="padding:24px 24px 0;">',
    '<p class="accent" style="margin:0;color:#244F52;font-size:15px;font-weight:bold;line-height:1.4;">CAP Prenatal</p>',
    '<p class="muted" style="margin:3px 0 0;color:#526363;font-size:13px;line-height:1.5;">' + institution + '</p>',
    '</td></tr>',
    '<tr><td style="padding:27px 24px 24px;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">',
    '<tr><td style="padding:0 0 ' + (recovering ? '20px' : '0') + ';">',
    '<h1 class="ink" style="margin:0;color:#182C30;font-size:26px;font-weight:bold;line-height:1.2;">' + title + '</h1>',
    '<p class="ink" style="margin:10px 0 0;color:#34494C;font-size:15px;line-height:1.55;">' + instruction + '</p>',
    '</td></tr>',
    codeBlock,
    '<tr><td style="padding:17px 0 0;">',
    '<p class="muted" style="margin:0;color:#526363;font-size:13px;line-height:1.6;">' + warning + '</p>',
    '</td></tr></table>',
    '</td></tr>',
    '<tr><td style="padding:0 24px 20px;">',
    '<p class="rule muted" style="margin:0;padding:14px 0 0;border-top:1px solid #DCE5E4;color:#526363;font-size:12px;line-height:1.5;">' + institution + ' · Seguridad de cuentas</p>',
    '</td></tr></table>',
    '<!--[if mso]></td></tr></table><![endif]-->',
    '</td></tr></table></body></html>',
  ].join('\n');
  const text = [
    'CAP Prenatal', institution, '', title, '', instruction,
    ...(recovering ? ['', code, validity] : []),
    '', warning, '', institution + ' · Seguridad de cuentas',
  ].join('\n');
  return { subject, text, html };
}

module.exports = { accountEmailMessage };
