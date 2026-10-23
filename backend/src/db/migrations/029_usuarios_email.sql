-- CHECKPOINT-10: correo obligatorio para altas nuevas en la API; NULL conserva
-- cuentas anteriores sin inventar direcciones ni modificar sus credenciales.
SET LOCAL lock_timeout = '5s';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(254);

CREATE OR REPLACE FUNCTION usuarios_normalizar_email()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN NEW.email := lower(btrim(NEW.email)); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS usuarios_normalizar_email ON usuarios;
CREATE TRIGGER usuarios_normalizar_email BEFORE INSERT OR UPDATE OF email ON usuarios
  FOR EACH ROW EXECUTE FUNCTION usuarios_normalizar_email();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'usuarios'::regclass
    AND conname = 'usuarios_email_valido') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_email_valido CHECK (
      email IS NULL OR (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254
        AND email ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$')
    );
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (lower(email));
