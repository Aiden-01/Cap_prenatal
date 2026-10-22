-- CPREN-118: notas narrativas con contexto opcional y autoría histórica separada.
-- Aplicar mediante migrate.js en su transacción; no altera filas ni tablas clínicas previas.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS notas_clinicas (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  embarazo_id INTEGER,
  control_prenatal_id INTEGER,
  tipo VARCHAR(24) NOT NULL,
  fecha_atencion DATE,
  hora_atencion TIME(0) WITHOUT TIME ZONE,
  contenido TEXT NOT NULL DEFAULT '',
  estado VARCHAR(24) NOT NULL DEFAULT 'borrador',
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  responsable_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
  responsable_snapshot JSONB NOT NULL,
  capturista_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  finalizador_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  finalizada_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  clave_idempotencia UUID NOT NULL,
  solicitud_hash CHAR(64) NOT NULL,
  CONSTRAINT notas_clinicas_tipo_check CHECK (tipo IN ('nota_evolucion', 'nota_enfermeria')),
  CONSTRAINT notas_clinicas_estado_check CHECK (estado IN ('borrador', 'captura_finalizada')),
  CONSTRAINT notas_clinicas_version_check CHECK (version >= 1),
  CONSTRAINT notas_clinicas_contenido_limite_check CHECK (char_length(contenido) <= 20000),
  CONSTRAINT notas_clinicas_solicitud_hash_check CHECK (solicitud_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT notas_clinicas_control_contexto_check CHECK (control_prenatal_id IS NULL OR embarazo_id IS NOT NULL),
  CONSTRAINT notas_clinicas_principal_contexto_check CHECK (NOT es_principal OR control_prenatal_id IS NOT NULL),
  CONSTRAINT notas_clinicas_finalizacion_check CHECK (
    (estado = 'borrador' AND finalizador_usuario_id IS NULL AND finalizada_at IS NULL)
    OR (estado = 'captura_finalizada' AND finalizador_usuario_id IS NOT NULL AND finalizada_at IS NOT NULL
      AND fecha_atencion IS NOT NULL AND hora_atencion IS NOT NULL AND contenido ~ '[^[:space:]]')
  ),
  CONSTRAINT notas_clinicas_snapshot_formato_check CHECK ((
    jsonb_typeof(responsable_snapshot) = 'object'
    AND responsable_snapshot ?& ARRAY['tipo', 'usuario_id', 'nombre_completo', 'cargo_id', 'cargo_nombre',
      'clasificacion_profesional', 'especialidad_id', 'especialidad_nombre']
    AND responsable_snapshot - ARRAY['tipo', 'usuario_id', 'nombre_completo', 'cargo_id', 'cargo_nombre',
      'clasificacion_profesional', 'especialidad_id', 'especialidad_nombre'] = '{}'::jsonb
    AND jsonb_typeof(responsable_snapshot->'nombre_completo') = 'string'
    AND char_length(btrim(responsable_snapshot->>'nombre_completo')) BETWEEN 1 AND 150
    AND jsonb_typeof(responsable_snapshot->'cargo_nombre') = 'string'
    AND char_length(btrim(responsable_snapshot->>'cargo_nombre')) BETWEEN 1 AND 150
    AND (responsable_snapshot->'especialidad_nombre' = 'null'::jsonb
      OR (jsonb_typeof(responsable_snapshot->'especialidad_nombre') = 'string'
        AND char_length(btrim(responsable_snapshot->>'especialidad_nombre')) BETWEEN 1 AND 150))
    AND (responsable_snapshot->'especialidad_id' = 'null'::jsonb
      OR jsonb_typeof(responsable_snapshot->'especialidad_id') = 'number')
    AND (
      (responsable_snapshot->>'tipo' = 'usuario' AND responsable_usuario_id IS NOT NULL
        AND responsable_snapshot->'usuario_id' = to_jsonb(responsable_usuario_id)
        AND jsonb_typeof(responsable_snapshot->'cargo_id') = 'number')
      OR (responsable_snapshot->>'tipo' = 'externo' AND responsable_usuario_id IS NULL
        AND responsable_snapshot->'usuario_id' = 'null'::jsonb
        AND responsable_snapshot->'cargo_id' = 'null'::jsonb
        AND responsable_snapshot->'especialidad_id' = 'null'::jsonb)
    )
  ) IS TRUE),
  CONSTRAINT notas_clinicas_responsable_clase_check CHECK ((
    (tipo = 'nota_evolucion' AND responsable_snapshot->>'clasificacion_profesional' = 'medico')
    OR (tipo = 'nota_enfermeria' AND responsable_snapshot->>'clasificacion_profesional' IN ('enfermeria_ae', 'enfermeria_ep'))
  ) IS TRUE),
  CONSTRAINT notas_clinicas_embarazo_paciente_fkey FOREIGN KEY (embarazo_id, paciente_id)
    REFERENCES embarazos(id, paciente_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT notas_clinicas_control_embarazo_fkey FOREIGN KEY (control_prenatal_id, embarazo_id)
    REFERENCES controles_prenatales(id, embarazo_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT notas_clinicas_capturista_clave_key UNIQUE (capturista_usuario_id, clave_idempotencia)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notas_clinicas_control_tipo_principal
  ON notas_clinicas (control_prenatal_id, tipo) WHERE es_principal;
CREATE INDEX IF NOT EXISTS idx_notas_clinicas_paciente_fecha
  ON notas_clinicas (paciente_id, fecha_atencion DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notas_clinicas_embarazo_fecha
  ON notas_clinicas (embarazo_id, fecha_atencion DESC, id DESC) WHERE embarazo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notas_clinicas_responsable ON notas_clinicas (responsable_usuario_id)
  WHERE responsable_usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notas_clinicas_finalizador ON notas_clinicas (finalizador_usuario_id)
  WHERE finalizador_usuario_id IS NOT NULL;

CREATE OR REPLACE FUNCTION notas_clinicas_proteger_registro()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'notas_clinicas_no_borrado',
      MESSAGE = 'Las notas clínicas no admiten borrado físico';
  END IF;
  IF OLD.estado = 'captura_finalizada' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'notas_clinicas_finalizada_inmutable',
      MESSAGE = 'La captura finalizada es inmutable';
  END IF;
  IF ROW(NEW.id, NEW.paciente_id, NEW.embarazo_id, NEW.control_prenatal_id, NEW.tipo,
      NEW.es_principal, NEW.capturista_usuario_id, NEW.created_at, NEW.clave_idempotencia, NEW.solicitud_hash)
    IS DISTINCT FROM ROW(OLD.id, OLD.paciente_id, OLD.embarazo_id, OLD.control_prenatal_id, OLD.tipo,
      OLD.es_principal, OLD.capturista_usuario_id, OLD.created_at, OLD.clave_idempotencia, OLD.solicitud_hash) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'notas_clinicas_identidad_inmutable',
      MESSAGE = 'El contexto y la identidad original de captura son inmutables';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'notas_clinicas_incremento_version',
      MESSAGE = 'La versión debe aumentar exactamente una unidad';
  END IF;
  IF NEW.estado = 'captura_finalizada'
    AND ROW(NEW.fecha_atencion, NEW.hora_atencion, NEW.contenido,
      NEW.responsable_usuario_id, NEW.responsable_snapshot)
    IS DISTINCT FROM ROW(OLD.fecha_atencion, OLD.hora_atencion, OLD.contenido,
      OLD.responsable_usuario_id, OLD.responsable_snapshot) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'notas_clinicas_finalizacion_solo_estado',
      MESSAGE = 'Finalizar captura no modifica contenido ni responsable';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'notas_clinicas'::regclass AND tgname = 'notas_clinicas_proteger_registro') THEN
    CREATE TRIGGER notas_clinicas_proteger_registro BEFORE UPDATE OR DELETE ON notas_clinicas
      FOR EACH ROW EXECUTE FUNCTION notas_clinicas_proteger_registro();
  END IF;
END $$;
