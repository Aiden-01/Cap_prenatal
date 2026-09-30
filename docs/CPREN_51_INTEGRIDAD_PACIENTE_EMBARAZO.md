# CPREN-51 — Diseño y evidencia local

Fecha: 2026-09-30. Equipo Trabajo, dispositivo Aiden29. Rama main.
Base auditada: a921871a403100a7fad086fc562c7f09a804969e; árbol inicial limpio;
git pull --ff-only: Already up to date. Jira: CPREN-51, Epic CPREN-4.
Sin producción, SSH, AWS, bases reales, datos reales, deploy, commit ni push.

## Inventario anterior a 021

Verificado en schema.sql, migraciones 004–020, servicios/repositorios y catálogo
de PostgreSQL temporal reconstruido desde el HEAD indicado. Todas tienen PK
SERIAL(id), paciente_id NOT NULL y embarazo_id nullable. Cada tabla tiene dos
FK independientes: `<tabla>_paciente_id_fkey` a pacientes(id) y
`<tabla>_embarazo_id_fkey` a embarazos(id), ambas ON DELETE CASCADE,
ON UPDATE NO ACTION, MATCH SIMPLE, no diferibles. No había FK del par.

| Tabla | UNIQUE adicionales vigentes | Índices no únicos vigentes |
|---|---|---|
| controles_prenatales | ux_controles_embarazo_numero(embarazo_id,numero_control); ux_controles_id_embarazo(id,embarazo_id) | idx_controles_paciente(paciente_id); idx_controles_embarazo(embarazo_id); idx_controles_fecha(fecha) |
| vacunas_paciente | ux_vacunas_td_paciente_posicion(paciente_id,numero_dosis) WHERE tipo_vacuna='td'; ux_vacunas_spr_sr_paciente_posicion(paciente_id,numero_dosis) WHERE tipo_vacuna='spr_sr'; ux_vacunas_tdap_embarazo(embarazo_id) WHERE tipo_vacuna='tdap' AND embarazo_id IS NOT NULL AND momento IN ('durante_embarazo','postparto_aborto') | idx_vacunas_paciente(paciente_id) |
| controles_puerperio | ux_puerperio_embarazo_numero(embarazo_id,numero_atencion) | idx_puerperio_paciente(paciente_id) |
| morbilidad_embarazo | Ninguno salvo PK | idx_morbilidad_paciente(paciente_id) |
| planes_parto | ux_plan_parto_embarazo_unico(embarazo_id) | Ninguno |
| fichas_riesgo_obstetrico | ux_riesgo_embarazo_unico(embarazo_id) | idx_riesgo_paciente(paciente_id); idx_riesgo_embarazo(embarazo_id) |

Las UNIQUE iniciales por paciente/número de controles y puerperio se eliminan
en el propio schema: el modelo efectivo usa embarazo/número. Los índices
UNIQUE de embarazo permiten múltiples NULL; esto no cambia.

Embarazos: PK embarazos_pkey(id); UNIQUE
embarazos_paciente_id_numero_embarazo_key(paciente_id,numero_embarazo);
índice UNIQUE parcial ux_embarazo_activo_paciente(paciente_id) WHERE estado='activo';
idx_embarazos_paciente(paciente_id). paciente_id NOT NULL, FK a pacientes(id)
ON DELETE CASCADE. No existía UNIQUE(id,paciente_id): PK(id) por sí sola no
es un objetivo válido para una FK que referencia ambas columnas.

## Backend y NULL legacy

Los seis servicios usan utils/embarazos.js: obtenerEmbarazoDePaciente consulta
id y paciente_id simultáneamente; las mutaciones requieren embarazo_id y
validarEmbarazoEditable/Activo con bloqueo. Controles requieren embarazo activo;
puerperio, morbilidad, plan y riesgo permiten los estados editables de sus flujos.
Los repositorios clínicos refuerzan escritura mediante CTE de pertenencia y
estado; vacunas bloquea paciente y valida embarazo en el servicio antes del INSERT.
Se conserva toda esta defensa y el contrato API.

