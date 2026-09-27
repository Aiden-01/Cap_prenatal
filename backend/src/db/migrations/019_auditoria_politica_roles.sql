-- Retirar concesiones automáticas a admin y cualquier concesión a personal de salud.
-- Las concesiones manuales del director a admin se conservan.
WITH retirados AS (
  DELETE FROM usuario_permisos up
  USING usuarios u, roles r, permisos p
  WHERE up.usuario_id = u.id AND u.rol_id = r.id
    AND up.permiso_id = p.id AND p.codigo = 'auditoria.ver'
    AND (r.nombre = 'personal_salud' OR (r.nombre = 'admin' AND up.otorgado_por IS NULL))
  RETURNING up.usuario_id
)
UPDATE auth_sessions
SET revoked_at = NOW(), revoked_reason = 'permissions_changed', updated_at = NOW()
WHERE revoked_at IS NULL AND usuario_id IN (SELECT usuario_id FROM retirados);

INSERT INTO usuario_permisos (usuario_id, permiso_id)
SELECT u.id, p.id FROM usuarios u
JOIN roles r ON r.id = u.rol_id
JOIN permisos p ON p.codigo = 'auditoria.ver'
WHERE r.nombre = 'director'
ON CONFLICT (usuario_id, permiso_id) DO NOTHING;
