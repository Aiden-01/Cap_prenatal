-- CHECKPOINT-11: no modifica 023–029 ni asigna códigos a cargos existentes.
-- Revisar códigos clínicos antes de aplicar; no se infiere identidad por nombre.
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT upper(btrim(codigo)) FROM cargos_personal WHERE upper(btrim(codigo)) IN ('MED','AE','EP')
    GROUP BY upper(btrim(codigo)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Códigos clínicos duplicados; se requiere revisión administrativa';
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cargos_personal' AND column_name='clasificacion_profesional') THEN
    IF EXISTS (SELECT 1 FROM cargos_personal WHERE
      (upper(btrim(codigo))='MED' AND clasificacion_profesional NOT IN ('medico','sin_clasificar')) OR
      (upper(btrim(codigo))='AE' AND clasificacion_profesional NOT IN ('enfermeria_ae','sin_clasificar')) OR
      (upper(btrim(codigo))='EP' AND clasificacion_profesional NOT IN ('enfermeria_ep','sin_clasificar'))) THEN
      RAISE EXCEPTION 'Código clínico contradictorio; revisar catálogo antes de migrar';
    END IF;
  END IF;
END $$;
ALTER TABLE notas_clinicas DROP CONSTRAINT IF EXISTS notas_clinicas_responsable_clase_check;
ALTER TABLE cargos_personal DROP COLUMN IF EXISTS clasificacion_profesional;
UPDATE permisos SET descripcion='Gestionar catálogo de cargos; exige rol administrativo'
  WHERE codigo='catalogos_profesionales.gestionar';
CREATE OR REPLACE FUNCTION notas_clinicas_validar_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.responsable_snapshot IS NOT DISTINCT FROM OLD.responsable_snapshot
    AND NEW.responsable_usuario_id IS NOT DISTINCT FROM OLD.responsable_usuario_id THEN
    RETURN NEW;
  END IF;
  IF NOT COALESCE((
    jsonb_typeof(NEW.responsable_snapshot) = 'object'
    AND NEW.responsable_snapshot ?& ARRAY['tipo', 'usuario_id', 'nombre_completo', 'cargo_id',
      'cargo_nombre', 'cargo_codigo']
    AND NEW.responsable_snapshot - ARRAY['tipo', 'usuario_id', 'nombre_completo', 'cargo_id',
      'cargo_nombre', 'cargo_codigo'] = '{}'::jsonb
    AND jsonb_typeof(NEW.responsable_snapshot->'nombre_completo') = 'string'
    AND char_length(btrim(NEW.responsable_snapshot->>'nombre_completo')) BETWEEN 1 AND 150
    AND jsonb_typeof(NEW.responsable_snapshot->'cargo_nombre') = 'string'
    AND char_length(btrim(NEW.responsable_snapshot->>'cargo_nombre')) BETWEEN 1 AND 150
    AND NEW.responsable_snapshot->>'cargo_codigo' IN ('MED', 'AE', 'EP')
    AND (
      (NEW.responsable_snapshot->>'tipo' = 'usuario' AND NEW.responsable_usuario_id IS NOT NULL
        AND NEW.responsable_snapshot->'usuario_id' = to_jsonb(NEW.responsable_usuario_id)
        AND jsonb_typeof(NEW.responsable_snapshot->'cargo_id') = 'number')
      OR (NEW.responsable_snapshot->>'tipo' = 'externo' AND NEW.responsable_usuario_id IS NULL
        AND NEW.responsable_snapshot->'usuario_id' = 'null'::jsonb
        AND NEW.responsable_snapshot->'cargo_id' = 'null'::jsonb)
    )
  ), FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'notas_clinicas_snapshot_formato_check',
      MESSAGE = 'La instantánea del responsable no cumple el contrato de cargos';
  END IF;
  IF NOT ((NEW.tipo='nota_evolucion' AND NEW.responsable_snapshot->>'cargo_codigo'='MED')
    OR (NEW.tipo='nota_enfermeria' AND NEW.responsable_snapshot->>'cargo_codigo' IN ('AE','EP'))) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Cargo incompatible con tipo de nota';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notas_clinicas_validar_snapshot ON notas_clinicas;
CREATE TRIGGER notas_clinicas_validar_snapshot BEFORE INSERT OR UPDATE ON notas_clinicas
  FOR EACH ROW EXECUTE FUNCTION notas_clinicas_validar_snapshot();

-- El seguimiento conserva decisiones históricas inmutables; el contrato nuevo
-- se aplica a nuevas confirmaciones, sin reescribir snapshots anteriores.
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='controles_notas_requeridas'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%clasificacion_profesional%' LOOP
    EXECUTE format('ALTER TABLE controles_notas_requeridas DROP CONSTRAINT %I', item.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='controles_notas_requeridas'::regclass AND conname='requerimiento_snapshot_cargo') THEN
    ALTER TABLE controles_notas_requeridas ADD CONSTRAINT requerimiento_snapshot_cargo CHECK ((
      jsonb_typeof(responsable_snapshot)='object'
      AND responsable_snapshot ?& ARRAY['tipo','usuario_id','nombre_completo','cargo_id','cargo_nombre','cargo_codigo']
      AND responsable_snapshot - ARRAY['tipo','usuario_id','nombre_completo','cargo_id','cargo_nombre','cargo_codigo']='{}'::jsonb
      AND char_length(btrim(responsable_snapshot->>'nombre_completo')) BETWEEN 1 AND 150
      AND char_length(btrim(responsable_snapshot->>'cargo_nombre')) BETWEEN 1 AND 150
      AND ((tipo='nota_evolucion' AND responsable_snapshot->>'cargo_codigo'='MED')
        OR (tipo='nota_enfermeria' AND responsable_snapshot->>'cargo_codigo' IN ('AE','EP')))
    ) IS TRUE) NOT VALID;
  END IF;
END $$;
