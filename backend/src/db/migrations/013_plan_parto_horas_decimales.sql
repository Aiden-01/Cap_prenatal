-- FIX-01: el tiempo al servicio se prellena desde fichas_riesgo_obstetrico,
-- donde se almacena como NUMERIC(4,1). El plan de parto debe conservar la
-- misma precision para admitir valores como 0.5 o 1.0 sin errores 22P02.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE planes_parto
  ALTER COLUMN horas_distancia TYPE NUMERIC(4,1)
  USING horas_distancia::NUMERIC(4,1);