Las listas ordinarias se filtran por embarazo: los registros NULL legacy no
pertenecen a esas listas. En morbilidad/puerperio y controles hay lecturas por ID
con resolución de embarazo; no se modifica ese comportamiento legacy.
Plan/riesgo se obtienen por embarazo. Vacunas.listarAntecedentes incluye NULL
mediante LEFT JOIN; obtenerVacuna trata un NULL como antecedente de solo lectura.
TD y SR/SPR conservan posiciones longitudinales por paciente, también sin embarazo.
La DB acepta NULL en las seis tablas, incluso si la API moderna exige embarazo.
No se añade NOT NULL ni se atribuye significado clínico nuevo a NULL.

## Alternativas y elección

| Diseño | Integridad/NULL | Claridad y mantenimiento | Operaciones, concurrencia y despliegue |
|---|---|---|---|
| A: FK compuesta | Verifica par en INSERT/UPDATE y protege cambios del padre. MATCH SIMPLE permite NULL legítimo. | Declarativa; requiere UNIQUE del par. PostgreSQL soporta NOT VALID y VALIDATE. | CASCADE preservado; NO ACTION evita reasignación del padre con dependientes. Locks referenciales nativos; índice extra en padre y comprobación extra por escritura. |
| B: trigger; CHECK con función | CHECK entre tablas no garantiza integridad continua. Trigger necesitaría proteger hijos y padre y reproducir manejo NULL. | Más código y casos de mantenimiento; CHECK entre tablas no soportado como garantía. | Trigger ingenuo es vulnerable a carreras. Requiere locks y orden de adquisición manuales, con mayor riesgo de deadlocks; despliegue/validación propia. |
| C: eliminar paciente_id redundante | Derivar paciente por embarazo evita discordancia para filas con embarazo. | Rediseño más amplio y cambio de consultas/contratos. | Necesita representación separada para antecedentes NULL; afecta historia longitudinal y APIs. Fuera del alcance y sin ventaja para esta intervención. |

Elegida A: nueva constraint embarazos_id_paciente_key UNIQUE(id,paciente_id),
y seis `<tabla>_embarazo_paciente_fkey` sobre (embarazo_id,paciente_id),
REFERENCES embarazos(id,paciente_id) MATCH SIMPLE ON UPDATE NO ACTION
ON DELETE CASCADE. Se retienen las FK independientes, necesarias especialmente
para garantizar paciente existente cuando embarazo_id es NULL.

## Migración candidata y datos existentes

021_integridad_paciente_embarazo.sql. migrate.js ya aplica cada archivo en
transacción y registra checksum solo tras ejecutarlo correctamente. El archivo
no lleva BEGIN/COMMIT propios ni DML. Añade UNIQUE, las seis FK NOT VALID y luego
valida todas en la misma transacción. Con mismatch falla con 23503 y revierte
DDL y registro, conservando pacientes, embarazos y registros. No queda protección
parcial ni una migración registrada como aplicada con validación pendiente.
NOT VALID protege nuevas escrituras, pero aquí no se utiliza como despliegue en
dos etapas: los locks de DDL permanecen hasta COMMIT y la validación es atómica.

Diagnóstico listo en backend/src/db/diagnostics/paciente_embarazo_mismatches.sql:
un solo SELECT UNION ALL con seis COUNT, JOIN por embarazo y condición
embarazo_id IS NOT NULL AND e.paciente_id <> t.paciente_id. Devuelve exclusivamente
tabla y conteo; los tests demuestran 1 en la tabla inconsistente y 0 en las demás.
No comprueba huérfanos (las FK actuales los impiden). Un conteo cero no sustituye
VALIDATE: esta es la verificación final protegida por los locks de la transacción.

