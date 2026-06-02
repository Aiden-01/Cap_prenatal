const express = require('express');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { nuevaPaciente } = require('../controllers/ocrController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.OCR_MAX_FILE_SIZE || 5 * 1024 * 1024),
  },
});

router.use(authMiddleware);

router.post('/nueva-paciente', (req, res, next) => {
  upload.single('documento')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'La imagen supera el tamano maximo permitido' });
    }
    return res.status(400).json({ error: 'No se pudo recibir la imagen' });
  });
}, nuevaPaciente);

module.exports = router;
