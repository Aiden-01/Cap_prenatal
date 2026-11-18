-- Structured capture is additive. No identities/cargos are inferred from legacy text.
SET LOCAL lock_timeout = '5s';
ALTER TABLE controles_prenatales
  ADD COLUMN nombre_atiende VARCHAR(150),
  ADD COLUMN cargo_atiende_id INTEGER REFERENCES cargos_personal(id) ON DELETE RESTRICT,
  ADD COLUMN cargo_atiende_snapshot JSONB;
ALTER TABLE controles_prenatales ADD CONSTRAINT control_cargo_atiende_snapshot_check CHECK (
  (cargo_atiende_id IS NULL AND cargo_atiende_snapshot IS NULL)
  OR (cargo_atiende_id IS NOT NULL AND cargo_atiende_snapshot IS NOT NULL
    AND jsonb_typeof(cargo_atiende_snapshot) = 'object'
    AND cargo_atiende_snapshot ?& ARRAY['id','nombre','codigo']
    AND cargo_atiende_snapshot - ARRAY['id','nombre','codigo'] = '{}'::jsonb
    AND cargo_atiende_snapshot->'id' = to_jsonb(cargo_atiende_id)
    AND jsonb_typeof(cargo_atiende_snapshot->'nombre') = 'string'
    AND char_length(btrim(cargo_atiende_snapshot->>'nombre')) BETWEEN 1 AND 150
    AND (cargo_atiende_snapshot->'codigo' = 'null'::jsonb
      OR (jsonb_typeof(cargo_atiende_snapshot->'codigo') = 'string'
        AND char_length(btrim(cargo_atiende_snapshot->>'codigo')) BETWEEN 1 AND 40))
  )
);
COMMENT ON COLUMN controles_prenatales.nombre_cargo_atiende IS 'Texto legado conservado sin inferir nombre, cargo ni identidad.';
COMMENT ON COLUMN controles_prenatales.nombre_atiende IS 'Nombre declarado de escritura libre; no acredita identidad clínica verificada.';
COMMENT ON COLUMN controles_prenatales.cargo_atiende_snapshot IS 'Instantánea del cargo seleccionado al capturar; no acredita autoría clínica.';
