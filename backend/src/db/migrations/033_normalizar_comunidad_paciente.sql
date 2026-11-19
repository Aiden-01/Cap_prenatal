-- Conserva la ubicación original de filas vinculadas antes de retirar sus duplicados.
SET LOCAL lock_timeout = '5s';

ALTER TABLE pacientes ALTER COLUMN comunidad TYPE VARCHAR(150);

CREATE TABLE IF NOT EXISTS pacientes_ubicacion_legado (
  paciente_id INTEGER PRIMARY KEY REFERENCES pacientes(id) ON DELETE CASCADE,
  comunidad_id_original INTEGER NOT NULL,
  comunidad VARCHAR(150),
  territorio VARCHAR(100),
  sector VARCHAR(80)
);

INSERT INTO pacientes_ubicacion_legado (paciente_id, comunidad_id_original, comunidad, territorio, sector)
SELECT id, comunidad_id, comunidad, territorio, sector
FROM pacientes
WHERE comunidad_id IS NOT NULL
ON CONFLICT (paciente_id) DO NOTHING;

UPDATE pacientes
SET comunidad = NULL, territorio = NULL, sector = NULL
WHERE comunidad_id IS NOT NULL
  AND (comunidad IS NOT NULL OR territorio IS NOT NULL OR sector IS NOT NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pacientes'::regclass AND conname = 'pacientes_ubicacion_catalogada_check'
  ) THEN
    ALTER TABLE pacientes ADD CONSTRAINT pacientes_ubicacion_catalogada_check
      CHECK (comunidad_id IS NULL OR (comunidad IS NULL AND territorio IS NULL AND sector IS NULL));
  END IF;
END $$;
