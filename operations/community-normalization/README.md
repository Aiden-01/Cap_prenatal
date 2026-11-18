# CPREN-127 — Entrega territorial independiente

Preparación de implementación; no ejecuta cambios de datos ni workflows.

- Relación principal: `pacientes.comunidad_id` para ubicaciones catalogadas. Resolver nombre vigente mediante JOIN a comunidades; conservar texto legado y ubicación libre cuando la FK sea nula. No convertir coincidencias de nombres en vínculos automáticamente.
- PATCH: omitir comunidad_id conserva su valor; null explícito desvincula conservando ubicación libre validada. Definir longitudes coherentes (150) sin truncar valores existentes. Mantener comunidad_linguistica independiente.
- Antes de migrar: inventario agregado de FK nulas, divergencias, nombres duplicados/alias, inactivas y ubicaciones externas. Resolver casos ambiguos mediante revisión administrativa, sin eliminación.
- Adaptar una resolución territorial común en pacientesService, pacientes.schemas, comunidadesRepository, reportesRepository, citasPrenatalesRepository y automatizacionesRepository; revisar rutas de mapa, pdfController, fichaClinicaPrenatalPdf y riskPdfRenderer. Frontend: NuevaPaciente, ExpedientePaciente, Pacientes, Comunidades, Dashboard, Reportes y PlanPartoForm. Revisar contratos JSON de consumidores n8n sin modificar workflows productivos.
- Migración territorial en entrega separada. No reservar un número definitivo hasta conocer las migraciones de seguridad y controles clínicos de esta rama; usar el siguiente número libre después de ambas. La rama tiene actualmente 030 como última migración aplicada. No compartir una migración entre seguridad, controles y territorio.
- Aceptación: renombrado de comunidad visible en todos los consumidores; ubicación no catalogada conservada; PATCH sin desvinculación accidental; asociaciones ambiguas intactas; respaldo y restauración comprobados, migración en copia sintética y regresiones específicas de expedientes/mapas/reportes/PDF/citas/contratos n8n. Ninguna ejecución en producción autorizada.
