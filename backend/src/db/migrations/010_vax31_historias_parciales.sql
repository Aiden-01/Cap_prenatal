-- VAX-3.1: las posiciones documentadas de TD y SR/SPR son longitudinales
-- por paciente, incluso cuando pertenecen a embarazos diferentes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_vacunas_td_paciente_posicion
  ON vacunas_paciente(paciente_id, numero_dosis)
  WHERE tipo_vacuna = 'td';

CREATE UNIQUE INDEX IF NOT EXISTS ux_vacunas_spr_sr_paciente_posicion
  ON vacunas_paciente(paciente_id, numero_dosis)
  WHERE tipo_vacuna = 'spr_sr';

-- Una Tdap previa al embarazo es un antecedente y no consume la aplicacion
-- correspondiente durante el embarazo o su postparto.
DROP INDEX IF EXISTS ux_vacunas_tdap_embarazo;
CREATE UNIQUE INDEX ux_vacunas_tdap_embarazo
  ON vacunas_paciente(embarazo_id)
  WHERE tipo_vacuna = 'tdap'
    AND embarazo_id IS NOT NULL
    AND momento IN ('durante_embarazo', 'postparto_aborto');
