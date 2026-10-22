# Registro pendiente para Jira CPREN-115

Fecha: 2026-10-22. Equipo: Trabajo. Dispositivo: Aiden29.
Issue existente indicado por el usuario: CPREN-115. Epic esperado: CPREN-3
(Producto y experiencia de usuario), pendiente de verificar cuando responda Jira.
Estado sugerido: En revisión, hasta revisar y registrar la entrega.

Jira: consulta getJiraIssue agotó tiempo de espera. No se pudo pasar a En curso,
verificar asociación al Epic ni actualizar el cierre. No se creó otro issue.
Resultados históricos ajenos a esta sesión: No verificable.

## Resultado

Implementados catálogos independientes de cargos y especialidades, migración
aditiva 023, esquema inicial sincronizado, compatibilidad de arranque, API en
cuatro capas, Zod, SQL parametrizado, auditoría privada transaccional obligatoria,
desactivación y reactivación. Roles intactos y sin columnas nuevas en usuarios.
Decisiones, alternativas y consecuencias en CPREN_115_CATALOGOS_PROFESIONALES.md.

## Archivos de la entrega

- backend/src/db/migrations/023_catalogos_profesionales.sql (nuevo)
- backend/src/db/schema.sql
- backend/src/db/schemaCompatibility.js
- backend/src/index.js
- backend/src/routes/catalogos.js (nuevo)
- backend/src/controllers/catalogosController.js (nuevo)
- backend/src/services/catalogosService.js (nuevo)
- backend/src/repositories/catalogosRepository.js (nuevo)
- backend/src/validations/catalogos.schemas.js (nuevo)
- backend/src/services/auditService.js
- backend/src/services/audit/auditFieldPolicy.js
- backend/test/catalogos.test.js (nuevo)
- backend/test/catalogosPostgres.test.js (nuevo)
- backend/test/schemaCompatibility.test.js
- backend/test/retiroReferencias.test.js
- docs/API.md
- docs/BASE_DATOS.md
- docs/CPREN_115_CATALOGOS_PROFESIONALES.md (nuevo)
- docs/CPREN_115_REGISTRO_SESION.md (nuevo)

## Pruebas y resultados verificables

- `npm test` desde backend: 1347 pruebas, 1297 aprobadas, 0 fallos,
  50 omitidas por sus condiciones de ejecución. No se habilitaron integraciones
  que aceptan conexiones a bases existentes.
- `RUN_CATALOGOS_TEMP_POSTGRES=1`, binarios PostgreSQL 18.3,
  `node --test test/catalogosPostgres.test.js`: 9 pruebas aprobadas, 0 fallos,
  0 omitidas, incluyendo instalación vacía, migración incremental, concurrencia,
  API real y auditoría con rollback. Clúster creado, cerrado y eliminado.
- Las pruebas HTTP usan 127.0.0.1. Fue necesario ejecutarlas fuera del sandbox
  debido a EACCES en conexiones locales.
- Un primer intento de integración quedó bloqueado por herencia de pipes en
  pg_ctl de Windows; se corrigió usando stdio ignore. Se verificó el cierre del
  proceso temporal y se limpió su carpeta residual. La última ejecución pasó.
- Se ajustaron dos expectativas de pruebas al nuevo esquema: lista de migraciones
  requeridas (023) y número de tablas (21, incluyendo los dos nuevos catálogos).
- Frontend: no modificado; no se ejecutaron sus pruebas ni build.
- Producción: sin acceso, sin pruebas ni migraciones.
- `git diff --check`: sin errores. SQL de 023 e inclusión en schema.sql
  comprobados idénticos. Git solo advierte conversión LF/CRLF de Windows.

## Git al cierre de implementación, antes de CHECKPOINT-01

Inicio limpio en main, e07cef0; git pull --ff-only confirmó Already up to date.
Rama creada: feature/cpren-115-catalogos-profesionales. Cambios sin staging.
Inventario final: 19 archivos (9 modificados y 10 nuevos); índice de Git vacío.
Commit: no realizado. Push: no realizado. Merge: no realizado.
Despliegue/acceso a producción: no realizado.
El checkpoint para commit y publicación de la rama se realizará por separado.
Pendiente confirmar nombres de especialidades con CAP y registrar en Jira.

## CHECKPOINT-01 — revisión para trasladar Trabajo → Casa

Fecha: 2026-10-22. Usuario autoriza crear el commit
`feat(cpren-115): implementar catalogos profesionales` y publicar exclusivamente
`feature/cpren-115-catalogos-profesionales`. No autoriza PR, merge, force push,
despliegue ni iniciar CPREN-116.

Inspección previa al índice: 19 archivos, coincidencia exacta con el inventario,
9 modificados y 10 nuevos. Leídos los diffs y los contenidos nuevos. Sin archivos
ajenos, .env, respaldos, claves privadas, credenciales ni pacientes reales.
Las identidades y textos de las pruebas son sintéticos. Inspección manual y
búsqueda de patrones de secretos sin hallazgos.

