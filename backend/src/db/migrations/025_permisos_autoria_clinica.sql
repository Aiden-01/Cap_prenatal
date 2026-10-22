-- CPREN-117: capacidades funcionales separadas de la clasificación profesional.
-- No concede permisos clínicos, altera roles ni infiere profesiones de nombres/IDs.
INSERT INTO permisos (codigo, descripcion, categoria) VALUES
  ('notas_evolucion.ver', 'Consultar notas de evolución médica', 'notas_evolucion'),
  ('notas_evolucion.registrar', 'Capturar notas médicas sin asumir autoría del responsable', 'notas_evolucion'),
  ('notas_evolucion.finalizar_captura', 'Finalizar captura administrativa de nota médica; no firma ni validación clínica', 'notas_evolucion'),
  ('notas_enfermeria.ver', 'Consultar notas de evolución de enfermería', 'notas_enfermeria'),
  ('notas_enfermeria.registrar', 'Capturar notas de enfermería sin asumir autoría del responsable', 'notas_enfermeria'),
  ('notas_enfermeria.finalizar_captura', 'Finalizar captura administrativa de enfermería; no firma ni validación clínica', 'notas_enfermeria'),
  ('ordenes_medicas.ver', 'Consultar órdenes médicas', 'ordenes_medicas'),
  ('ordenes_medicas.transcribir', 'Transcribir indicaciones de otro profesional sin emitirlas', 'ordenes_medicas'),
  ('ordenes_medicas.finalizar_captura', 'Finalizar captura administrativa de orden; no firma ni emisión', 'ordenes_medicas'),
  ('ordenes_medicas.emitir', 'Emitir órdenes médicas; exige además responsable médico autorizado', 'ordenes_medicas'),
  ('catalogos_profesionales.gestionar', 'Gestionar catálogos y clasificación profesional; exige rol administrativo', 'catalogos_profesionales')
ON CONFLICT (codigo) DO NOTHING;

-- Preserva la capacidad administrativa de CPREN-115/116 y concesiones existentes.
INSERT INTO usuario_permisos (usuario_id, permiso_id)
SELECT u.id, p.id FROM usuarios u
JOIN roles r ON r.id = u.rol_id
JOIN permisos p ON p.codigo = 'catalogos_profesionales.gestionar'
WHERE r.nombre IN ('admin', 'director')
ON CONFLICT (usuario_id, permiso_id) DO NOTHING;

-- Valor conservador para todos los cargos existentes. No equivale a colegiación.
ALTER TABLE cargos_personal ADD COLUMN IF NOT EXISTS clasificacion_profesional TEXT
  NOT NULL DEFAULT 'sin_clasificar';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'cargos_personal'::regclass
      AND conname = 'cargos_personal_clasificacion_profesional_check'
  ) THEN
    ALTER TABLE cargos_personal ADD CONSTRAINT cargos_personal_clasificacion_profesional_check
      CHECK (clasificacion_profesional IN ('sin_clasificar', 'medico', 'enfermeria_ae', 'enfermeria_ep', 'no_clinico'));
  END IF;
END $$;
