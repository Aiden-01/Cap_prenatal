# CPREN-53 — Bootstrap y upgrades seguros

## Flujo anterior documentado antes del cambio

HEAD inicial: `68bdf5194e43d78bb262760bdce6a6665cf4062d`; Git limpio,
equipo Trabajo. CPREN-53 existente bajo Epic CPREN-4; CPREN-52 Finalizada.

```text
leer schema.sql y descubrir archivos numerados ordenados
adquirir cliente
consultar to_regclass(public.pacientes), único sentinel
si no existe: BEGIN/schema/COMMIT; asegurar schema_migrations
si existe: asegurar schema_migrations
por archivo: BEGIN; advisory_xact_lock; leer registro/checksum
  omitida compatible -> COMMIT
  pendiente -> SQL + INSERT registro + COMMIT
  fallo -> ROLLBACK solo ese archivo, detener
si pacientes existía al inicio: BEGIN/schema completo/COMMIT
release cliente; end pool; error -> exit 1
```

El lock solo cubría cada archivo. El bootstrap y schema final estaban fuera.
Schema sin checksum ni registro propio. Checksums SHA-256 canónico LF con
compatibilidad LF/CRLF; sin reescritura de checksums históricos. Commits previos
no revierten ante un fallo posterior. migrate no llama seed. CPREN-52 mostró
30 DML históricos, sobrescritura de catálogo/permisos y asociación/borrado de
datos sintéticos válidos. Su informe y conclusión B se conservan sin modificarlos.

## Contrato aprobado

“schema.sql se ejecuta únicamente para bootstrap de una base nueva.
Una base existente avanza exclusivamente mediante migraciones versionadas.”

La corrección no autoriza producción. Se requiere revisión/integración,
preflight específico de la base real y ventana para 020/021. No se ejecuta
ninguna migración sobre una base real en este trabajo.

## Flujo nuevo

```text
adquirir un cliente del pool (una conexión durante toda la corrida)
SELECT pg_advisory_lock(hashtext('cap_prenatal_schema_migrations'))
clasificar la estructura mediante catálogo PostgreSQL
  AMBIGUOUS/PARTIAL -> error MIGRATION_DATABASE_PARTIAL; inspección manual
  FRESH -> leer schema.sql; BEGIN; ejecutar schema completo; COMMIT
  EXISTING -> no leer ni ejecutar schema.sql
asegurar schema_migrations (CREATE TABLE IF NOT EXISTS)
descubrir archivos numerados ordenados (inventario dinámico)
para cada archivo:
  BEGIN; pg_advisory_xact_lock(misma clave)
  SELECT registro/checksum
  registrado compatible -> COMMIT, omitida
  pendiente -> ejecutar SQL; INSERT filename/checksum; COMMIT, aplicada
  incompatible o error SQL -> ROLLBACK del archivo; detener
assertSchemaCompatible(cliente), solo lectura
registrar conteos de aplicadas/omitidas
finally:
  pg_advisory_unlock(misma clave) si fue adquirido
  si unlock falla: resultado fallido; descartar cliente al liberar al pool
  release cliente; end pool, también si falla release
resultado {ok,error}; CLI exit 1 ante fallo
```

La verificación de compatibilidad se carga de forma diferida porque ese módulo
importa el descubridor del migrador. No se cambia `schemaCompatibility`, su
lista requerida, checksums ni el arranque del servidor. Se añade su comprobación
al final del migrador, sobre el mismo cliente y dentro del lock de sesión.
La inyección de dependencias de los tests sigue el estilo del módulo existente;
no hay delays ni hooks de concurrencia en producción.

## Clasificación explícita y límites

- **FRESH:** cero relaciones de usuario fuera de los namespaces del sistema,
  excluyendo relaciones que pertenecen a extensiones. Se inspeccionan tablas,
  tablas particionadas, vistas, materializadas, foreign tables y secuencias.
  Esto es más conservador que buscar solo nombres CAP: una tabla ajena aislada
  tampoco autoriza instalar CAP automáticamente en esa base.
- **EXISTING:** las doce tablas núcleo existen como tablas normales o
  particionadas en `public`, con sus columnas mínimas de identidad/relación;
  no hay copia del núcleo en otro namespace ni registro con forma incompatible.
  Núcleo: roles, usuarios, permisos, usuario_permisos, pacientes, embarazos,
  vacunas_paciente, controles_prenatales, morbilidad_embarazo,
  controles_puerperio, planes_parto y fichas_riesgo_obstetrico.
  Identidad: id/nombre roles; id/rol_id usuarios; id/codigo permisos;
  id/usuario_id/permiso_id concesiones; id/no_expediente pacientes;
  id/paciente_id/numero_embarazo embarazos; id/paciente_id/embarazo_id clínicas.
  schema_migrations, si existe, debe ser una tabla public con
  filename/checksum/applied_at. Su ausencia no hace FRESH a una estructura
  núcleo existente: se asegura registro y aplica solo numeradas no registradas.
