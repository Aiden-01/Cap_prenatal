-- VAX-2: TD y Tdap son tipos independientes. Los datos existentes son de prueba,
-- por lo que cualquier tipo fuera del catalogo definitivo se elimina y no se transforma.
DELETE FROM vacunas_paciente
WHERE tipo_vacuna NOT IN ('td','tdap','influenza','spr_sr');

DELETE FROM vacunas_paciente
WHERE numero_dosis IS NULL
   OR (tipo_vacuna IN ('td','tdap','spr_sr') AND fecha_dosis IS NULL)
   OR (tipo_vacuna = 'td' AND numero_dosis NOT BETWEEN 1 AND 5)
   OR (tipo_vacuna = 'tdap' AND numero_dosis <> 1)
   OR (tipo_vacuna = 'spr_sr' AND numero_dosis NOT BETWEEN 1 AND 2)
   OR (tipo_vacuna = 'influenza' AND numero_dosis NOT BETWEEN 1 AND 10);

ALTER TABLE vacunas_paciente
  DROP CONSTRAINT IF EXISTS vacunas_paciente_tipo_vacuna_check,
  DROP CONSTRAINT IF EXISTS vacunas_paciente_numero_dosis_clinica_check,
  DROP CONSTRAINT IF EXISTS vacunas_paciente_fecha_clinica_check;

ALTER TABLE vacunas_paciente
  ALTER COLUMN numero_dosis SET NOT NULL,
  ADD CONSTRAINT vacunas_paciente_tipo_vacuna_check
    CHECK (tipo_vacuna IN ('td','tdap','influenza','spr_sr')),
  ADD CONSTRAINT vacunas_paciente_numero_dosis_clinica_check CHECK (
    (tipo_vacuna = 'td' AND numero_dosis BETWEEN 1 AND 5)
    OR (tipo_vacuna = 'tdap' AND numero_dosis = 1)
    OR (tipo_vacuna = 'spr_sr' AND numero_dosis BETWEEN 1 AND 2)
    OR (tipo_vacuna = 'influenza' AND numero_dosis BETWEEN 1 AND 10)
  ),
  ADD CONSTRAINT vacunas_paciente_fecha_clinica_check CHECK (
    tipo_vacuna = 'influenza' OR fecha_dosis IS NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_vacunas_tdap_embarazo
  ON vacunas_paciente(embarazo_id)
  WHERE tipo_vacuna = 'tdap' AND embarazo_id IS NOT NULL;
