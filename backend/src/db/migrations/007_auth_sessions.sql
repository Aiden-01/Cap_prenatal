CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64) NOT NULL,
  previous_refresh_token_hash CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(80),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT auth_sessions_absolute_after_created
    CHECK (absolute_expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_usuario
  ON auth_sessions (usuario_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_sessions_refresh_token_hash
  ON auth_sessions (refresh_token_hash);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_user
  ON auth_sessions (usuario_id, absolute_expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiration
  ON auth_sessions (absolute_expires_at, revoked_at);
