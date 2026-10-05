-- CPREN-65. Aplicar con migrate.js, dentro de su transacción por archivo.
-- PostgreSQL inicializa también los registros existentes con versión 1.
SET LOCAL lock_timeout = '5s';
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
