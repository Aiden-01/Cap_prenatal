const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/bmp',
]);

function validateFile(file) {
  if (!file) {
    return 'Debe enviar una imagen en el campo documento';
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return 'Formato no permitido. Use JPG, PNG, WEBP, TIFF o BMP';
  }

  return null;
}

async function nuevaPaciente(req, res) {
  const error = validateFile(req.file);
  if (error) return res.status(400).json({ error });

  const serviceUrl = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:5001';

  try {
    const data = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    data.append('documento', blob, req.file.originalname || 'documento.jpg');

    const response = await fetch(`${serviceUrl}/procesar-nueva-paciente`, {
      method: 'POST',
      body: data,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        campos_detectados: {},
        confianza: {},
        texto_extraido: '',
        requiere_revision: true,
        error: payload?.error || 'El servicio OCR no pudo procesar la imagen',
        errores: payload?.errores || [],
      });
    }

    return res.json(payload);
  } catch (err) {
    console.error('Error llamando OCR:', err.message);
    return res.status(503).json({
      ok: false,
      campos_detectados: {},
      confianza: {},
      texto_extraido: '',
      requiere_revision: true,
      error: 'Servicio OCR no disponible. Puede continuar llenando el formulario manualmente.',
    });
  }
}

module.exports = { nuevaPaciente };
