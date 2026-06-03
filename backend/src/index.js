require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

const authRoutes      = require('./routes/auth');
const usuariosRoutes  = require('./routes/usuarios');
const pacientesRoutes = require('./routes/pacientes');
const reportesRoutes  = require('./routes/reportes');
const chatbotRoutes   = require('./routes/chatbot');
const ocrRoutes       = require('./routes/ocr');
const { csrfMiddleware } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { AppError } = require('./utils/appError');

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedDevOrigin(origin) {
  if (!origin) return true;

  try {
    const url = new URL(origin);
    const host = url.hostname;
    const isVitePort = url.port === '5173';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateLan =
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

    return allowedOrigins.includes(origin) || (isVitePort && (isLocalhost || isPrivateLan));
  } catch {
    return false;
  }
}

// ── Middlewares globales ──────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin(origin, callback) {
    if (isAllowedDevOrigin(origin)) return callback(null, true);
    return callback(new AppError(403, 'Origen no permitido por CORS', { code: 'CORS_FORBIDDEN' }));
  },
  credentials: true,
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use('/api', csrfMiddleware);

// ── Rutas ─────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/usuarios',  usuariosRoutes);
app.use('/api/pacientes', pacientesRoutes);   // incluye sub-rutas controles/riesgo/morbilidad/vacunas/referencias/pdf
app.use('/api/reportes',  reportesRoutes);
app.use('/api/chatbot',   chatbotRoutes);
app.use('/api/ocr',       ocrRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({
  status:    'ok',
  sistema:   'CAP El Chal - Expedientes Prenatales',
  version:   '2.1.0',
  timestamp: new Date().toISOString()
}));

// ── 404 handler ───────────────────────────────────────────────
app.use((req, _res, next) => {
  next(new AppError(404, `Ruta ${req.method} ${req.path} no encontrada`, { code: 'ROUTE_NOT_FOUND' }));
});

// ── Error handler global ──────────────────────────────────────
app.use(errorHandler);

// ── Iniciar servidor ──────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   📋 Health: http://localhost:${PORT}/api/health`);
  console.log(`   🔐 Login:  POST http://localhost:${PORT}/api/auth/login\n`);
});