Antes de una futura aplicación autorizada: backup verificado, diagnóstico de
conteos, confirmar volumen/índices y ventana de mantenimiento. UNIQUE construye
índice no concurrente y toma ACCESS EXCLUSIVE en embarazos; ADD FK toma SHARE ROW
EXCLUSIVE en tablas involucradas, conservados hasta fin de transacción. VALIDATE
normalmente usa SHARE UPDATE EXCLUSIVE, pero aquí no libera los locks anteriores.
SET LOCAL lock_timeout='5s' evita espera de locks ilimitada; no limita duración
del escaneo una vez adquirido el lock. Migraciones se serializan con advisory
lock, que no serializa operaciones de aplicación. No se promete ausencia de
deadlocks; PostgreSQL puede abortar una transacción y será necesario reintentar.
El rendimiento bajo carga y tiempo de ventana no se midieron.

Para bases grandes, alternativa futura: índice UNIQUE CONCURRENTLY fuera de
transacción, attach y FK NOT VALID, validación posterior. Requiere otro flujo de
despliegue y política explícita para estado parcialmente validado; no se implementa
en migrate.js ni se ejecuta ahora. Rollback automático probado; reversión después
de COMMIT requeriría autorización y retirar primero seis FK y luego UNIQUE,
reabriendo la brecha. No se incluye rollback destructivo automático.

schema.sql incluye exactamente el mismo bloque al final para nuevas instalaciones;
compatibilidad exige 021 y checksum. Instalación nueva y doble ejecución del
migrador fueron probadas. El schema tiene normalizaciones/backfills históricos
ya existentes, incluida asignación de embarazo a NULL: no se modifican ni se
presentan como comportamiento de 021. Una futura ejecución completa del migrador
debe revisar esos efectos existentes por separado; 021 por sí sola preserva NULL.

## Watchdog y evidencia

obtenerResumenCalidadDatos ya consulta las seis tablas para
pregnancy_patient_mismatch. Se mantiene intacto. Su fixture PostgreSQL simula
una fila anterior al enforcement con FK NOT VALID en una BD desechable; sigue
detectando el mismatch, sin desactivar protección del código productivo.

PostgreSQL real 18.3, cluster nuevo en carpeta temporal, usuario sintético cpren51,
loopback 127.0.0.1:55451. Bases cap_pair/cap_quality/cap_migrate creadas y borradas
por tests; nunca se usó pool de aplicación para conectar a una base real.

| Tabla | Par correcto | Discordante | Embarazo inexistente | Paciente inexistente | NULL | DELETE embarazo/paciente | UPDATE paciente/embarazo |
|---|---|---|---|---|---|---|---|
| controles_prenatales | acepta | 23503 | 23503 | 23503 | acepta | CASCADE / CASCADE | 23503 / 23503 |
| vacunas_paciente | acepta | 23503 | 23503 | 23503 | acepta | CASCADE / CASCADE | 23503 / 23503 |
| controles_puerperio | acepta | 23503 | 23503 | 23503 | acepta | CASCADE / CASCADE | 23503 / 23503 |
| morbilidad_embarazo | acepta | 23503 | 23503 | 23503 | acepta | CASCADE / CASCADE | 23503 / 23503 |
| planes_parto | acepta | 23503 | 23503 | 23503 | acepta | CASCADE / CASCADE | 23503 / 23503 |
| fichas_riesgo_obstetrico | acepta | 23503 | 23503 | 23503 | acepta | CASCADE / CASCADE | 23503 / 23503 |

Además: cambio de paciente del padre rechazado en las seis tablas; NULL sobrevive
a DELETE embarazo; DELETE paciente elimina también NULL; mismatch previo por
cada tabla conserva todas las filas y revierte siete constraints y registro.
Se verifica nombre de la nueva FK al rechazar discordancia.

Fuentes primarias para diseño y locks:
https://www.postgresql.org/docs/current/ddl-constraints.html
https://www.postgresql.org/docs/current/sql-altertable.html

R1 queda demostrado localmente como protegido por aplicación + base de datos
con la candidata aplicada. El estado de cualquier BD real sigue sin verificar;
no afirmar que producción ya está protegida. No hay evidencia de filas reales
afectadas. CPREN-51 debe quedar En revisión, pendiente revisión del diseño y
de la migración por el usuario antes de integrar.

## Cierre verificable