- **AMBIGUOUS/PARTIAL:** cualquier otro estado. Ejemplos: solo pacientes,
  usuarios, embarazos, registro sin pacientes, subconjunto de tablas,
  núcleo sustituido por vistas o sin columnas de identidad, núcleo desplazado
  de public, registro en otro schema o con forma incompatible. Se termina antes
  de bootstrap, registro o migraciones, con mensaje de inspección manual.

El núcleo independiente de upgrades evita exigir columnas/tablas introducidas
por una migración todavía pendiente; se verificó un upgrade histórico real
016→actual sin schema posterior. La clasificación reconoce una instalación;
**no certifica salud integral de tipos, constraints, índices o datos clínicos**.
El registro final/compatibilidad tampoco sustituye el preflight físico. Una base
antigua sin historial ejecutaría las numeradas no registradas: no se inventa
un historial ni se marca una migración automáticamente como aplicada.

## Lock y transacciones

Se reutiliza el namespace existente `cap_prenatal_schema_migrations`, sin
introducir otra clave arbitraria. Lock de sesión y lock transaccional usan
la misma clave bigint hashtext y el mismo cliente: PostgreSQL permite la
adquisición reentrante del dueño. El commit del archivo libera su lock
transaccional, mientras el de sesión sigue cubriendo detección, bootstrap,
registro, todos los archivos y verificación/salida. Finalmente se libera
explícitamente; si la conexión muere, PostgreSQL lo libera naturalmente.

Se probó coexistencia real de ambos locks con bootstrap/upgrade y dos procesos
npm concurrentes. Una conexión externa bloqueó schema_migrations; A adquirió
lock de sesión y quedó esperando la tabla; B fue observado en pg_stat_activity
esperando `advisory` y sin DML. Tras liberar el bloqueo, A aplicó las pendientes
y B observó el registro actualizado: cero aplicadas y cero escrituras adicionales.
Sin delays ni hooks nuevos en runtime.

No hay transacción gigante: cada archivo tiene su commit. Si 020 confirma y
021 falla, 020 permanece aplicada. Bootstrap tiene su transacción original;
si una numerada posterior falla, el bootstrap ya confirmado no revierte.
Un fallo de unlock/cierre no permite declarar éxito, pero tampoco revierte
migraciones confirmadas. La compatibilidad no hace auto-migrate ni seed.

## Bootstrap conservado y upgrade

Base nueva conserva schema completo + cada numerada real. Funciona porque el
schema instala la estructura final y las migraciones existentes contemplan
sus condiciones/idempotencia de bootstrap; se verifica ejecutándolas, no
marcándolas como aplicadas. Prueba comparativa carga el migrador anterior del
HEAD inicial mediante git show y lo ejecuta en una base temporal distinta;
el nuevo bootstrap produce exactamente las mismas constraints, índices,
catálogos y checksums (se excluyen únicamente timestamps de comparación).
Las futuras numeradas siguen descubriéndose por el patrón/orden original.

Base existente no lee schema, así que tampoco depende de que ese archivo esté
disponible para upgrade. Solo SQL de migraciones pendientes puede escribir.
Si todas están registradas, se consultan/verifican checksums y se opera locks;
CREATE TABLE IF NOT EXISTS del registro sigue presente, pero no hay DML
funcional ni DDL procedente de schema.sql. No hay normalización, backfill o
deduplicación implícita de datos de negocio.

## Evidencia PostgreSQL sintética

Pruebas reproducibles en `backend/test/migrateSafePostgres.test.js`. Exigen
RUN_POSTGRES_SAFE_MIGRATOR=1, SAFE_MIGRATOR_TEMP_CLUSTER=1 y URL temporal en
127.0.0.1. Crean/eliminan únicamente sus bases con prefijo cap_safe. Las pruebas
regulares quedan skip si no se habilita explícitamente PostgreSQL temporal.
La corrida de esta sesión utilizó un clúster nuevo PostgreSQL 18.3, aislado en
loopback, con usuario/datos sintéticos; los logs quedan en almacenamiento
temporal externo al repo, sin publicar su ruta personal.

Snapshots incluyen todas las filas public, registro/checksums/applied_at,
constraints/validación e índices. Triggers AFTER ROW en schema temporal audit53
cuentan INSERT/UPDATE/DELETE por tabla funcional, incluidos UPDATE que no
cambien valores. El registro de migraciones se mide por snapshot aparte.
No se modifica schema.sql para instrumentarlo.

