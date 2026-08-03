-- VAX-5: toda aplicacion de vacuna requiere fecha clinica.
-- Las migraciones anteriores permitian fecha nula para Influenza. La
-- restriccion NOT VALID protege inmediatamente nuevas escrituras sin borrar
-- ni inventar fechas historicas; cuando no existen filas incompatibles se
-- valida en la misma migracion.
ALTER TABLE vacunas_paciente
  DROP CONSTRAINT IF EXISTS vacunas_paciente_fecha_clinica_check;

ALTER TABLE vacunas_paciente
  ADD CONSTRAINT vacunas_paciente_fecha_clinica_check
  CHECK (fecha_dosis IS NOT NULL) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vacunas_paciente
    WHERE fecha_dosis IS NULL
  ) THEN
    ALTER TABLE vacunas_paciente
      VALIDATE CONSTRAINT vacunas_paciente_fecha_clinica_check;
  END IF;
END
$$;
