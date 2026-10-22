-- CPREN-116: asignaciones opcionales, sin inferencias ni backfill de usuarios.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo_id INTEGER
  REFERENCES cargos_personal(id) ON DELETE RESTRICT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS especialidad_id INTEGER
  REFERENCES especialidades_personal(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_usuarios_cargo ON usuarios (cargo_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_especialidad ON usuarios (especialidad_id);