- Pruebas focales: 262/262, cero fallos y omitidas. Incluyen controles, vacunas,
  puerperio, morbilidad/plan, riesgo, embarazos, compatibilidad, migrador y watchdog.
- npm test final: 1209 descubiertas, 1177 pasan, 32 omitidas, cero fallos.
  Las omitidas son integraciones opt-in; no se presentan como ejecutadas.
- Nuevo test PostgreSQL final: 16/16 pasan, cero omitidas/fallos. Incluye
  diagnóstico agregado, inventario de nullabilidad/FK/índices, 54 operaciones
  requeridas, cambio del padre, rollback de mismatch por tabla y bootstrap doble.
- Ejecución conjunta PostgreSQL anterior: 18/18 pasan, incluyendo bootstrap,
  upgrade desde 016, idempotencia y watchdog legacy. Después se añadieron
  aserciones de inventario/diagnóstico y test de sincronía schema/021; el nuevo
  archivo se volvió a ejecutar y pasó 16/16.
- Primer intento de test del cambio del padre devolvió 23505 por fixture con
  segundo embarazo activo; se corrigió el fixture a cerrado para aislar 23503.
  El test bootstrap tenía conteos fijos obsoletos y ahora deriva el total del
  inventario. No se cambió lógica de aplicación para resolver esos fallos.
- git diff --check final: exit 0, sin errores. Git avisa normalización LF/CRLF.
- git diff --stat: cinco archivos rastreados, 61 inserciones y 5 eliminaciones.
  Este comando excluye cuatro archivos nuevos aún sin seguimiento.
- git diff --cached --stat: vacío. main sigue en el HEAD original y alineada
  con origin/main; cinco modificados y cuatro nuevos, todo sin staging.
- Archivos: schema.sql, schemaCompatibility.js, migrations/021_integridad_paciente_embarazo.sql,
  diagnostics/paciente_embarazo_mismatches.sql, test/pacienteEmbarazoPostgres.test.js,
  test/schemaCompatibility.test.js, test/migrateBootstrapPostgres.test.js,
  test/calidadDatosPostgres.test.js (rutas bajo backend); este documento bajo docs.
- No se modificó DATABASE_NORMALIZATION_AUDIT.md ni otros issues restringidos.
  Sin commit, push ni despliegue. Cluster detenido; bases desechables borradas
  por los tests. Archivos temporales de cluster/logs permanecen en TEMP como evidencia.

Reproducción del nuevo test: RUN_POSTGRES_PATIENT_PREGNANCY=1,
PATIENT_PREGNANCY_TEMP_CLUSTER=1 y PATIENT_PREGNANCY_TEST_DATABASE_URL apuntando
exclusivamente a un cluster temporal loopback; desde backend ejecutar
`node --test test/pacienteEmbarazoPostgres.test.js`. No usar DATABASE_URL real.

## Aprobación de integración y bloqueo de despliegue

La revisión técnica fue aprobada el 2026-09-30 para versionado e integración
de estos nueve archivos en origin/main. La evidencia anterior corresponde a
la fase de revisión; el cierre de integración y su SHA se registran en CPREN-51.
No cambió el código aprobado durante el cierre, solo esta nota operativa.

021 NO está autorizada para producción todavía. El siguiente despliegue,
incluida la ejecución de 020/021, está bloqueado por CPREN-52 hasta auditar el
efecto completo de migrate.js y la reaplicación de schema.sql con sus backfills
históricos. CPREN-52 no se modifica durante esta integración. No se desplegó
ni se accedió a producción, bases reales o datos reales. La protección R1
está demostrada localmente y no se afirma aplicada en producción.

Validación focal de integración: 46 pruebas pasan, cero fallos y cero omitidas,
ejecutando pacienteEmbarazoPostgres, schemaCompatibility, migrateBootstrapPostgres
y calidadDatosPostgres con PostgreSQL 18.3 en un cluster temporal nuevo.
Incluye las seis tablas, rollback, bootstrap, idempotencia y watchdog legacy.
No se repitió la suite completa porque el código aprobado no cambió.
Cluster de integración detenido y bases de prueba eliminadas por sus fixtures.
