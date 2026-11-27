-- CPREN-126: desafío autenticado para confirmar una nueva dirección.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS cuenta_cambios_correo (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  sesion_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  id UUID NOT NULL,
  codigo_mac CHAR(64) NOT NULL,
  vence_at TIMESTAMPTZ NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_cuenta_cambios_correo_sesion ON cuenta_cambios_correo (sesion_id);
CREATE INDEX IF NOT EXISTS idx_cuenta_cambios_correo_vence ON cuenta_cambios_correo (vence_at);
