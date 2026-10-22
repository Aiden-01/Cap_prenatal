-- CPREN-119: elegibilidad explícita; sin backfill ni notas ficticias.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS controles_seguimiento_notas (
  control_prenatal_id INTEGER PRIMARY KEY,
  embarazo_id INTEGER NOT NULL,
  paciente_id INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (control_prenatal_id, embarazo_id)
    REFERENCES controles_prenatales(id, embarazo_id) ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (embarazo_id, paciente_id)
    REFERENCES embarazos(id, paciente_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS controles_notas_requeridas (
  control_prenatal_id INTEGER NOT NULL REFERENCES controles_seguimiento_notas(control_prenatal_id) ON DELETE CASCADE,
  tipo VARCHAR(24) NOT NULL CHECK (tipo IN ('nota_evolucion', 'nota_enfermeria')),
  responsable_snapshot JSONB NOT NULL,
  confirmado_por INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (control_prenatal_id, tipo),
  CHECK ((jsonb_typeof(responsable_snapshot) = 'object'
    AND responsable_snapshot->>'nombre_completo' IS NOT NULL
    AND ((tipo = 'nota_evolucion' AND responsable_snapshot->>'clasificacion_profesional' = 'medico')
      OR (tipo = 'nota_enfermeria' AND responsable_snapshot->>'clasificacion_profesional' IN ('enfermeria_ae','enfermeria_ep')))) IS TRUE)
);

-- Solo INSERT real. El UPSERT de un número de control ya existente no activa históricos.
CREATE OR REPLACE FUNCTION activar_seguimiento_nuevo_control()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO controles_seguimiento_notas(control_prenatal_id, embarazo_id, paciente_id)
    VALUES(NEW.id, NEW.embarazo_id, NEW.paciente_id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'controles_prenatales'::regclass
    AND tgname = 'activar_seguimiento_nuevo_control') THEN
    CREATE TRIGGER activar_seguimiento_nuevo_control AFTER INSERT ON controles_prenatales
      FOR EACH ROW EXECUTE FUNCTION activar_seguimiento_nuevo_control();
  END IF;
END $$;

-- Las decisiones son adiciones por tipo; no se reemplazan responsables silenciosamente.
CREATE OR REPLACE FUNCTION proteger_requerimiento_nota()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'requerimiento_nota_inmutable',
    MESSAGE = 'La confirmación documental no admite reemplazo';
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'controles_notas_requeridas'::regclass
    AND tgname = 'proteger_requerimiento_nota') THEN
    CREATE TRIGGER proteger_requerimiento_nota BEFORE UPDATE ON controles_notas_requeridas
      FOR EACH ROW EXECUTE FUNCTION proteger_requerimiento_nota();
  END IF;
END $$;
