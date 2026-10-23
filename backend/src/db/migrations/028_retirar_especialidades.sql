-- CHECKPOINT-10: migración correctiva; conserva intactos los checksums 023–027.
-- Preparada y probada SOLO en clústeres desechables. Cualquier aplicación a una
-- base persistente requiere inventario, respaldo y aprobación independiente.
SET LOCAL lock_timeout = '5s';

ALTER TABLE usuarios DROP COLUMN IF EXISTS especialidad_id;
-- RESTRICT es intencional: una dependencia desconocida revierte la transacción.
DROP TABLE IF EXISTS especialidades_personal RESTRICT;

-- Las instantáneas históricas no se reescriben, ni siquiera en documentos ya
-- finalizados. Se valida el contrato actual al insertar o cambiar responsable;
-- editar contenido/finalizar conserva la identidad capturada previamente.
ALTER TABLE notas_clinicas DROP CONSTRAINT IF EXISTS notas_clinicas_snapshot_formato_check;

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
      'cargo_nombre', 'clasificacion_profesional']
    AND NEW.responsable_snapshot - ARRAY['tipo', 'usuario_id', 'nombre_completo', 'cargo_id',
      'cargo_nombre', 'clasificacion_profesional'] = '{}'::jsonb
    AND jsonb_typeof(NEW.responsable_snapshot->'nombre_completo') = 'string'
    AND char_length(btrim(NEW.responsable_snapshot->>'nombre_completo')) BETWEEN 1 AND 150
    AND jsonb_typeof(NEW.responsable_snapshot->'cargo_nombre') = 'string'
    AND char_length(btrim(NEW.responsable_snapshot->>'cargo_nombre')) BETWEEN 1 AND 150
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
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notas_clinicas_validar_snapshot ON notas_clinicas;
CREATE TRIGGER notas_clinicas_validar_snapshot BEFORE INSERT OR UPDATE ON notas_clinicas
  FOR EACH ROW EXECUTE FUNCTION notas_clinicas_validar_snapshot();
