-- CPREN-51. Ejecutar exclusivamente mediante migrate.js (transaccion por archivo).
-- No modifica filas. Un mismatch aborta VALIDATE y revierte TODO el archivo.
-- UNIQUE requiere construir un indice; planificar ventana de mantenimiento.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  tabla TEXT;
  nombre TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'embarazos'::regclass
      AND conname = 'embarazos_id_paciente_key'
  ) THEN
    ALTER TABLE embarazos ADD CONSTRAINT embarazos_id_paciente_key UNIQUE (id, paciente_id);
  END IF;

  FOREACH tabla IN ARRAY ARRAY[
    'controles_prenatales', 'vacunas_paciente', 'controles_puerperio',
    'morbilidad_embarazo', 'planes_parto', 'fichas_riesgo_obstetrico'
  ] LOOP
    nombre := tabla || '_embarazo_paciente_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = tabla::regclass AND conname = nombre
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (embarazo_id, paciente_id) '
        'REFERENCES embarazos(id, paciente_id) MATCH SIMPLE '
        'ON UPDATE NO ACTION ON DELETE CASCADE NOT VALID', tabla, nombre
      );
    END IF;
  END LOOP;

  FOREACH tabla IN ARRAY ARRAY[
    'controles_prenatales', 'vacunas_paciente', 'controles_puerperio',
    'morbilidad_embarazo', 'planes_parto', 'fichas_riesgo_obstetrico'
  ] LOOP
    EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I',
      tabla, tabla || '_embarazo_paciente_fkey');
  END LOOP;
END $$;
