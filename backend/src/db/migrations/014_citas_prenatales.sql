-- CITAS-01A: modelo persistente de citas prenatales.
-- No reconstruye citas historicas desde controles_prenatales.cita_siguiente.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE UNIQUE INDEX IF NOT EXISTS ux_controles_id_embarazo
  ON controles_prenatales(id, embarazo_id);

CREATE TABLE IF NOT EXISTS citas_prenatales (
  id                       BIGSERIAL PRIMARY KEY,
  embarazo_id              INTEGER NOT NULL REFERENCES embarazos(id) ON DELETE CASCADE,
  fecha_programada         DATE NOT NULL,
  estado                   VARCHAR(20) NOT NULL DEFAULT 'programada',
  control_origen_id        INTEGER NOT NULL,
  control_cumplimiento_id  INTEGER,
  reprogramada_desde_id    BIGINT,
  registrado_por           INTEGER REFERENCES usuarios(id),
  updated_by               INTEGER REFERENCES usuarios(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT citas_prenatales_estado_check CHECK (
    estado IN ('programada', 'atendida', 'cancelada', 'reprogramada')
  ),
  CONSTRAINT citas_prenatales_cumplimiento_estado_check CHECK (
    (estado = 'atendida' AND control_cumplimiento_id IS NOT NULL)
    OR (estado <> 'atendida' AND control_cumplimiento_id IS NULL)
  ),
  CONSTRAINT citas_prenatales_controles_distintos_check CHECK (
    control_cumplimiento_id IS NULL OR control_cumplimiento_id <> control_origen_id
  ),
  CONSTRAINT citas_prenatales_reprogramacion_no_circular_check CHECK (
    reprogramada_desde_id IS NULL OR reprogramada_desde_id <> id
  ),
  CONSTRAINT citas_prenatales_id_embarazo_key UNIQUE (id, embarazo_id),
  CONSTRAINT citas_prenatales_control_origen_embarazo_fkey
    FOREIGN KEY (control_origen_id, embarazo_id)
    REFERENCES controles_prenatales(id, embarazo_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT citas_prenatales_control_cumplimiento_embarazo_fkey
    FOREIGN KEY (control_cumplimiento_id, embarazo_id)
    REFERENCES controles_prenatales(id, embarazo_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT citas_prenatales_reprogramada_desde_embarazo_fkey
    FOREIGN KEY (reprogramada_desde_id, embarazo_id)
    REFERENCES citas_prenatales(id, embarazo_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

-- Un control crea una sola cita raiz. Las citas hijas de una reprogramacion
-- conservan ese origen historico y se distinguen por reprogramada_desde_id.
CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_control_origen_raiz
  ON citas_prenatales(control_origen_id)
  WHERE reprogramada_desde_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_control_cumplimiento
  ON citas_prenatales(control_cumplimiento_id)
  WHERE control_cumplimiento_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_reprogramada_desde
  ON citas_prenatales(reprogramada_desde_id)
  WHERE reprogramada_desde_id IS NOT NULL;

-- El modelo prenatal vigente solo admite una proxima cita operativa por
-- embarazo. Esta regla serializa controles, cancelaciones y reprogramaciones.
CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_programada_embarazo
  ON citas_prenatales(embarazo_id)
  WHERE estado = 'programada' AND control_cumplimiento_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_citas_programadas_fecha
  ON citas_prenatales(fecha_programada)
  WHERE estado = 'programada' AND control_cumplimiento_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_citas_embarazo_fecha
  ON citas_prenatales(embarazo_id, fecha_programada DESC);
