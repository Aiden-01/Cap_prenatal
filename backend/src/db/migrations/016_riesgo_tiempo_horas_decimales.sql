-- CAP-62: conserva cuartos de hora y otras centesimas en la ficha de riesgo.
-- El rango funcional de 0 a 72 horas permanece en la validacion de la API.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE fichas_riesgo_obstetrico
  ALTER COLUMN tiempo_horas TYPE NUMERIC(4,2)
  USING tiempo_horas::NUMERIC(4,2);
