require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes      = require('./routes/auth');
const usuariosRoutes  = require('./routes/usuarios');
const pacientesRoutes = require('./routes/pacientes');
const reportesRoutes  = require('./routes/reportes');

const app = express();

// ── Middlewares globales ──────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ── Rutas ─────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/usuarios',  usuariosRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/reportes',  reportesRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  sistema: 'CAP El Chal - Expedientes Prenatales',
  version: '1.0.0',
  timestamp: new Date().toISOString()
}));

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada` });
});

// ── Error handler global ──────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Iniciar servidor ──────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   📋 Health: http://localhost:${PORT}/api/health`);
  console.log(`   🔐 Login:  POST http://localhost:${PORT}/api/auth/login\n`);
});