| Escenario | Resultado funcional confirmado |
|---|---|
| Nueva, npm real | Aplica todas las descubiertas; 41 comunidades, 18 aliases; 020 sin permiso retirado, seis FK 021 válidas; compatible; seed no ejecutado |
| Segunda corrida nueva | Cero aplicadas, snapshots idénticos, INSERT=0 UPDATE=0 DELETE=0 |
| Hasta 019 | Solo 020/021; exactamente DELETE permiso=1 y DELETE concesión=1; sin INSERT/UPDATE funcionales |
| Hasta 020 | Solo 021; INSERT=0 UPDATE=0 DELETE=0; seis FK válidas |
| Hasta 021 y dos corridas adicionales | Cero pendientes, snapshots/registro/constraints/índices iguales; INSERT=0 UPDATE=0 DELETE=0 |
| Comunidad y auditoria.ver personalizados | Preservados valor por valor en 019/020/021; no sobrescritura |
| Seis tablas clínicas con NULL | Permanecen NULL y todas sus filas exactas |
| Vacuna previa nueva tras 021 | Permanece NULL después de npm; cero escrituras |
| Dos planes NULL legales, índice único vigente | Ambos permanecen exactos; no DELETE/backfill ni 23505 |
| Mismatch hasta 020 | 021 falla 23503, sin registro ni DDL residual; datos exactos, 020 registrada; compatibilidad rechaza falta021 |
| Mismatch hasta 019 | 020 confirma y retira accidental; 021 falla; clínica intacta; no schema posterior |
| Parciales | Fail closed, sin leer schema, snapshot idéntico y lock libre |
| Excepción bootstrap | CREATE dentro de bootstrap revierte por 22012; base sigue FRESH; lock libre |
| Checksum incompatible | Falla; no se reescribe registro ni negocio; compatibilidad requerida rechazada |
| Concurrencia A/B | B espera advisory, luego omite todo; solo dos DELETE de020 entre ambas corridas |
| Pérdida de conexión | Terminación controlada del backend temporal de un npm bloqueado; proceso sale1 y lock queda libre |

Liberación comprobada con pg_try_advisory_lock desde otro cliente después de
éxito, fallo, parcial, bootstrap fallido y conexión terminada. Las unitarias
verifican misma conexión, orden unlock/release/end, descarte tras unlock fallido,
compatibilidad LF/CRLF y rechazo de SQL modificado. La prueba 020 existente
verifica además seed posterior/repetido sin recrear pacientes.eliminar.

## Operación futura y riesgos residuales

El nuevo flujo es seguro **respecto a la reaplicación histórica de CPREN-52**
en bases existentes reconocidas, conforme a las pruebas descritas. No implica
que toda futura numerada sea inocua: su SQL explícito sigue requiriendo revisión.
No se eliminaron los 30 DML de schema ni se trasladaron a nuevas migraciones.
020,021,seed,schemaCompatibility y contratos API/frontend permanecen intactos.

Antes de cualquier producción: revisar/integrar diff; backup y restauración
verificables; validar estructura física, registro/checksums, mismatches en las
seis tablas, índices/duplicados; definir ventana sin escrituras y un solo runner;
ejecutar migrador integrado, verificar020/021, compatibilidad, restart autorizado
y healthcheck. No autorizar deploy basándose exclusivamente en este ensayo.

Riesgos: locks son cooperativos; SQL manual o ejecutores antiguos que no toman
el lock global quedan fuera de esta garantía. Hashtext conserva el namespace
histórico (colisión podría serializar innecesariamente otra operación). No se
añade timeout global para esperar el runner; cancelar debe cerrar conexión.
021 conserva lock_timeout5s y puede fallar por contención o mismatch; los
commits previos se conservan. Migraciones futuras descubiertas no son marcadas
automáticamente. Un núcleo reconocido puede tener daños no detectados por
columnas mínimas: nunca se intenta repararlo mediante schema automáticamente.

## Validación y Git

- Focales finales: migrate, nuevas safePostgres, bootstrapPostgres,
  schemaCompatibility, retirarPermisoPacientes (020 temporal/seed),
  pacienteEmbarazoPostgres (021) y seedSecurity: **94/94 pass, 0 fail, 0 skip**,
  55.701 s. Pruebas nuevas PostgreSQL: 16 escenarios, todos exitosos.
- Suite backend completa `npm test`: **1243 pruebas, 1217 pass, 0 fail,
  26 skip**, 67.357 s. Habilitadas las integraciones focales bootstrap, 021,
  CPREN-53 y 020 temporal; las otras integraciones optativas no se habilitaron.
  Los skips no se presentan como verificación de esas otras bases/escenarios.
- Hubo dos ajustes en ensayos iniciales: el checksum corrupto debía pertenecer
  a la lista requerida para probar rechazo de compatibilidad (004 no pertenece);
  la desconexión pasó a probar el proceso npm real en vez de un pool inyectado
  sin su listener de errores. Los lotes finales citados no tienen fallos.
- `git diff --check` y checks no-index de ambos archivos nuevos: exit 0.
  Solo avisos de conversión LF/CRLF según configuración Git, sin whitespace inválido.
- Archivo productivo único: backend/src/db/migrate.js. Otros: migrate.test.js,
  migrateBootstrapPostgres.test.js, nuevo migrateSafePostgres.test.js y este informe.
  Schema, 020/021, seed, schemaCompatibility, frontend y CPREN-52 sin cambios.
- Git final: rama main, HEAD inicial sin cambios; tres archivos rastreados
  modificados y dos nuevos, sin staging. Diff stat rastreado: 3 archivos,
  187 inserciones y 54 eliminaciones (los dos nuevos no figuran sin staging).
- El clúster temporal se detuvo al terminar y sus logs se conservaron fuera del repo.

No se autorizaron commit, push, despliegue, SSH ni migración de base real.
CPREN-53 queda En revisión para inspeccionar el diff; CPREN-52 no se reabre.
