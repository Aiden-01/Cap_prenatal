-- Lectura de Historial: orden estable, incluyendo fechas legadas.
CREATE INDEX IF NOT EXISTS idx_auditoria_cursor
  ON auditoria_eventos ((COALESCE(fecha_hora, created_at)) DESC NULLS LAST, id DESC);

INSERT INTO permisos (codigo, descripcion, categoria)
VALUES ('auditoria.ver', 'Consultar historial de auditoria', 'auditoria')
ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion, categoria = EXCLUDED.categoria;

INSERT INTO usuario_permisos (usuario_id, permiso_id)
SELECT u.id, p.id FROM usuarios u
JOIN roles r ON r.id = u.rol_id
JOIN permisos p ON p.codigo = 'auditoria.ver'
WHERE r.nombre = 'director'
ON CONFLICT (usuario_id, permiso_id) DO NOTHING;