023 es aditiva respecto del sistema existente: crea dos tablas, funciones e
índices propios y ocho cargos de referencia. DROP TRIGGER solo recrea triggers
de estas nuevas tablas para permitir schema + migración. No altera ni elimina
objetos de usuarios/roles ni migraciones 004–022. Definiciones de 023 y bloque
de schema.sql idénticas. No hay cargo_id/especialidad_id nuevos en usuarios.
Se revisaron autenticación, rol y CSRF en rutas, lista fija de tablas, parámetros
SQL y auditoría privada obligatoria en la transacción.

Pruebas repetidas en CHECKPOINT-01:

- `npm test`: 1347 pruebas, 1297 aprobadas, 0 fallos, 50 omisiones esperadas.
- `node --test test/catalogosPostgres.test.js`, habilitada explícitamente con
  binarios PostgreSQL 18.3: 9 aprobadas, 0 fallos, 0 omisiones.
- Comprobación posterior: 0 directorios `cap-catalogos-*` en el temporal del
  usuario, 0 procesos de esos clústeres y 0 conexiones en el puerto 55475.
- `git diff --check`: sin errores; avisos LF/CRLF propios de Git en Windows.

### Las 50 omisiones de npm test

Todas corresponden a integraciones PostgreSQL opt-in (`RUN_*` distinto de 1),
no a fallos ni a pruebas deshabilitadas por CPREN-115. Se cotejaron los nombres
omitidos del runner contra los archivos y los bucles que generan casos.

| Archivo en backend/test | Omitidas | Activación explícita |
| --- | ---: | --- |
| auditHistoryPostgresIntegration.test.js | 1 | RUN_POSTGRES_INTEGRATION |
| auditoriaPostgres.test.js | 1 | RUN_AUDITORIA_TEMP_POSTGRES |
| calidadDatosPostgres.test.js | 1 | RUN_POSTGRES_QUALITY |
| catalogosPostgres.test.js | 1 | RUN_CATALOGOS_TEMP_POSTGRES |
| censoPrimerControlPostgres.test.js | 1 | RUN_CENSO_TEMP_POSTGRES |
| citasInasistenciasPostgres.test.js | 13 | RUN_POSTGRES_CITAS_INASISTENCIAS |
| citasPrenatalesPostgres.test.js | 1 | RUN_POSTGRES_CITAS |
| inasistenciasPostgres.test.js | 1 | RUN_POSTGRES_INASISTENCIAS |
| mapaRiesgoPostgres.test.js | 1 | RUN_MAPA_TEMP_POSTGRES |
| migrateBootstrapPostgres.test.js | 2 | RUN_POSTGRES_MIGRATE_BOOTSTRAP |
| migrateSafePostgres.test.js | 16 | RUN_POSTGRES_SAFE_MIGRATOR |
| migration008Postgres.test.js | 1 | RUN_POSTGRES_MIGRATION_008 |
| pacienteEmbarazoPostgres.test.js | 3 | RUN_POSTGRES_PATIENT_PREGNANCY |
| pacientesListadoPostgres.test.js | 1 | RUN_PACIENTES_TEMP_POSTGRES |
| patientVersionPostgres.test.js | 1 | RUN_PATIENT_VERSION_POSTGRES o RUN_CLINICAL_DATE_POSTGRES |
| retirarPermisoPacientes.test.js | 1 | RUN_RETIRO_PERMISO_TEMP_POSTGRES |
| seguimientoTdapPostgres.test.js | 1 | RUN_POSTGRES_TDAP |
| sessionActivityPostgres.test.js | 2 | RUN_POSTGRES_INTEGRATION |
| vacunasPostgresIntegration.test.js | 1 | RUN_POSTGRES_INTEGRATION |
| **Total** | **50** | |

La integración de catálogos omitida en npm test sí se ejecutó separadamente:
un test raíz y ocho subpruebas aprobadas. Las otras 49 integraciones permanecen
pendientes de un entorno aislado verificado. No activar globalmente
RUN_POSTGRES_INTEGRATION: algunas pruebas usan el pool configurado del backend.
No se conectaron bases persistentes para este checkpoint.

### Remoto, Jira y entrega

Antes de preparar el commit, GitHub no tenía la rama de trabajo y main remoto
coincidía con main local en `e07cef00f0a20931bf92e7f8f00eed2ae25d23e0`.
El commit y su publicación deben verificarse por SHA local/remoto; este documento
se incluye dentro del propio commit, por lo que no contiene su SHA autorreferente.
El resultado de la publicación queda en la entrega del checkpoint y se consulta
con `git log -1 --format=fuller` y `git ls-remote origin refs/heads/feature/cpren-115-catalogos-profesionales`.

Jira volvió a fallar en CHECKPOINT-01: getAccessibleAtlassianResources devolvió
UNAVAILABLE / Connection timed out. Pendiente registrar este contexto, SHA y
publicación en CPREN-115, verificar Epic CPREN-3 y dejar En revisión.
No se utilizó Notion. AWS no es necesario y no se accedió.
CPREN-116 sigue pendiente, sin trabajo iniciado. Especialidades sin semilla
hasta confirmar nombres con CAP. Recuperación exacta de la rama: consultar
CPREN_115_CATALOGOS_PROFESIONALES.md, sección Continuidad entre equipos.
