const path = require('path');

const PDF_RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
});

function sanitizePdfFilename(value, fallback = 'documento.pdf') {
  const fallbackName = String(fallback || 'documento.pdf')
    .replace(/[\\/]/g, '-')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '-') || 'documento.pdf';

  let filename = path.basename(String(value ?? '').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  if (!filename) filename = fallbackName;
  if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

  if (filename.length > 120) {
    filename = `${filename.slice(0, 116).replace(/[-.]+$/g, '')}.pdf`;
  }

  return filename;
}

function setPdfResponseHeaders(res, filename) {
  const safeFilename = sanitizePdfFilename(filename);
  res.set({
    ...PDF_RESPONSE_HEADERS,
    'Content-Disposition': `inline; filename="${safeFilename}"`,
    'Content-Type': 'application/pdf',
  });
  return safeFilename;
}

function sendPdfResponse(res, pdf, filename) {
  setPdfResponseHeaders(res, filename);
  return res.send(Buffer.from(pdf));
}

module.exports = {
  PDF_RESPONSE_HEADERS,
  sanitizePdfFilename,
  sendPdfResponse,
  setPdfResponseHeaders,
};
