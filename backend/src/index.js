const {
  ConfigError,
  loadEnvironmentFile,
  validateAppConfig,
} = require('./config/env');

loadEnvironmentFile();
let config;
try {
  config = validateAppConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const pacientesRoutes = require('./routes/pacientes');
const reportesRoutes = require('./routes/reportes');
const permisosRoutes = require('./routes/permisos');
const mapaRoutes = require('./routes/mapa');
const comunidadesRoutes = require('./routes/comunidades');
const chatbotRoutes = require('./routes/chatbot');
const {
  createAutomatizacionesRouter,
} = require('./routes/automatizaciones');
const { csrfMiddleware } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { AppError } = require('./utils/appError');
const { createStrictTrustProxy } = require('./utils/proxyTrust');

const app = express();
app.set('trust proxy', createStrictTrustProxy(config.trustedProxyCidrs));
const allowedOrigins = config.frontendOrigins;
const automatizacionesRoutes = createAutomatizacionesRouter({
  config: config.automation,
});

function isAllowedDevOrigin(origin) {
  if (config.nodeEnv === 'production') return false;

  try {
    const url = new URL(origin);
    const host = url.hostname;
    const isVitePort = url.port === '5173';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateLan =
      host.startsWith('192.168.')
      || host.startsWith('10.')
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

    return isVitePort && (isLocalhost || isPrivateLan);
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return allowedOrigins.includes(origin) || isAllowedDevOrigin(origin);
}

app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use('/api/automatizaciones', automatizacionesRoutes);
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new AppError(403, 'Origen no permitido por CORS', { code: 'CORS_FORBIDDEN' }));
  },
  credentials: true,
}));
app.use(express.json({ limit: config.jsonBodyLimit }));
app.use('/api', csrfMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/permisos', permisosRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/mapa', mapaRoutes);
app.use('/api/comunidades', comunidadesRoutes);
app.use('/api/chatbot', chatbotRoutes);

app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  sistema: 'CAP El Chal - Expedientes Prenatales',
  version: '2.1.0',
  timestamp: new Date().toISOString(),
}));

app.use((req, _res, next) => {
  next(new AppError(404, `Ruta ${req.method} ${req.path} no encontrada`, { code: 'ROUTE_NOT_FOUND' }));
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Servidor iniciado en el puerto ${config.port} (${config.nodeEnv})`);
});
