# CHECKPOINT-11 — En desarrollo, entrega parcial

Referencia visual recibida: columna fecha/hora, narrativa rayada y bloque inferior
de identificación. No se copian institución ni teléfono de la fotografía.

Primer cambio local: Perfil del usuario permite introducir nombre completo y
username. Backend acepta username, conserva la unicidad PostgreSQL existente,
restringe actualización a admin/director también en servicio, bloquea y audita
la transacción y revoca sesiones si cambia username. Las relaciones por ID y el
correo de CHECKPOINT-10 se conservan.

Pruebas ejecutadas: usuariosEmail y perfilesProfesionales, 7/7 aprobadas;
git diff --check aprobado. Estas pruebas no demuestran todavía el nuevo flujo
completo: faltan pruebas específicas de renombrado, auditoría y sesión propia.

Pendiente: retirar clasificación de backend/UI/esquema mediante migración
correctiva sin reescribir historial, elegibilidad por cargos exactos, rediseñar
PDF según fotografía, revisar muestras renderizadas, capturas y ejecutar todas
las regresiones, lint y build. No hay aprobación funcional de CHECKPOINT-11.

Rama feature/cpren-120-editor-pdf-notas-clinicas, HEAD b00ddf3.
CHECKPOINT-09/10 preservados. Sin staging, commit, push, merge, despliegue,
AWS, bases persistentes, datos clínicos reales ni CPREN-121.
