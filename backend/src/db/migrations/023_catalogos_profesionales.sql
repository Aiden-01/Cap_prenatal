-- CPREN-115: catálogos independientes de roles y usuarios. PostgreSQL UTF8, >= 13.
-- La clave ignora mayúsculas, diacríticos y espacios repetidos/extremos.
-- No requiere unaccent ni extensiones nuevas; los valores visibles se conservan.
CREATE OR REPLACE FUNCTION catalogo_personal_clave(valor TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT lower(btrim(regexp_replace(
    regexp_replace(normalize(valor, NFKD), U&'[\0300-\036f]', '', 'g'),
    '[[:space:]]+', ' ', 'g')))
$$;

CREATE OR REPLACE FUNCTION catalogo_personal_actualizar_fecha()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS cargos_personal (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(40),
  nombre VARCHAR(150) NOT NULL,
  descripcion VARCHAR(500),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cargos_personal_nombre_valido CHECK (catalogo_personal_clave(nombre) <> ''),
  CONSTRAINT cargos_personal_codigo_valido CHECK (codigo IS NULL OR catalogo_personal_clave(codigo) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cargos_personal_nombre ON cargos_personal (catalogo_personal_clave(nombre));
CREATE UNIQUE INDEX IF NOT EXISTS ux_cargos_personal_codigo ON cargos_personal (catalogo_personal_clave(codigo)) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cargos_personal_estado_nombre ON cargos_personal (activo, nombre, id);
DROP TRIGGER IF EXISTS cargos_personal_fecha ON cargos_personal;
CREATE TRIGGER cargos_personal_fecha BEFORE UPDATE ON cargos_personal
FOR EACH ROW EXECUTE FUNCTION catalogo_personal_actualizar_fecha();

CREATE TABLE IF NOT EXISTS especialidades_personal (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(40),
  nombre VARCHAR(150) NOT NULL,
  descripcion VARCHAR(500),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT especialidades_personal_nombre_valido CHECK (catalogo_personal_clave(nombre) <> ''),
  CONSTRAINT especialidades_personal_codigo_valido CHECK (codigo IS NULL OR catalogo_personal_clave(codigo) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_especialidades_personal_nombre ON especialidades_personal (catalogo_personal_clave(nombre));
CREATE UNIQUE INDEX IF NOT EXISTS ux_especialidades_personal_codigo ON especialidades_personal (catalogo_personal_clave(codigo)) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_especialidades_personal_estado_nombre ON especialidades_personal (activo, nombre, id);
DROP TRIGGER IF EXISTS especialidades_personal_fecha ON especialidades_personal;
CREATE TRIGGER especialidades_personal_fecha BEFORE UPDATE ON especialidades_personal
FOR EACH ROW EXECUTE FUNCTION catalogo_personal_actualizar_fecha();

-- Referencias iniciales aportadas por CAP; códigos orientativos, no acreditaciones.
INSERT INTO cargos_personal (codigo, nombre) VALUES
  ('AE', 'Auxiliar de Enfermería'),
  ('EP', 'Enfermera Profesional'),
  (NULL, 'Médico/a'),
  (NULL, 'Nutricionista'),
  (NULL, 'Laboratorista'),
  (NULL, 'Digitador/a'),
  (NULL, 'Auxiliar de Archivo'),
  ('TSR', 'Técnico de Salud Rural')
ON CONFLICT DO NOTHING;
-- Especialidades sin semilla: nombres pendientes de confirmación por CAP.
