-- FIX-CITAS-INASISTENCIA-01B: estado historico y seguimiento posterior.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE citas_prenatales DROP CONSTRAINT citas_prenatales_estado_check;
ALTER TABLE citas_prenatales ADD CONSTRAINT citas_prenatales_estado_check CHECK (
  estado IN ('programada', 'atendida', 'cancelada', 'reprogramada', 'inasistente')
);

ALTER TABLE citas_prenatales
  ADD COLUMN IF NOT EXISTS seguimiento_inasistencia_desde_id BIGINT;

ALTER TABLE citas_prenatales DROP CONSTRAINT IF EXISTS citas_prenatales_seguimiento_no_circular_check;
ALTER TABLE citas_prenatales ADD CONSTRAINT citas_prenatales_seguimiento_no_circular_check
  CHECK (seguimiento_inasistencia_desde_id IS NULL OR seguimiento_inasistencia_desde_id <> id);
ALTER TABLE citas_prenatales DROP CONSTRAINT IF EXISTS citas_prenatales_derivacion_exclusiva_check;
ALTER TABLE citas_prenatales ADD CONSTRAINT citas_prenatales_derivacion_exclusiva_check
  CHECK (reprogramada_desde_id IS NULL OR seguimiento_inasistencia_desde_id IS NULL);
ALTER TABLE citas_prenatales DROP CONSTRAINT IF EXISTS citas_prenatales_seguimiento_embarazo_fkey;
ALTER TABLE citas_prenatales ADD CONSTRAINT citas_prenatales_seguimiento_embarazo_fkey
  FOREIGN KEY (seguimiento_inasistencia_desde_id, embarazo_id)
  REFERENCES citas_prenatales(id, embarazo_id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_seguimiento_inasistencia_desde
  ON citas_prenatales(seguimiento_inasistencia_desde_id)
  WHERE seguimiento_inasistencia_desde_id IS NOT NULL;

DROP INDEX ux_citas_control_origen_raiz;
CREATE UNIQUE INDEX ux_citas_control_origen_raiz
  ON citas_prenatales(control_origen_id)
  WHERE reprogramada_desde_id IS NULL
    AND seguimiento_inasistencia_desde_id IS NULL;

DROP INDEX IF EXISTS idx_citas_programadas_fecha;
CREATE INDEX idx_citas_programadas_fecha
  ON citas_prenatales(fecha_programada)
  WHERE estado = 'programada' AND control_cumplimiento_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM citas_prenatales cp
    JOIN controles_prenatales c
      ON c.embarazo_id = cp.embarazo_id AND c.fecha = cp.fecha_programada
    WHERE cp.estado = 'programada'
      AND cp.fecha_programada < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date
    GROUP BY cp.id
    HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION 'Backfill de citas: existen controles coincidentes ambiguos';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM citas_prenatales cp
    JOIN controles_prenatales c
      ON c.embarazo_id = cp.embarazo_id AND c.fecha = cp.fecha_programada
    JOIN citas_prenatales usada
      ON usada.control_cumplimiento_id = c.id AND usada.id <> cp.id
    WHERE cp.estado = 'programada'
      AND cp.fecha_programada < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date
  ) THEN
    RAISE EXCEPTION 'Backfill de citas: un control coincidente ya cumple otra cita';
  END IF;
END $$;

UPDATE citas_prenatales cp
SET estado = 'atendida',
    control_cumplimiento_id = coincidencia.control_id,
    updated_at = NOW()
FROM (
  SELECT cp2.id AS cita_id, MIN(c.id) AS control_id
  FROM citas_prenatales cp2
  JOIN controles_prenatales c
    ON c.embarazo_id = cp2.embarazo_id AND c.fecha = cp2.fecha_programada
  WHERE cp2.estado = 'programada'
    AND cp2.fecha_programada < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date
  GROUP BY cp2.id
) coincidencia
WHERE cp.id = coincidencia.cita_id AND cp.estado = 'programada';

UPDATE citas_prenatales
SET estado = 'inasistente', updated_at = NOW()
WHERE estado = 'programada'
  AND control_cumplimiento_id IS NULL
  AND fecha_programada < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date;
