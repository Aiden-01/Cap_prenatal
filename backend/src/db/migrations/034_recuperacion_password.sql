-- CPREN-129: recuperación de contraseña por correo registrado.
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS cuenta_codigos_email (
  id UUID PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_mac CHAR(64) NOT NULL,
  vence_at TIMESTAMPTZ NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 5)
);

CREATE TABLE IF NOT EXISTS cuenta_autorizaciones_recuperacion (
  token_mac CHAR(64) PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  vence_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS cuenta_limites_email (
  clave_mac CHAR(64) PRIMARY KEY,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  vence_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cuenta_limites_email_vence ON cuenta_limites_email (vence_at);

-- La invalidación comparte la transacción con los cambios de la cuenta.
CREATE OR REPLACE FUNCTION usuarios_revocar_recuperacion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
      OR (OLD.activo IS TRUE AND NEW.activo IS FALSE) THEN
    DELETE FROM cuenta_codigos_email WHERE usuario_id = OLD.id;
    DELETE FROM cuenta_autorizaciones_recuperacion WHERE usuario_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usuarios_revocar_recuperacion ON usuarios;
CREATE TRIGGER usuarios_revocar_recuperacion BEFORE UPDATE OF email, password_hash, activo ON usuarios
  FOR EACH ROW EXECUTE FUNCTION usuarios_revocar_recuperacion();
