-- Las cuentas existentes conservan su contraseña y acceso.
ALTER TABLE usuarios ADD COLUMN requiere_cambio_password BOOLEAN NOT NULL DEFAULT FALSE;
