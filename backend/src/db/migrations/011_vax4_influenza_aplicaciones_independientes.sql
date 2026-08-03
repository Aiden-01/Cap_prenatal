-- VAX-4: cada registro de Influenza es una aplicacion independiente.
-- Las posiciones clinicas de TD, Tdap y SR/SPR siguen protegidas por
-- sus indices parciales creados en la migracion 010.
DROP INDEX IF EXISTS ux_vacunas_embarazo_dosis;

UPDATE vacunas_paciente
SET numero_dosis = 1
WHERE tipo_vacuna = 'influenza'
  AND numero_dosis <> 1;

ALTER TABLE vacunas_paciente
  DROP CONSTRAINT IF EXISTS vacunas_paciente_numero_dosis_clinica_check;

ALTER TABLE vacunas_paciente
  ADD CONSTRAINT vacunas_paciente_numero_dosis_clinica_check CHECK (
    (tipo_vacuna = 'td' AND numero_dosis BETWEEN 1 AND 5)
    OR (tipo_vacuna = 'tdap' AND numero_dosis = 1)
    OR (tipo_vacuna = 'spr_sr' AND numero_dosis BETWEEN 1 AND 2)
    OR (tipo_vacuna = 'influenza' AND numero_dosis = 1)
  );
