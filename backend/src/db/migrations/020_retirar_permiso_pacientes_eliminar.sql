-- CPREN-40: permiso accidental; la eliminación física de pacientes no es funcionalidad del sistema.
-- El migrador ejecuta estas sentencias en una única transacción.
-- Aunque la FK permiso_id tiene ON DELETE CASCADE, retiramos las concesiones
-- explícitamente primero; la cascada solo protege frente a concesiones concurrentes.
-- Ambas sentencias son idempotentes y no afectan usuarios ni datos clínicos.
DELETE FROM usuario_permisos up
USING permisos p
WHERE up.permiso_id = p.id
  AND p.codigo = 'pacientes.eliminar';

DELETE FROM permisos
WHERE codigo = 'pacientes.eliminar';
