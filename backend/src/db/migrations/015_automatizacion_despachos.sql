-- N8N-OPS-01A: idempotencia tecnica para avisos semanales.
-- No almacena pacientes, citas, destinatarios ni contenido del correo.

CREATE TABLE IF NOT EXISTS automatizacion_despachos (
  id                 BIGSERIAL PRIMARY KEY,
  tipo               VARCHAR(80) NOT NULL,
  periodo_desde      DATE NOT NULL,
  periodo_hasta      DATE NOT NULL,
  estado             VARCHAR(24) NOT NULL,
  token_hash         CHAR(64),
  total_registros    INTEGER NOT NULL DEFAULT 0,
  numero_intento     INTEGER NOT NULL DEFAULT 1,
  motivo_resolucion  VARCHAR(80),
  reservado_at       TIMESTAMPTZ,
  enviado_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT automatizacion_despachos_periodo_check CHECK (
    periodo_desde <= periodo_hasta
  ),
  CONSTRAINT automatizacion_despachos_estado_check CHECK (
    estado IN ('reservado', 'enviado', 'sin_resultados', 'reintento_autorizado')
  ),
  CONSTRAINT automatizacion_despachos_total_check CHECK (total_registros >= 0),
  CONSTRAINT automatizacion_despachos_intento_check CHECK (numero_intento >= 1),
  CONSTRAINT automatizacion_despachos_token_check CHECK (
    (estado = 'reservado'
      AND token_hash IS NOT NULL
      AND reservado_at IS NOT NULL
      AND enviado_at IS NULL)
    OR (estado = 'enviado'
      AND token_hash IS NOT NULL
      AND reservado_at IS NOT NULL
      AND enviado_at IS NOT NULL)
    OR (estado = 'sin_resultados'
      AND token_hash IS NULL
      AND total_registros = 0
      AND reservado_at IS NULL
      AND enviado_at IS NULL)
    OR (estado = 'reintento_autorizado'
      AND token_hash IS NULL
      AND reservado_at IS NOT NULL
      AND enviado_at IS NULL)
  ),
  CONSTRAINT automatizacion_despachos_tipo_periodo_key UNIQUE (
    tipo, periodo_desde, periodo_hasta
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_automatizacion_despachos_token
  ON automatizacion_despachos(token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automatizacion_despachos_estado_periodo
  ON automatizacion_despachos(tipo, estado, periodo_desde DESC);
