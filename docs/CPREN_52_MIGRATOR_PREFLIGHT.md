# CPREN-52 — Auditoría de reaplicación de schema.sql

Fecha: 2026-09-30. Equipo: Trabajo; dispositivo Aiden29. Rama `main`.
HEAD auditado: `5b81822a38b4b0a218b233a82031fcad75cf468b`.
Jira: https://tareajiraads.atlassian.net/browse/CPREN-52, Epic CPREN-4.

## Decisión operativa

**B: `npm run db:migrate` NO debe usarse todavía en producción tal como está,
porque reaplicar `schema.sql` puede mutar datos de forma no deseada.**

No se autoriza ningún despliegue mediante este informe. Se comprobó en PostgreSQL
18.3 temporal que una base totalmente migrada hasta 021, sin mismatches, sin
backfills pendientes y con personalizaciones válidas pierde coordenadas/territorio/
sector de una comunidad y la descripción personalizada de `auditoria.ver`.
También hay asignaciones clínicas inferidas a partir de NULL, eliminación física
de planes de parto legacy y un fallo reproducible por colisión de relaciones NULL.
Una segunda ejecución sin diferencias de valores no demuestra ausencia de UPDATE
ni seguridad para datos que se hayan añadido desde la ejecución anterior.

Solo se añadió este documento. No se modificó lógica, schema ni migraciones.
No se usó producción, SSH, AWS, base real ni datos clínicos reales. Durante la
auditoría no hubo deploy, commit ni push. La auditoría ya fue revisada y CPREN-52
está Finalizada; este cierre versiona únicamente el informe. La corrección
posterior se referencia en [CPREN-53](https://tareajiraads.atlassian.net/browse/CPREN-53),
sin implementarla aquí. El `npm run db:migrate` actual **NO está autorizado para
producción** por este informe.

## 1. Secuencia exacta

Fuentes leídas completas: `backend/src/db/migrate.js`, `schema.sql`,
`schemaCompatibility.js`, `migrationChecksum.js`, `pool.js`, `backend/package.json`,
020, 021 y los tests focales. El script npm llama `node src/db/migrate.js`; no seed.

```text
try:
  leer schema.sql completo (sin checksum propio)
  descubrir nombres /^\d{3}_[a-z0-9_]+\.sql$/; ordenar lexicográficamente
  adquirir un cliente con db.connect(), o usar db si no ofrece connect
  SELECT to_regclass('public.pacientes') -> schemaInitialized
  si NO existe pacientes:
    BEGIN; query(schemaSql completo); COMMIT [ROLLBACK si falla]
    CREATE TABLE IF NOT EXISTS schema_migrations (fuera de esa transacción)
  si existe pacientes:
    CREATE TABLE IF NOT EXISTS schema_migrations (sin aplicar schema todavía)
  para cada archivo 004..021:
    leer SQL del archivo
    BEGIN
    SELECT pg_advisory_xact_lock(hashtext('cap_prenatal_schema_migrations'))
    SELECT checksum FROM schema_migrations WHERE filename = archivo
    si ya registrado:
      comprobar checksum compatible; si incompatible -> error/ROLLBACK
      si compatible -> COMMIT, contar omitida (no ejecutar SQL)
    si pendiente:
      query(SQL completo)
      INSERT schema_migrations(filename, checksum canónico)
      COMMIT; contar aplicada
    [ante error -> ROLLBACK; detener bucle]
  si schemaInitialized era TRUE al principio:
    BEGIN; query(schemaSql completo); COMMIT [ROLLBACK si falla]
  log aplicada(s)/omitida(s)
catch:
  guardar error; log código diagnóstico seguro; exitCode=1
finally:
  release cliente adquirido; db.end()
  error de cierre -> exitCode=1 y resultado ok=false
return {ok, error}
```

Orden real: 004 comunidades, 005 vistas BI, 006 comunidades admin, 007 sesiones,
008 referencias, 009 VAX2, 010 VAX31, 011 VAX4, 012 VAX5, 013 plan horas,
014 citas, 015 despachos, 016 riesgo horas, 017 inasistencias, 018 auditoría,
019 política roles, 020 retirada permiso, 021 integridad. Hay **18 archivos**,
no 21: no existen 001–003 en este directorio.

El lock es **por migración/transacción**, no por corrida completa. No protege el
bootstrap de schema, la creación inicial del registro ni el schema final. Se toma
antes de leer el registro, también para archivos omitidos. No hay transacción
global: 020 puede quedar confirmada aunque 021 falle; 021 puede quedar registrada
aunque falle el schema final. La tabla `pacientes` es el único sentinel: su presencia
no demuestra por sí sola que una base parcial tenga todas las tablas requeridas.

Checksum SHA-256 del SQL normalizado CRLF/CR a LF. Se aceptan hashes del contenido
original, LF y CRLF por compatibilidad histórica. Una modificación real de un
archivo ya aplicado aborta la corrida; cambiar finales de línea no la invalida.
No se reescribe checksum/applied_at al omitir. No existe checksum/registro para
las reaplicaciones de `schema.sql`. `schemaCompatibility` únicamente verifica
mediante SELECT el registro/checksums de 008–021 antes de abrir el backend; no
valida que los valores sean correctos ni que todas las constraints existan.

| Estado inicial | Ejecución de schema | Numeradas pendientes | Resultado observado |
|---|---|---|---|
| A. Nueva | Una vez, antes del registro/bucle | 004–021 | 18 aplicadas; 0 omitidas |
| B. Hasta 019 | Una vez, después de 021 | 020 y 021 | 2 aplicadas; 16 omitidas |
| C. Hasta 020 | Una vez, después de 021 | 021 | 1 aplicada; 17 omitidas |
| D. Hasta 021 | Una vez, después de omitir todas | Ninguna | 0 aplicadas; 18 omitidas; sí ejecuta DML |

## 2. Inventario DML y matriz de riesgo

**30 sentencias DML**: 6 INSERT (dos son UPSERT con rama UPDATE), 23 UPDATE,
1 DELETE. Las dos ramas `ON CONFLICT DO UPDATE` no son sentencias independientes.
Se cuentan por ocurrencia: los backfills de embarazos/relaciones aparecen dos
veces. No hay MERGE, TRUNCATE, SELECT INTO, funciones creadas/llamadas con DML,
ni DML oculto en el único DO final; ese DO solo crea/valida constraints.
Funciones SQL usadas en DML (`NOW`, `COALESCE`, normalización de texto, ventanas)
no escriben otras tablas por sí mismas.

Clases: A idempotente segura para conservar filas existentes; B idempotente pero
mutante; C condicionada por estado legacy; D potencialmente peligrosa; E no aplica
a bases pobladas. No se asigna E a ningún DML: todos pueden actuar sobre una base
poblada si se cumple su condición. La clase A no significa que sea política
adecuada para restaurar automáticamente elementos borrados del catálogo.
Idempotencia significa estado lógico estable con mismos datos de entrada; no
ausencia de escritura física, no ausencia de efectos de triggers y no estabilidad
cuando entran nuevos NULL/filas entre corridas.

| # / línea / sentencia | Tabla | WHERE/condición | Intención | Idempotente | Modifica existente | Sobrescribe válido | NULL | Legacy | Clase/riesgo y observación |
|---|---|---|---|---|---|---|---|---|---|
| 1 / 80 INSERT UPSERT auditoria.ver | permisos | Conflicto por codigo; sin filtro de diferencias | Catálogo auditoría | Valores sí; UPDATE siempre | Sí | Sí, descripción/categoría personalizada | No | No | D/medio: valor válido sustituido; 1 UPDATE cada corrida |
| 2 / 86 INSERT director | usuario_permisos | rol=director; conflicto DO NOTHING | Concesión predeterminada | Sí mientras no se revoque | Inserta concesión | Reinstala revocación intencional | No | No | B/medio: amplía permisos en cada migrate |
| 3 / 283 UPDATE estado | embarazos | No NULL, distinto de lower(trim), normalización reconocida | Estado canónico | Sí con entrada fija | Sí | Puede cambiar significado legacy | No NULL | Sí | C/medio: no actualiza updated_at |
| 4 / 298 UPDATE duplicados activos | embarazos | estado=activo; row_number>1 por paciente | Un solo activo | Sí con entrada fija | Sí | Sí, cierra sin decisión clínica | fecha_cierre/observaciones | Sí | D/alto: orden numero/id decide; fecha actual y texto automático |
| 5 / 779 UPDATE activo | comunidades | activo IS NULL | Default histórico | Sí | Sí | NULL desconocido pasa a TRUE | Sí | Sí | C/medio: activa sin decisión de usuario |
| 6 / 783 UPDATE timestamps | comunidades | **Sin WHERE** | Completar tiempos | Valores sí si completos | Sí, todas las filas | No sustituye no NULL | Sí | No (UPDATE universal) | B/bajo: 41 UPDATE físicos incluso sin cambios |
| 7 / 793 UPSERT 41 comunidades | comunidades | Conflicto nombre; sin filtro | Catálogo geográfico | Valores sí; UPDATE siempre | Sí | **Sí**, territorio/sector/lat/lng | No | No | D/alto: pisa edición válida, sin updated_at/updated_by |
| 8 / 847 UPDATE comunidad exacta | pacientes | comunidad_id NULL; municipio El Chal; texto coincide normalizado | Enlazar catálogo | Sí con entrada fija | Sí | No reemplaza id no NULL; sí infiere NULL | Sí | No: NULL permitido hoy | C/medio: usa incluso comunidad inactiva |
| 9 / 882 INSERT aliases | comunidades_aliases | JOIN nombre; conflicto par DO NOTHING | 18 alias predeterminados | Sí | Inserta faltantes | No reemplaza filas; puede reinstalar borrados | No | No | A/bajo: conserva alias existentes |
| 10 / 922 UPDATE alias_match | pacientes | id NULL; municipio El Chal; texto no vacío; igualdad o substring | Reconocer nombres | Con entrada fija normalmente sí | Sí | Puede asignar relación incorrecta | Sí | No: NULL permitido hoy | D/alto: substring y empate longitud sin desempate comunidad |
| 11 / 973 UPDATE metadatos | auditoria_eventos | modulo/entidad/id/fecha NULL | Completar legado | Valores sí; si registro_id NULL puede escribir siempre | Sí | Conserva no NULL | Sí | Sí o metadato opcional | C/medio: registro_id NULL deja id NULL y reitera UPDATE |
| 12 / 1030 UPDATE updated_at | vacunas_paciente | updated_at NULL | Copiar created_at | Sí si created_at no NULL | Sí | No reemplaza no NULL | Sí | Sí o NULL actual | C/bajo: si created_at NULL sigue elegible |
| 13 / 1044 INSERT embarazo | embarazos | Paciente sin ningún embarazo | Crear episodio 1 activo | Sí si episodio persiste | Inserta episodio clínico | Puede inventar episodio activo para paciente histórico | FUR/FPP opcionales | Sí o paciente sin episodio | D/alto: copia FUR/FPP paciente y fecha inicial |
| 14 / 1051 UPDATE relación | vacunas_paciente | embarazo_id NULL; mismo paciente; estado activo | Asignar episodio | Sí con entrada fija | Sí | **Sí, NULL previo válido** | Sí | No: NULL permitido | D/alto: ignora momento y fecha de vacuna |
| 15 / 1056 UPDATE relación | controles_prenatales | Igual condición | Asignar episodio | Sí con entrada fija | Sí | Puede asignar control histórico | Sí | No: NULL permitido | D/alto: no usa fecha del control |
| 16 / 1061 UPDATE relación | morbilidad_embarazo | Igual condición | Asignar episodio | Sí con entrada fija | Sí | Puede asignar consulta histórica | Sí | No: NULL permitido | D/alto: no usa fecha |
| 17 / 1066 UPDATE relación | controles_puerperio | Igual condición | Asignar episodio | Sí con entrada fija | Sí | **Sí**, puerperio histórico al activo actual | Sí | No: NULL permitido | D/alto: no comprueba episodio del parto |
| 18 / 1071 UPDATE relación | planes_parto | Igual condición | Asignar episodio | Sí si no falla | Sí | Puede asociar plan histórico | Sí | No: NULL permitido | D/alto: dos NULL legales pueden colisionar con UNIQUE antes del DELETE |
| 19 / 1076 UPDATE relación | fichas_riesgo_obstetrico | Igual condición | Asignar episodio | Sí si no falla | Sí | Puede asociar ficha histórica | Sí | No: NULL permitido | D/alto: posible colisión UNIQUE; no altera criterios de riesgo |
| 20 / 1091 DELETE duplicados | planes_parto | embarazo no NULL; row_number>1 orden fecha/updated_at/id DESC | Deduplicar | Sí después de borrar | **Elimina** | **Sí**, pierde planes distintos | Excluye NULL al inicio del CTE | Sí / tras backfill | D/alto: sin archivo ni evaluación clínica |
| 21 / 1326 UPDATE ectópico | pacientes | boolean TRUE y COALESCE(numero,0)=0 | Traducir antecedente | Sí con entrada fija | Sí | Cero/NULL pasa a 1 inferido | Sí | Sí o inconsistencia actual | C/medio: no se conoce número real |
| 22 / 1338 INSERT embarazo repetido | embarazos | Igual a #13 | Mismo backfill duplicado | Sí si episodio persiste | Inserta | Igual #13 | Sí | Sí/episodio ausente | D/alto: normalmente 0 tras #13 |
| 23 / 1345 UPDATE relación repetida | vacunas_paciente | Igual #14 | Duplicado | Sí con entrada fija | Sí | Igual #14 | Sí | No | D/alto: normalmente 0 tras #14 |
| 24 / 1350 UPDATE relación repetida | controles_prenatales | Igual #15 | Duplicado | Sí con entrada fija | Sí | Igual #15 | Sí | No | D/alto: normalmente 0 tras #15 |
| 25 / 1355 UPDATE relación repetida | morbilidad_embarazo | Igual #16 | Duplicado | Sí con entrada fija | Sí | Igual #16 | Sí | No | D/alto: normalmente 0 tras #16 |
| 26 / 1360 UPDATE relación repetida | controles_puerperio | Igual #17 | Duplicado | Sí con entrada fija | Sí | Igual #17 | Sí | No | D/alto: normalmente 0 tras #17 |
| 27 / 1365 UPDATE relación repetida | planes_parto | Igual #18 | Duplicado | Sí si no falla | Sí | Igual #18 | Sí | No | D/alto: índice ya existe aquí |
| 28 / 1370 UPDATE relación repetida | fichas_riesgo_obstetrico | Igual #19 | Duplicado | Sí si no falla | Sí | Igual #19 | Sí | No | D/alto: índice ya existe aquí |
| 29 / 1419 UPDATE FPP | pacientes | fpp NULL AND fur no NULL | Estimar FPP=FUR+280 días | Sí con entrada fija | Sí | NULL puede ser ausencia intencional | Sí | No: NULL permitido | C/medio: no sincroniza FPP no NULL ni marca derivación |
| 30 / 1423 UPDATE FPP | embarazos | Igual #29 | Estimar FPP episodio | Sí con entrada fija | Sí | Igual #29 | Sí | No: NULL permitido | C/medio: puede divergir de FPP paciente no NULL |

## 3. DDL separado y efectos indirectos

No es DML: CREATE EXTENSION pgcrypto; 19 CREATE TABLE IF NOT EXISTS (incluido
schema_migrations), CREATE INDEX/UNIQUE INDEX; ALTER TABLE ADD COLUMN; defaults,
NOT NULL, DROP/ADD/VALIDATE CONSTRAINT y DROP INDEX. El SQL íntegro de los DML y
un inventario textual de todo DDL con líneas se añaden al final de este informe.

- ADD COLUMN con defaults booleanos FALSE/TRUE, enteros 0, NOW y FK en pacientes,
  comunidades, auditoría, usuarios y seis tablas clínicas: si falta una columna,
  atribuye un valor inicial a filas existentes; IF NOT EXISTS no corrige una
  columna preexistente mal definida. FK puede fallar si datos existentes inválidos.
- comunidades líneas 787–791: activo DEFAULT TRUE y SET NOT NULL tras backfill;
  created_at/updated_at DEFAULT NOW. vacunas línea 1035: updated_at DEFAULT NOW.
  Los cambios de DEFAULT no sobrescriben columnas ya existentes de otras filas.
- Índices únicos: sesiones refresh hash; comunidades nombre; embarazo activo;
  CUI no vacío; riesgo y plan por embarazo; vacunas TD/SPR por paciente/posición,
  Tdap por embarazo/momento; controles por embarazo/número y id/embarazo;
  puerperio por embarazo/número; citas origen/cumplimiento/derivaciones/programada;
  despacho token. Pueden escanear, bloquear y fallar con duplicados. No deduplican
  salvo las sentencias DML explícitas #4/#20. IF NOT EXISTS comprueba nombre,
  no equivalencia estructural.
- Líneas 1106–1108/1114/1121: DROP índices legacy riesgo por paciente, vacunas
  por dosis y por embarazo, y constraints paciente/número de controles/puerperio.
  El índice Tdap es **DROP + CREATE sin IF NOT EXISTS** cada vez: reconstrucción.
- auditoria_eventos_accion_check se elimina/recrea y valida (963–971).
  Cinco CHECK de pacientes y embarazos_estado_check se eliminan/recrean
  **NOT VALID** (1399–1429). En nuevas y antiguas bases pueden quedar con
  convalidated=false; una constraint ya validada pierde ese estado tras schema.
  Siguen controlando filas nuevas/actualizadas; no es validación histórica total.
- DO final idéntico a 021: UNIQUE embarazos(id,paciente_id) y seis FK compuestas
  MATCH SIMPLE, ON DELETE CASCADE, NOT VALID + VALIDATE. No duplica por nombre.
  NULL embarazo_id sigue permitido. `SET LOCAL lock_timeout='5s'` aparece al
  final: cubre ese bloque, **no los DDL/DML anteriores** del schema. No hay
  statement_timeout definido por el migrador. El DO valida las seis FK aun si
  existían ya. No repara un mismatch no NULL.
- Columna generated STORED tiene_riesgo: definición solo al CREATE TABLE nuevo;
  no UPDATE explícito de criterios ni recálculo clínico global. Un UPDATE de
  embarazo_id en una ficha reevalúa la expresión almacenada, con mismos criterios.
  En el fixture su valor FALSE y criterios permanecieron iguales.
- CREATE TABLE citas incluye FK diferibles/constraints y sus índices; sobre
  tablas ya presentes no las reescribe. No hay DML directo de citas en schema.
  No hay DROP TABLE, DROP COLUMN ni TRUNCATE en schema.

## 4. Vigencia de backfills históricos

No hay flag por versión para ningún DML del schema: todos se evalúan en cada
migrate de base existente, después de numeradas. Solo dejan de cambiar valores
cuando su condición ya no se cumple. Su necesidad clínica real no se puede
demostrar sin evaluar datos y política; esta auditoría no consultó datos reales.

| Familia | Necesidad hoy | Vuelve a tocar filas válidas | Repetición / estado cambiante |
|---|---|---|---|
| Estados y cierre duplicados | Solo reparación legacy explícita | Cierra episodios sin validar clínica | Nuevos duplicados vuelven a cerrarse; usa CURRENT_DATE/NOW |
| Catálogo/alias/permisos | Inicialización o migración versionada aprobada | UPSERT pisa personalización; concede permiso revocado | UPDATE siempre; nuevos borrados/revocaciones se restauran |
| Comunidad paciente | Reparación revisada de relaciones NULL | NULL es legal; substring puede inferir mal | Nuevos NULL se asignan; empate alias no determinista |
| Timestamps auditoría/vacunas/comunidades | Reparación histórica limitada | UPDATE comunidad incluso completa | Si origen NULL no completa destino; NOW depende de corrida |
| Episodio automático/copia FUR-FPP | Bootstrap legacy con decisión de episodio | Paciente sin episodio puede ser histórico | Repite si se retira episodio; no sincroniza ya enlazados |
| Relaciones embarazo_id | Reparación explícita por historia clínica | Vacuna previa/puerperio NULL válidos se enlazan al activo | Nueva vacuna previa NULL vuelve a cambiar tras corrida previa |
| Deduplicación planes | Requiere revisión y preservación | Puede borrar planes distintos | Sobre estado estable no repite; nueva colisión sí borra/falla |
| Ectópicos/FPP | Conversión/inferencia optativa revisada | Cero o NULL legal adquiere dato inferido | Nuevos NULL/cero elegibles vuelven a cambiar |
| Citas/riesgo | No hay normalización directa de citas/criterios | Relaciones de la ficha sí cambian | Citas y valor tiene_riesgo conservaron snapshot |

## 5. Entorno, método y reproducción

PostgreSQL nativo instalado localmente; clúster NUEVO
creado con initdb, propietario local, auth trust solo en **127.0.0.1:55452**.
No se utilizó ningún servicio/base preexistente. Datos completamente sintéticos.
La versión completa y snapshots JSON están en los artefactos externos.

Artefactos externos conservados en un directorio temporal local no versionado;
se omite su ruta absoluta para no publicar información privada del equipo.
Contiene `audit.cjs`, `extra.cjs`, `final-experiments.cjs`, `results.json`,
`extra-results.json`, `final-results.json`, `focal-tests.log`, `020-tests.log`,
`pgdata` y `postgres.log`. Instrumentación exclusivamente en schema `audit52`
de bases temporales; no se instrumentó ni modificó schema.sql del repositorio.

Los scripts ejecutan realmente **npm run db:migrate**, mediante npm-cli.js y
node.exe, en backend. Sobrescriben explícitamente DATABASE_URL hacia la base
temporal, NODE_ENV=test y DB_SSL=false. La API original applyMigration se usa
solo para preparar estados registrados hasta 019/020/021. No se invoca seed
en esos experimentos. La prueba focal 020 sí invoca seed sintético por separado.

Baseline auténtico: `git show a921871a403100a7fad086fc562c7f09a804969e:backend/src/db/schema.sql`
(schema pre-021), dentro de transacción; luego aplica los archivos hasta la
versión requerida con sus checksums reales. No se falseó el registro borrando
filas de migraciones en los experimentos principales.

Fixture principal: 3 pacientes; uno activo, uno cerrado y uno sin episodio;
FUR/FPP con NULL y valor explícito diferente de FUR+280; comunidades exacta y
alias; antecedente ectópico TRUE/0; 2 filas por cada tabla clínica (una NULL
histórica, una relación correcta a episodio cerrado); influenza previo_embarazo
2025; puerperio histórico; ficha con criterios FALSE; una cita cancelada válida;
director sintético sin concesión auditoría; permiso/territorio/coordenadas
personalizados válidos; auditoría legacy; permiso accidental y concesión para 019.
Todas las FK ordinarias e índices del baseline se conservan en estos casos.

Snapshot de **todas** las tablas public como to_jsonb, ordenado por PK;
schema_migrations por filename, incluyendo checksum/applied_at. También se
capturan todas las constraints (nombre/tipo/definición/convalidated) e índices.
Se guardan conteos, SHA-256 y diferencias insertadas/actualizadas/eliminadas.
Triggers AFTER ROW capturan OLD/NEW, operación y current_query; cuentan
UPDATE físicos y separan los que cambian valores. Eventos participan en la
misma transacción: rollback elimina también sus eventos. Por eso 0 eventos en
fallo significa **0 operaciones confirmadas**, no que no se intentaran escrituras.
Las secuencias SERIAL pueden avanzar incluso con ON CONFLICT o rollback;
los snapshots/hash de filas y constraints no equivalen a snapshot de secuencias.

Reproducción en este equipo, con servidor temporal activo y nombres de base
libres: `node .../audit.cjs`, después `node .../extra.cjs` y
`node .../final-experiments.cjs`. No correr esos scripts apuntándolos a una base
existente. Al finalizar se detuvo exclusivamente este clúster; se preservaron
los artefactos y datos sintéticos para inspección. Para repetir, usar un nuevo
directorio/clúster temporal (o nombres nuevos); los scripts no borran las bases
principales de evidencia. Las pruebas existentes sí eliminan sus propias bases.

## 6. Before/after y medición

### A. Base nueva

Snapshot BEFORE sin tablas public. Primera corrida: **18 aplicadas/0 omitidas**,
1.579 s incluyendo arranque npm. AFTER: 41 comunidades, 18 aliases, 1 permiso
auditoria.ver, 18 schema_migrations; 0 pacientes, embarazos, tablas clínicas,
roles, usuarios, concesiones y citas. Seed no ejecutado. No había datos existentes
que sobrescribir. Segunda corrida 0/18, 1.069 s; datos, constraints e índices
idénticos al AFTER inicial. Mediciones con triggers en una instalación equivalente
ya bootstrap muestran 82 UPDATE comunidades + 1 permiso, sin cambios de valores.

### B/C/D. Bases hasta 019/020/021 (fixture principal)

| Métrica | Hasta 019 | Hasta 020 | Hasta 021 | Schema aislado hasta 021 |
|---|---:|---:|---:|---:|
| Numeradas aplicadas/omitidas | 2/16 | 1/17 | 0/18 | No ejecutadas |
| Duración primera corrida | 0.989 s | 0.989 s | 0.958 s | 0.160 s |
| INSERT confirmados (incluye registro) | 4 | 3 | 2 | 2 |
| UPDATE confirmados (eventos fila) | 97 | 97 | 97 | 97 |
| DELETE confirmados | 2 | 0 | 0 | 0 |
| Eventos UPDATE con valor distinto | 16 | 16 | 16 | 16 |
| Filas existentes distintas al final | 12 | 12 | 12 | 12 |
| Nuevos episodios | 1 | 1 | 1 | 1 |
| Nuevas concesiones auditoria.ver | 1 | 1 | 1 | 1 |
| Nuevos registros migración | 2 | 1 | 0 | 0 |

97 UPDATE son eventos, no 97 filas únicas cambiadas: las mismas pacientes se
actualizan en varios backfills. De 16 eventos con cambio, 12 filas preexistentes
terminan diferentes; también se actualiza el episodio recién insertado.

| Tabla | INSERT | UPDATE físicos | UPDATE con cambio | DELETE | Cambio final |
|---|---:|---:|---:|---:|---|
| comunidades | 0 | 82 | 1 | 0 | El Quetzal pierde personalización |
| permisos | 0 | 1 | 1 | 1 solo 019 | Descripción auditoría restaurada; accidental retirado por 020 |
| usuario_permisos | 1 | 0 | 0 | 1 solo 019 | Concede auditoría; retira accidental por 020 |
| pacientes | 0 | 5 | 5 | 0 | 2 filas: comunidad_id, FPP, antecedente inferido |
| embarazos | 1 | 2 | 2 | 0 | Crea episodio paciente 30; calcula FPP en 80 y nuevo |
| auditoria_eventos | 0 | 1 | 1 | 0 | Completa cuatro metadatos |
| vacunas_paciente | 0 | 1 | 1 | 0 | embarazo_id NULL -> 80, momento previo permanece |
| controles_prenatales | 0 | 1 | 1 | 0 | embarazo_id NULL -> 80 |
| morbilidad_embarazo | 0 | 1 | 1 | 0 | embarazo_id NULL -> 80 |
| controles_puerperio | 0 | 1 | 1 | 0 | embarazo_id NULL -> 80 |
| planes_parto | 0 | 1 | 1 | 0 | embarazo_id NULL -> 80 |
| fichas_riesgo_obstetrico | 0 | 1 | 1 | 0 | embarazo_id NULL -> 80; riesgo FALSE conserva valor |
| schema_migrations | 2/1/0 | 0 | 0 | 0 | Según 019/020/021 |
| citas y restantes | 0 | 0 | 0 | 0 | Sin cambios |

Valores relevantes: paciente 10 FUR 2026-01-01, FPP NULL -> 2026-10-08,
comunidad San Jose -> comunidad_id 3, ectópico 0 -> 1. Paciente 30 FUR
2026-03-01, FPP NULL -> 2026-12-06, comunidad El Quetzal -> id 5; crea embarazo
id 1 con copia FUR y posterior FPP 2026-12-06. Paciente 20/embarazo 90 conservan
FPP explícita 2026-12-01 y relaciones. Las seis filas NULL paciente 10 pasan a 80,
sin cambiar fecha histórica 2025-01-01. No hay sincronización general de fechas
paciente/embarazo ni actualización de updated_at/updated_by en estos backfills.

### Schema aislado en base estrictamente válida

Caso adicional `audit52_strict_valid`: primero completa todos los backfills,
verifica 021 y luego personaliza legalmente solo catálogo/permiso. BEFORE sin
NULL elegibles, sin mismatches, relaciones/citas correctas. Ejecución exactamente
`BEGIN; client.query(schema completo); COMMIT`, como applySchema original.
0 INSERT, **83 UPDATE** (82 comunidades, 1 permiso), 0 DELETE; 2 eventos cambian
valores, 2 filas únicas diferentes. Las nueve tablas paciente/embarazo/clínicas/
citas no cambian. Duración 0.124 s. El mismo caso mediante npm real confirma
idénticos 83 UPDATE/2 cambios, 0/18 migraciones, 1.023 s.

El Quetzal: (territorio 4, sector B, lat 1.2345678, lng -2.3456789) ->
(1, A, 16.6405946, -89.6227465). `auditoria.ver`: descripción
`Personalizacion valida` -> `Consultar historial de auditoria`.
Son valores admitidos por las constraints, no corrupción legacy ni mismatch.

### Segunda corrida y nuevas filas entre corridas

En cada fixture 019/020/021 y schema aislado: segunda corrida 0 aplicadas/18
omitidas, ~0.925–1.014 s; 0 INSERT, 83 UPDATE, 0 DELETE; **0 cambios de valores**.
Registro (checksums y fechas), datos, definiciones/validación de constraints e
índices iguales. Esto no evita reconstrucción Tdap ni recreación de CHECK.
020/021 registradas no vuelven a ejecutarse. Seed no llamado.

Caso `audit52_repeat_null`: después de completar schema, insertar una nueva
influenza previa 2024-01-01 con embarazo_id NULL (legal con 021), correr npm otra
vez: 0/18 numeradas, **84 UPDATE**, 1 cambio clínico NULL -> 80. Reaplicar schema
no es inocuo para nuevos datos válidos después de una corrida exitosa.

### Legacy y colisión de NULL

`audit52_legacy`: estructura pre-020 representativa, relajando explícitamente
índice activo/CHECK estado, índice plan y NOT NULL activo para simular legado
anterior (no se presenta como estructura canónica 019). Estado ` ACTIVO ` se
normaliza; embarazo 80 se cierra al existir 81 activo de número superior; cierre
y texto generados. Dos planes NULL se asignan a 81, después **se elimina uno**
(plan 2024 con contenido distinto), conservando el de 2025. Activo NULL pasa
a TRUE, timestamps comunidades/vacuna se rellenan. 2 INSERT, **102 UPDATE**,
1 DELETE; el bloque 021 del schema queda válido. Este caso ejecuta solo schema,
no simula que 020 haya eliminado pacientes.eliminar.

`audit52_null_collision`: base realmente hasta 021, todos sus índices vigentes;
dos planes de parto legales con embarazo_id NULL, mismo paciente. Migrador omite
18 numeradas; schema intenta enlazarlos al mismo activo y falla **23505** antes
del DELETE deduplicador, por ux_plan_parto_embarazo_unico. 0.959 s, exit 1.
Snapshot completo BEFORE=AFTER (datos/constraints/índices); 0 eventos confirmados.
Muestra que cero mismatches 021 no es un preflight suficiente para ejecutar schema.

## 7. 020 y 021

020 en caso 019: antes existe pacientes.eliminar con una concesión; después
desaparecen ambas, 2 DELETE dirigidos por código. Usuarios y clínica no se borran.
Schema no lo recrea; segunda corrida tampoco. Prueba separada existente
`retirarPermisoPacientes.test.js` habilitada con PostgreSQL temporal verifica
bootstrap, retirada, segunda aplicación y **seed repetido sin recreación**: 6/6.

021 con cero mismatches: aplica UNIQUE embarazos(id,paciente_id) y seis FK
compuestas. Después del schema final y segunda corrida siguen exactamente seis,
convalidated=true, mismo nombre/definición; ninguna duplicación. Los NULL no
son mismatches porque MATCH SIMPLE los permite. Caso 019 registra 020+021;
020 registra 021; 021 conserva registros.

Caso `audit52_mismatch`: hasta 019, morbilidad paciente 10 enlazada a embarazo
90 de paciente 20. Diagnóstico devuelve 1 en morbilidad y 0 en otras cinco.
npm aplica/confirma 020, falla 021 con **23503**, exit 1 (~0.818 s).
021 no se registra; DDL de 021 revierte; todas las filas clínicas/pacientes/
embarazos quedan intactas; catálogo y permisos auditoría no se sobrescriben
porque **no llega al schema final**. Registro crece solo con 020 y se eliminan
permiso accidental/concesión. No sería correcto afirmar que toda la corrida
quedó intacta. Ejecutar luego schema aislado también falla 23503 con
morbilidad_embarazo_embarazo_paciente_fkey y revierte íntegro; no arregla
silenciosamente el mismatch no NULL. Las seis pruebas existentes de mismatch
y operaciones INSERT/UPDATE/cascadas/NULL por tabla también pasaron.

## 8. Defectos y recomendación de corrección (sin implementarla)

La corrección posterior corresponde a
[CPREN-53](https://tareajiraads.atlassian.net/browse/CPREN-53): separar bootstrap
de schema y reparación histórica de migraciones de upgrade; preservar
personalizaciones y asociaciones clínicas válidas. Este informe conserva los
hallazgos de CPREN-52; no modifica código ni implementa o actualiza CPREN-53.

| Sentencia exacta | Efecto / reproducción | Gravedad | Cambio recomendado |
|---|---|---|---|
| `ON CONFLICT (nombre) DO UPDATE SET territorio=EXCLUDED.territorio, sector=EXCLUDED.sector, lat=EXCLUDED.lat, lng=EXCLUDED.lng` (#7) | Personalizar El Quetzal legalmente; schema revierte 4 valores | Alta: edición persistente perdida | Bootstrap insert-only o migración explícita revisada; no sobrescribir catálogo operativo |
| UPSERT auditoria.ver (#1) / INSERT director (#2) | Pisa descripción/categoría; restaura concesión ausente | Media: política/perfil editado | Separar política inicial de migración; preservar revocaciones según regla aprobada |
| `SET embarazo_id=e.id ... embarazo_id IS NULL ... e.estado='activo'` (#14–19/#23–28) | Vacuna previa/puerperio histórico NULL al activo actual; segunda corrida con nueva vacuna repite | Alta: relación clínica inferida incorrecta | Backfill versionado con diagnóstico y revisión clínica por fecha/episodio; conservar NULL legítimos |
| `DELETE FROM planes_parto ... d.fila > 1` (#20) | En legacy sin índice borra un plan distinto | Alta: pérdida irreversible sin backup | No borrar automáticamente; exportar/revisar duplicados y migración explícita |
| UPDATE planes #18 antes del DELETE, índice vigente | Dos planes NULL válidos -> 23505, migración falla | Alta operativa: bloquea deploy | Diagnóstico específico de colisiones antes del backfill; retirar backfill de schema final |
| INSERT episodio #13/#22, FPP #29/#30 y ectópico #21 | Crea activo/infiere fechas/conteos desde falta de información | Media/alta clínica | Separar reparación histórica optativa, con criterios y trazabilidad |
| Normalización/cierre #3/#4 | Cierra episodio por número/id sin validación clínica | Alta para legacy | Migración revisada; conservar evidencia y decisión explícita |
| UPDATE comunidades sin WHERE (#6) y UPSERT sin diferencia | 83 UPDATE aun sin diferencia; locks/WAL/triggers y secuencias | Baja/media operativa | Evitar DML en reaplicación; filtros IS DISTINCT FROM si apropiado |
| Schema sin advisory lock y CHECK/índice recreados | DDL repetido; ventana/validación insuficiente | Riesgo estático, concurrencia no ensayada | Lock de corrida que incluya schema; evitar recreación; revisar validación/timeout |

Arquitectura considerada: (1) conservar flujo y exigir precondiciones amplias;
(2) saltarse schema manualmente solo en deploy; (3) separar bootstrap y upgrade
versionado. Se recomienda (3), revisada y probada, porque (1) no protege nuevas
filas NULL ni ediciones válidas y (2) diverge del flujo oficial sin compatibilidad
demostrada. Consecuencia: se necesita otro cambio autorizado antes del deploy;
no se propone ejecutar 020/021 manualmente en producción desde esta auditoría.

## 9. Procedimiento operativo recomendado

**Ahora: mantener deploy bloqueado para el flujo actual auditado.** La corrección
se gestiona posteriormente en CPREN-53, con su revisión y autorización propias;
deberá implementarse y repetirse el preflight temporal del flujo corregido.
Ninguna condición simple de “0 mismatch” convierte el flujo actual en seguro.

Tras aprobar y verificar la corrección, el runbook previsto es:

1. Backup completo y ensayo de restauración; registrar evidencia sin secretos.
2. Diagnóstico solo lectura de mismatches en las seis tablas y del registro/
   checksums; inventario de personalizaciones, NULL clínicos y colisiones por
   embarazo/número/plan/ficha. Revisar episodios activos, FPP y catálogos.
3. Ventana con escrituras detenidas, un solo migrador y límites/locks definidos.
   Confirmar HEAD/artefacto exactamente validado. Revisar plan de rollback por
   archivo: una corrida no es atómica y backup es necesario si falla un tramo.
4. Ejecutar el **flujo corregido y aprobado**, jamás el actual basándose solo en
   esta auditoría; conservar salida y registro real de migraciones.
5. Verificar 020 registrada/checksum; 0 permisos pacientes.eliminar y 0 concesiones.
6. Verificar 021 registrada/checksum, UNIQUE padre y seis FK válidas, 0 mismatch;
   comparar snapshots/conteos según alcance. Preservar NULL legales.
7. Reiniciar backend solo después de validación; assertSchemaCompatible debe pasar.
8. Healthcheck y comprobaciones funcionales autorizadas, revisión de logs sin
   datos clínicos; cerrar ventana o aplicar rollback documentado si corresponde.

No se realizaron estos pasos contra una base real. La recomendación no constituye
autorización de migración, restart ni deploy.

## 10. Pruebas y cierre Git/Jira

- Focales: node --test migrate.test.js, migrateBootstrapPostgres.test.js,
  schemaCompatibility.test.js, retirarPermisoPacientes.test.js,
  pacienteEmbarazoPostgres.test.js. Bootstrap y 021 PostgreSQL habilitados hacia
  clúster temporal: **64 pruebas, 63 pass, 0 fail, 1 skip** (020 temporal en esa
  corrida estaba deshabilitada; se ejecutó enseguida separadamente).
- 020 temporal/seed: **6 pruebas, 6 pass, 0 fail, 0 skip**.
- Scripts externos: auditoría principal 6 escenarios; extra 4 escenarios;
  finales 2 escenarios, assertions satisfechas. Los 23503/23505 son resultados
  negativos esperados, no fallos de validación del ensayo.
- No se necesitan pruebas frontend ni pruebas nuevas que alteren lógica.
- Git inicio limpio; pull --ff-only: Already up to date; HEAD esperado confirmado.
- Cierre ejecutado: `git diff --check` y, por ser un archivo nuevo no rastreado,
  `git diff --no-index --check -- NUL docs/CPREN_52_MIGRATOR_PREFLIGHT.md`: ambos
  exit 0. Git solo advierte conversión LF/CRLF según su configuración, sin errores
  de whitespace. Status: `main...origin/main`, únicamente este informe `??`.
  Diff stat y cached stat vacíos porque no hay archivos rastreados modificados
  ni staging al terminar la auditoría. En esa fase no hubo commit ni push;
  posteriormente se autorizó versionar y publicar solo este informe. CPREN-52
  permanece Finalizada; CPREN-4 permanece En curso. El SHA y la verificación del
  push de este cierre documental se registran en CPREN-52.
- Evidencia histórica ajena a esta auditoría: **No verificable** si no se cuenta
  con salida/snapshot; no se infiere ningún estado de producción de estos tests.

## 11. Evidencia generada

Las tablas de hashes, comparaciones de constraints y SQL exacto a continuación
se generan desde los snapshots/SQL leídos en esta sesión. Las rutas externas
son locales y temporales; conservarlas si se desea repetir o inspeccionar evidencia.

### Motor y hashes de artefactos

```text
PostgreSQL 18.3 on x86_64-windows, compiled by msvc-19.44.35225, 64-bit
```

| Artefacto externo | SHA-256 |
|---|---|
| audit.cjs | ae05899f6e6cd764d114b9e73a7dcbfc99a9bf2131f4844ccf4e918824d29487 |
| extra.cjs | 51be57061ca884befa672ff7a489d3581f6d0e4c31f53836b2e767929d22e585 |
| final-experiments.cjs | b850aa93704c42b9241cba6d598590c28daa0a673ba453e7293575d86c5f80cd |
| results.json | c0225bd762616830cf8c8468e6f7e2bc9a0d818a6538b74c3e89867f72f8264a |
| extra-results.json | 7c6fc2e9ab652029173ecb8eb8d4fe3c1710f0901f6bcc5f39f31e24e059397f |
| final-results.json | 7bb03cc5165872316434ba14016e7e6fa27e23e6c77531c08a033353bfecfc2b |
| focal-tests.log | 265833a93088af9b6f7ce191257e1576a37ee742b6417069b71787520c67cd73 |
| 020-tests.log | 84dcd6f53fde757d4c19ee6463a14c6875a8b1a7ce7eeffb8787dcf19c960309 |

### Hash de todas las filas public (incluye registro)

| Caso | BEFORE | AFTER | Segunda corrida |
|---|---|---|---|
| audit52_new | 7cc21b783727bd7f6234ddc0a29376b6e23cb8ada234a11e7852b3655c15f98f | 7cc21b783727bd7f6234ddc0a29376b6e23cb8ada234a11e7852b3655c15f98f | 7cc21b783727bd7f6234ddc0a29376b6e23cb8ada234a11e7852b3655c15f98f |
| audit52_v19 | 6ff2c1e8bfd7d3b906d15f00fe198d27714b68e99b06224a9ae0440b082f1c15 | b90e34a697c6c5c675b1560c4be23216f8f8c0a1fab86e4e30d7b51362400d80 | b90e34a697c6c5c675b1560c4be23216f8f8c0a1fab86e4e30d7b51362400d80 |
| audit52_v20 | 877067ff99afff73b47ce1104dfb8114c211b67f4e09d9451d1b67072726e63b | 25a488805dc0ce3b2a214d1d750cf68201ef5b9766543550dd1666554e1a270e | 25a488805dc0ce3b2a214d1d750cf68201ef5b9766543550dd1666554e1a270e |
| audit52_v21 | ef0a19c50809bf1999960ebee9f14d2f324c2970266031df8172c997a8c654d9 | 73e3e1a6fcefafe11130ac64e2df07c01863ce83957239bab7af93d84c47fcee | 73e3e1a6fcefafe11130ac64e2df07c01863ce83957239bab7af93d84c47fcee |
| audit52_schema | f230d7c91822f07aa452010d1f84d9c94dd320c509b308407cb480c14ede86b7 | 5b0dc1ba55bd5f3be0fe07152b4bd1ac9f4226213daa59da991183a3eaf854ad | 5b0dc1ba55bd5f3be0fe07152b4bd1ac9f4226213daa59da991183a3eaf854ad |
| audit52_mismatch | 0656d25c11e887a245e841f34e8b42ce3fed7f618bc7ac4ce737be9aba1ef80d | f25a2a3750d3f82272439f7e030c56f9c68232250e00d254ee12dfd0f22a2ddd | No aplica |
| audit52_strict_valid | 36024264fbf11538dfda0f6a240699d67feb1e8b98202b6a3b1e7031b82c2b5d | 2ebc41cb9d5e78a6c8534e5b5fb8c121cfe602ce96590e7935a63bec5ba534ef | No aplica |
| audit52_legacy | 1b35baf80a258f5bf1103027b5048bfe42690003b4b65d6a52a7d1f0e9f17db8 | 7265f3917b680f3489418e5960c52c3bdec2bf9ae5634991501fcbf8b22f86c7 | No aplica |
| audit52_null_collision | 0b8c0e1c955eeea6b06a3ebbe5777a5b5b6e9e079612b5e73dcc47159e23e381 | 0b8c0e1c955eeea6b06a3ebbe5777a5b5b6e9e079612b5e73dcc47159e23e381 | No aplica |
| audit52_repeat_null | a108ada81120fd9c4bb619b6f9ad332ea96e9f269efcd16546f977b53d999661 | 3938c26cd048ecd7c0c3122d503f27d5fdde6b1e5259a436185c4ad6b40879e8 | No aplica |
| new_complete | 44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a | f96ecb510c103aac2268af74d44ca6de802df1a49acca3b141d29b422b37d973 | f96ecb510c103aac2268af74d44ca6de802df1a49acca3b141d29b422b37d973 |
| validFull | 36024264fbf11538dfda0f6a240699d67feb1e8b98202b6a3b1e7031b82c2b5d | 2ebc41cb9d5e78a6c8534e5b5fb8c121cfe602ce96590e7935a63bec5ba534ef | No aplica |

### Cambios de constraints / índices

| Caso | Constraints BEFORE/AFTER | Índices BEFORE/AFTER | FK compuestas válidas AFTER |
|---|---|---|---|
| audit52_new | 200/200 | 80/80 | 6 |
| audit52_v19 | 193/200 | 79/80 | 6 |
| audit52_v20 | 193/200 | 79/80 | 6 |
| audit52_v21 | 200/200 | 80/80 | 6 |
| audit52_schema | 200/200 | 80/80 | 6 |
| audit52_mismatch | 193/193 | 79/79 | 0 |
| audit52_strict_valid | 200/200 | 80/80 | 6 |
| audit52_legacy | 191/200 | 77/80 | 6 |
| audit52_null_collision | 200/200 | 80/80 | 6 |
| audit52_repeat_null | 200/200 | 80/80 | 6 |
| new_complete | 0/200 | 0/80 | 6 |
| validFull | 200/200 | 80/80 | 6 |

### SQL exacto de las 30 sentencias DML (comentarios omitidos)

#### DML 1

```sql
INSERT INTO permisos (codigo, descripcion, categoria)
VALUES ('auditoria.ver', 'Consultar historial de auditoria', 'auditoria')
ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion, categoria = EXCLUDED.categoria;
```

#### DML 2

```sql
INSERT INTO usuario_permisos (usuario_id, permiso_id)
SELECT u.id, p.id FROM usuarios u
JOIN roles r ON r.id = u.rol_id
JOIN permisos p ON p.codigo = 'auditoria.ver'
WHERE r.nombre = 'director'
ON CONFLICT (usuario_id, permiso_id) DO NOTHING;
```

#### DML 3

```sql
UPDATE embarazos
SET estado = LOWER(BTRIM(estado))
WHERE estado IS NOT NULL
  AND estado <> LOWER(BTRIM(estado))
  AND LOWER(BTRIM(estado)) IN ('activo','puerperio','cerrado');
```

#### DML 4

```sql
WITH embarazos_activos_duplicados AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY paciente_id
           ORDER BY numero_embarazo DESC, id DESC
         ) AS orden
  FROM embarazos
  WHERE estado = 'activo'
)
UPDATE embarazos e
SET estado = 'cerrado',
    fecha_cierre = COALESCE(e.fecha_cierre, CURRENT_DATE),
    observaciones = CONCAT_WS(
      E'\n',
      NULLIF(e.observaciones, ''),
      'Cerrado automaticamente por migracion: se conserva solo un embarazo activo por paciente.'
    ),
    updated_at = NOW()
FROM embarazos_activos_duplicados d
WHERE e.id = d.id
  AND d.orden > 1;
```

#### DML 5

```sql
UPDATE comunidades
SET activo = TRUE
WHERE activo IS NULL;
```

#### DML 6

```sql
UPDATE comunidades
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, created_at, NOW());
```

#### DML 7

```sql
INSERT INTO comunidades (nombre, territorio, sector, lat, lng) VALUES
('El Chal - Barrio El Paraiso',  1, 'A', 16.6413305, -89.6532061),
('El Chal - Barrio El Milagro',  1, 'A', 16.6437140, -89.6506727),
('El Chal - Barrio San Jose',    1, 'A', 16.6398064, -89.6487991),
('El Chal - Barrio San Carlos',  1, 'A', 16.6427232, -89.6459623),
('El Quetzal',                   1, 'A', 16.6405946, -89.6227465),
('El Pumpal',                    1, 'A', 16.6065883, -89.7420528),
('Colpeten',                     2, 'A', 16.6218176, -89.5774469),
('La Puente',                    2, 'A', 16.6239266, -89.5527262),
('Santa Cruz',                   2, 'A', 16.6707291, -89.5535994),
('San Juan',                     2, 'A', 16.6319576, -89.6052651),
('Santa Rosita',                 2, 'A', 16.5441646, -89.5837132),
('Nuevas Delicias',              2, 'B', 16.4928588, -89.6593942),
('La Lucha',                     2, 'B', 16.4520810, -89.6622162),
('Nuevo Paraiso La Machaca',     2, 'B', 16.4362489, -89.7393241),
('El Eden',                      2, 'B', 16.5020347, -89.6613821),
('Las Vegas',                    2, 'B', 16.4372110, -89.7381540),
('Grupo San Luis',               2, 'B', 16.4757422, -89.6190326),
('Poxte II',                     2, 'B', 16.4748152, -89.7336811),
('Cooperativa Las Flores',       3, 'A', 16.5524902, -89.7181597),
('Agricultores Unidos',          3, 'A', 16.5578381, -89.6663828),
('Cooperativa La Amistad',       3, 'A', 16.5502894, -89.7013798),
('El Esfuerzo',                  3, 'A', 16.5025075, -89.6837772),
('Kilometro 13',                 3, 'A', 16.5561570, -89.6798629),
('La Verde',                     3, 'A', 16.4989726, -89.7138009),
('Poxte I',                      3, 'B', 16.4555599, -89.7974020),
('Eben-Ezer',                    3, 'B', 16.5279709, -89.7923922),
('El Quetzalito',                3, 'B', 16.5347976, -89.7629436),
('San Rafael Amatitlan',         3, 'B', 16.4401001, -89.8170178),
('Santa Amelia',                 4, 'A', 16.4080343, -89.8948164),
('Mojarras I',                   4, 'A', 16.3801059, -89.8741604),
('Mojarras II',                  4, 'A', 16.40226282131863, -89.8990505105014),
('San Jorge',                    4, 'A', 16.338472657333902, -89.8784960339523),
('Sesaltul',                     4, 'A', 16.3794715, -89.8405779),
('Guacamayas I',                 4, 'A', 16.3577902, -89.8530546),
('Guacamayas II',                4, 'A', 16.3609375, -89.8279112),
('La Guadalupe',                 4, 'B', 16.5106962, -89.9100160),
('Las Rosas',                    4, 'B', 16.4542490, -89.9089697),
('Union Bayer',                  4, 'B', 16.4813219, -89.8432352),
('Finca Africa',                 4, 'B', 16.4530400, -89.8777100),
('La Oriental',                  4, 'B', 16.4654899, -89.9200571),
('Los Angeles',                  4, 'B', 16.4854540, -89.8905001)
ON CONFLICT (nombre) DO UPDATE SET
  territorio = EXCLUDED.territorio,
  sector = EXCLUDED.sector,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng;
```

#### DML 8

```sql
UPDATE pacientes p
SET comunidad_id = c.id
FROM comunidades c
WHERE p.comunidad_id IS NULL
  AND LOWER(BTRIM(COALESCE(p.municipio, ''))) = 'el chal'
  AND TRIM(LOWER(p.comunidad)) = TRIM(LOWER(c.nombre));
```

#### DML 9

```sql
WITH aliases(nombre, alias) AS (
  VALUES
    ('El Chal - Barrio El Paraiso', 'El Paraiso'),
    ('El Chal - Barrio El Paraiso', 'Barrio El Paraiso'),
    ('El Chal - Barrio El Paraiso', 'Paraiso'),
    ('El Chal - Barrio El Milagro', 'El Milagro'),
    ('El Chal - Barrio El Milagro', 'Barrio El Milagro'),
    ('El Chal - Barrio San Jose', 'San Jose'),
    ('El Chal - Barrio San Jose', 'Barrio San Jose'),
    ('El Chal - Barrio San Carlos', 'San Carlos'),
    ('El Chal - Barrio San Carlos', 'Barrio San Carlos'),
    ('Nuevo Paraiso La Machaca', 'Nuevo Paraiso'),
    ('Nuevo Paraiso La Machaca', 'La Machaca'),
    ('Nuevo Paraiso La Machaca', 'Paraiso La Machaca'),
    ('Cooperativa Las Flores', 'Las Flores'),
    ('Cooperativa La Amistad', 'La Amistad'),
    ('San Rafael Amatitlan', 'San Rafael'),
    ('San Rafael Amatitlan', 'San Rafael Amatitlan'),
    ('Union Bayer', 'Union Bayer'),
    ('Finca Africa', 'Africa')
)
INSERT INTO comunidades_aliases (comunidad_id, alias)
SELECT c.id, a.alias
FROM aliases a
JOIN comunidades c ON c.nombre = a.nombre
ON CONFLICT (comunidad_id, alias) DO NOTHING;
```

#### DML 10

```sql
WITH alias_match AS (
  SELECT DISTINCT ON (p.id)
    p.id AS paciente_id,
    ca.comunidad_id
  FROM pacientes p
  JOIN comunidades_aliases ca ON (
    regexp_replace(
      translate(LOWER(BTRIM(COALESCE(p.comunidad, ''))), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '',
      'g'
    ) = regexp_replace(
      translate(LOWER(BTRIM(ca.alias)), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '',
      'g'
    )
    OR regexp_replace(
      translate(LOWER(BTRIM(COALESCE(p.comunidad, ''))), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '',
      'g'
    ) LIKE '%' || regexp_replace(
      translate(LOWER(BTRIM(ca.alias)), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '',
      'g'
    ) || '%'
  )
  WHERE p.comunidad_id IS NULL
    AND LOWER(BTRIM(COALESCE(p.municipio, ''))) = 'el chal'
    AND COALESCE(BTRIM(p.comunidad), '') <> ''
  ORDER BY p.id, LENGTH(ca.alias) DESC
)
UPDATE pacientes p
SET comunidad_id = alias_match.comunidad_id
FROM alias_match
WHERE p.id = alias_match.paciente_id
  AND p.comunidad_id IS NULL;
```

#### DML 11

```sql
UPDATE auditoria_eventos
SET modulo = COALESCE(modulo, tabla),
    entidad_afectada = COALESCE(entidad_afectada, tabla),
    id_entidad = COALESCE(id_entidad, registro_id),
    fecha_hora = COALESCE(fecha_hora, created_at, NOW())
WHERE modulo IS NULL
   OR entidad_afectada IS NULL
   OR id_entidad IS NULL
   OR fecha_hora IS NULL;
```

#### DML 12

```sql
UPDATE vacunas_paciente
SET updated_at = created_at
WHERE updated_at IS NULL;
```

#### DML 13

```sql
INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur, fpp, fecha_inicio, registrado_por)
SELECT p.id, 1, 'activo', p.fur, p.fpp, COALESCE(p.fur, p.created_at::date, CURRENT_DATE), p.registrado_por
FROM pacientes p
WHERE NOT EXISTS (
  SELECT 1 FROM embarazos e WHERE e.paciente_id = p.id
);
```

#### DML 14

```sql
UPDATE vacunas_paciente v
SET embarazo_id = e.id
FROM embarazos e
WHERE v.embarazo_id IS NULL AND v.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 15

```sql
UPDATE controles_prenatales c
SET embarazo_id = e.id
FROM embarazos e
WHERE c.embarazo_id IS NULL AND c.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 16

```sql
UPDATE morbilidad_embarazo m
SET embarazo_id = e.id
FROM embarazos e
WHERE m.embarazo_id IS NULL AND m.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 17

```sql
UPDATE controles_puerperio cp
SET embarazo_id = e.id
FROM embarazos e
WHERE cp.embarazo_id IS NULL AND cp.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 18

```sql
UPDATE planes_parto pp
SET embarazo_id = e.id
FROM embarazos e
WHERE pp.embarazo_id IS NULL AND pp.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 19

```sql
UPDATE fichas_riesgo_obstetrico r
SET embarazo_id = e.id
FROM embarazos e
WHERE r.embarazo_id IS NULL AND r.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 20

```sql
WITH planes_parto_duplicados AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY embarazo_id
      ORDER BY fecha DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC
    ) AS fila
  FROM planes_parto
  WHERE embarazo_id IS NOT NULL
)
DELETE FROM planes_parto pp
USING planes_parto_duplicados d
WHERE pp.id = d.id AND d.fila > 1;
```

#### DML 21

```sql
UPDATE pacientes
SET antec_emb_ectopico_num = 1
WHERE antec_emb_ectopico = TRUE
  AND COALESCE(antec_emb_ectopico_num, 0) = 0;
```

#### DML 22

```sql
INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur, fpp, fecha_inicio, registrado_por)
SELECT p.id, 1, 'activo', p.fur, p.fpp, COALESCE(p.fur, p.created_at::date, CURRENT_DATE), p.registrado_por
FROM pacientes p
WHERE NOT EXISTS (
  SELECT 1 FROM embarazos e WHERE e.paciente_id = p.id
);
```

#### DML 23

```sql
UPDATE vacunas_paciente v
SET embarazo_id = e.id
FROM embarazos e
WHERE v.embarazo_id IS NULL AND v.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 24

```sql
UPDATE controles_prenatales c
SET embarazo_id = e.id
FROM embarazos e
WHERE c.embarazo_id IS NULL AND c.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 25

```sql
UPDATE morbilidad_embarazo m
SET embarazo_id = e.id
FROM embarazos e
WHERE m.embarazo_id IS NULL AND m.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 26

```sql
UPDATE controles_puerperio cp
SET embarazo_id = e.id
FROM embarazos e
WHERE cp.embarazo_id IS NULL AND cp.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 27

```sql
UPDATE planes_parto pp
SET embarazo_id = e.id
FROM embarazos e
WHERE pp.embarazo_id IS NULL AND pp.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 28

```sql
UPDATE fichas_riesgo_obstetrico r
SET embarazo_id = e.id
FROM embarazos e
WHERE r.embarazo_id IS NULL AND r.paciente_id = e.paciente_id AND e.estado = 'activo';
```

#### DML 29

```sql
UPDATE pacientes
SET fpp = (fur + INTERVAL '280 days')::date
WHERE fpp IS NULL AND fur IS NOT NULL;
```

#### DML 30

```sql
UPDATE embarazos
SET fpp = (fur + INTERVAL '280 days')::date
WHERE fpp IS NULL AND fur IS NOT NULL;
```

### Inventario DDL textual completo por línea

Cada línea siguiente identifica el comienzo o cláusula de DDL relevante del
schema original; el SQL completo permanece en el archivo auditado. Incluye
defaults y NOT NULL de columnas nuevas, únicos/constraints y SQL dinámico del DO.

```text
10: CREATE EXTENSION IF NOT EXISTS "pgcrypto";
16: CREATE TABLE IF NOT EXISTS roles (
18:   nombre      VARCHAR(50) UNIQUE NOT NULL, -- 'director' | 'admin' | 'personal_salud'
22: CREATE TABLE IF NOT EXISTS usuarios (
24:   nombre_completo VARCHAR(150) NOT NULL,
25:   username        VARCHAR(80)  UNIQUE NOT NULL,
26:   password_hash   VARCHAR(255) NOT NULL,
27:   rol_id          INTEGER NOT NULL REFERENCES roles(id),
28:   activo          BOOLEAN DEFAULT TRUE,
29:   created_at      TIMESTAMPTZ DEFAULT NOW(),
30:   updated_at      TIMESTAMPTZ DEFAULT NOW()
33: CREATE TABLE IF NOT EXISTS auth_sessions (
34:   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
35:   usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
36:   refresh_token_hash CHAR(64) NOT NULL,
38:   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
39:   last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
40:   absolute_expires_at TIMESTAMPTZ NOT NULL,
43:   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
44:   CONSTRAINT auth_sessions_absolute_after_created
48: CREATE INDEX IF NOT EXISTS idx_auth_sessions_usuario
50: CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_sessions_refresh_token_hash
52: CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_user
55: CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiration
58: CREATE TABLE IF NOT EXISTS schema_migrations (
60:   checksum CHAR(64) NOT NULL,
61:   applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
64: CREATE TABLE IF NOT EXISTS permisos (
66:   codigo      VARCHAR(80) UNIQUE NOT NULL,
67:   descripcion VARCHAR(255) NOT NULL,
68:   categoria   VARCHAR(50) NOT NULL
71: CREATE TABLE IF NOT EXISTS usuario_permisos (
73:   usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
74:   permiso_id      INTEGER NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
76:   fecha_otorgado  TIMESTAMPTZ DEFAULT NOW(),
77:   UNIQUE(usuario_id, permiso_id)
99: CREATE TABLE IF NOT EXISTS pacientes (
103:   no_expediente             VARCHAR(30) UNIQUE NOT NULL, -- Número asignado por el servicio
114:   nombres                   VARCHAR(150) NOT NULL,
115:   apellidos                 VARCHAR(150) NOT NULL,
132:   cobertura_igss            BOOLEAN DEFAULT FALSE,
133:   cobertura_privada         BOOLEAN DEFAULT FALSE,
137:   viene_referida            BOOLEAN DEFAULT FALSE,
148:   vive_sola                 BOOLEAN DEFAULT FALSE,
153:   es_migrante               BOOLEAN DEFAULT FALSE,
161:   fuma_activamente          BOOLEAN DEFAULT FALSE,
162:   fuma_pasivamente          BOOLEAN DEFAULT FALSE,
163:   consume_drogas            BOOLEAN DEFAULT FALSE,
164:   consume_alcohol           BOOLEAN DEFAULT FALSE,
165:   fuma_activamente_1er_trimestre BOOLEAN DEFAULT FALSE,
166:   fuma_activamente_2do_trimestre BOOLEAN DEFAULT FALSE,
167:   fuma_activamente_3er_trimestre BOOLEAN DEFAULT FALSE,
168:   fuma_pasivamente_1er_trimestre BOOLEAN DEFAULT FALSE,
169:   fuma_pasivamente_2do_trimestre BOOLEAN DEFAULT FALSE,
170:   fuma_pasivamente_3er_trimestre BOOLEAN DEFAULT FALSE,
171:   consume_alcohol_1er_trimestre  BOOLEAN DEFAULT FALSE,
172:   consume_alcohol_2do_trimestre  BOOLEAN DEFAULT FALSE,
173:   consume_alcohol_3er_trimestre  BOOLEAN DEFAULT FALSE,
174:   consume_drogas_1er_trimestre   BOOLEAN DEFAULT FALSE,
175:   consume_drogas_2do_trimestre   BOOLEAN DEFAULT FALSE,
176:   consume_drogas_3er_trimestre   BOOLEAN DEFAULT FALSE,
179:   violencia_1er_trimestre   BOOLEAN DEFAULT FALSE,
180:   violencia_2do_trimestre   BOOLEAN DEFAULT FALSE,
181:   violencia_3er_trimestre   BOOLEAN DEFAULT FALSE,
184:   embarazo_abuso_sexual     BOOLEAN DEFAULT FALSE,
189:   eg_confiable_fur          BOOLEAN DEFAULT FALSE,       -- EG confiable por FUR
190:   eg_confiable_usg          BOOLEAN DEFAULT FALSE,       -- EG confiable por USG
193:   gestas_previas            INTEGER DEFAULT 0,
194:   abortos                   INTEGER DEFAULT 0,
195:   partos                    INTEGER DEFAULT 0,
196:   partos_vaginales          INTEGER DEFAULT 0,
197:   cesareas                  INTEGER DEFAULT 0,
198:   nacidos_vivos             INTEGER DEFAULT 0,
199:   nacidos_muertos           INTEGER DEFAULT 0,
200:   hijos_viven               INTEGER DEFAULT 0,
201:   muertos_antes_1sem        INTEGER DEFAULT 0,           -- muertos < 1 semana
202:   muertos_despues_1sem      INTEGER DEFAULT 0,           -- muertos > 1 semana
203:   cirugia_genito_urinaria   BOOLEAN DEFAULT FALSE,
204:   infertilidad              BOOLEAN DEFAULT FALSE,
208:   fin_embarazo_menos_1anio  BOOLEAN DEFAULT FALSE,
211:   embarazo_planeado         BOOLEAN DEFAULT FALSE,
216:   antec_diabetes            BOOLEAN DEFAULT FALSE,
218:   antec_tbc                 BOOLEAN DEFAULT FALSE,
219:   antec_hipertension        BOOLEAN DEFAULT FALSE,
220:   antec_preeclampsia        BOOLEAN DEFAULT FALSE,
221:   antec_eclampsia           BOOLEAN DEFAULT FALSE,
222:   antec_cardiopatia         BOOLEAN DEFAULT FALSE,
223:   antec_nefropatia          BOOLEAN DEFAULT FALSE,
224:   antec_otra_condicion      BOOLEAN DEFAULT FALSE,
226:   cirugia_genito_urinaria_pers BOOLEAN DEFAULT FALSE,
229:   fam_diabetes              BOOLEAN DEFAULT FALSE,
230:   fam_tbc                   BOOLEAN DEFAULT FALSE,
231:   fam_hipertension          BOOLEAN DEFAULT FALSE,
232:   fam_preeclampsia          BOOLEAN DEFAULT FALSE,
233:   fam_eclampsia             BOOLEAN DEFAULT FALSE,
234:   fam_cardiopatia           BOOLEAN DEFAULT FALSE,
235:   fam_gemelos               BOOLEAN DEFAULT FALSE,       -- Antecedente de gemelares
236:   fam_otra_condicion_medica_grave BOOLEAN DEFAULT FALSE,
239:   rn_nc                     BOOLEAN DEFAULT FALSE,
240:   rn_normal                 BOOLEAN DEFAULT FALSE,
241:   rn_menor_2500g            BOOLEAN DEFAULT FALSE,
242:   rn_mayor_4000g            BOOLEAN DEFAULT FALSE,
243:   antec_vih_positivo        BOOLEAN DEFAULT FALSE,
244:   antec_emb_ectopico_num    INTEGER DEFAULT 0,
245:   antec_emb_ectopico        BOOLEAN DEFAULT FALSE,
246:   antec_gemelares           BOOLEAN DEFAULT FALSE,
247:   abortos_3_espont_consecutivos BOOLEAN DEFAULT FALSE,
248:   antec_violencia           BOOLEAN DEFAULT FALSE,
252:   tiene_ficha_riesgo        BOOLEAN DEFAULT FALSE,
256:   created_at                TIMESTAMPTZ DEFAULT NOW(),
257:   updated_at                TIMESTAMPTZ DEFAULT NOW()
267: CREATE TABLE IF NOT EXISTS embarazos (
269:   paciente_id       INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
270:   numero_embarazo   INTEGER NOT NULL CHECK (numero_embarazo >= 1),
271:   estado            VARCHAR(15) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','puerperio','cerrado')),
274:   fecha_inicio      DATE DEFAULT CURRENT_DATE,
278:   created_at        TIMESTAMPTZ DEFAULT NOW(),
279:   updated_at        TIMESTAMPTZ DEFAULT NOW(),
280:   UNIQUE (paciente_id, numero_embarazo)
285: WHERE estado IS NOT NULL
311: CREATE UNIQUE INDEX IF NOT EXISTS ux_embarazo_activo_paciente
315: CREATE TABLE IF NOT EXISTS vacunas_paciente (
317:   paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
321:   tipo_vacuna     VARCHAR(20) NOT NULL CONSTRAINT vacunas_paciente_tipo_vacuna_check
325:   momento         VARCHAR(25) NOT NULL CHECK (momento IN ('previo_embarazo','durante_embarazo','postparto_aborto')),
328:   numero_dosis    INTEGER NOT NULL DEFAULT 1,
332:   created_at      TIMESTAMPTZ DEFAULT NOW(),
333:   CONSTRAINT vacunas_paciente_numero_dosis_clinica_check CHECK (
339:   CONSTRAINT vacunas_paciente_fecha_clinica_check CHECK (fecha_dosis IS NOT NULL)
348: CREATE TABLE IF NOT EXISTS controles_prenatales (
350:   paciente_id               INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
353:   numero_control            INTEGER NOT NULL CHECK (numero_control >= 1),
355:   fecha                     DATE NOT NULL,
361:   peligro_hemorragia_vaginal    BOOLEAN DEFAULT FALSE,
362:   peligro_palidez               BOOLEAN DEFAULT FALSE,
363:   peligro_dolor_cabeza          BOOLEAN DEFAULT FALSE,
364:   peligro_hipertension          BOOLEAN DEFAULT FALSE,
365:   peligro_dolor_epigastrico     BOOLEAN DEFAULT FALSE,
366:   peligro_trastornos_visuales   BOOLEAN DEFAULT FALSE,
367:   peligro_fiebre                BOOLEAN DEFAULT FALSE,
396:   sangre_manchado           BOOLEAN DEFAULT FALSE,
397:   verrugas_herpes_papilomas BOOLEAN DEFAULT FALSE,  -- NUEVO
398:   flujo_vaginal             BOOLEAN DEFAULT FALSE,
403:   hematologia_realizada     BOOLEAN DEFAULT FALSE,
407:   glicemia_realizada        BOOLEAN DEFAULT FALSE,
411:   grupo_rh_realizado        BOOLEAN DEFAULT FALSE,
415:   orina_realizada           BOOLEAN DEFAULT FALSE,
420:   heces_realizada           BOOLEAN DEFAULT FALSE,
424:   vih_realizado             BOOLEAN DEFAULT FALSE,
429:   vdrl_realizado            BOOLEAN DEFAULT FALSE,
431:   vdrl_tratamiento_indicado BOOLEAN DEFAULT FALSE,  -- MSPAS indica anotar si positivo
434:   torch_realizado           BOOLEAN DEFAULT FALSE,
439:   papanicolau_ivaa_realizado  BOOLEAN DEFAULT FALSE,
444:   hepatitis_b_realizado     BOOLEAN DEFAULT FALSE,
451:   usg_realizado             BOOLEAN DEFAULT FALSE,
455:   sulfato_ferroso           BOOLEAN DEFAULT FALSE,
457:   acido_folico              BOOLEAN DEFAULT FALSE,
463:   orient_plan_emergencia_parto  BOOLEAN DEFAULT FALSE,
464:   orient_alimentacion_embarazo  BOOLEAN DEFAULT FALSE,
465:   orient_senales_peligro        BOOLEAN DEFAULT FALSE,
466:   orient_lactancia_materna      BOOLEAN DEFAULT FALSE,
467:   orient_planificacion_familiar BOOLEAN DEFAULT FALSE,
468:   orient_importancia_postparto  BOOLEAN DEFAULT FALSE,
469:   orient_vacunacion_nino        BOOLEAN DEFAULT FALSE,
470:   orient_pre_post_prueba_vih    BOOLEAN DEFAULT FALSE,
471:   orient_importancia_atenciones BOOLEAN DEFAULT FALSE,
472:   orient_tratamiento_its_pareja BOOLEAN DEFAULT FALSE,
482:   created_at                TIMESTAMPTZ DEFAULT NOW(),
483:   updated_at                TIMESTAMPTZ DEFAULT NOW(),
485:   UNIQUE (paciente_id, numero_control)
494: CREATE TABLE IF NOT EXISTS morbilidad_embarazo (
496:   paciente_id               INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
499:   fecha                     DATE NOT NULL,
510:   created_at                TIMESTAMPTZ DEFAULT NOW(),
511:   updated_at                TIMESTAMPTZ DEFAULT NOW()
520: CREATE TABLE IF NOT EXISTS controles_puerperio (
522:   paciente_id                 INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
525:   numero_atencion             INTEGER NOT NULL CHECK (numero_atencion IN (1, 2)),
527:   fecha                       DATE NOT NULL,
564:   created_at                  TIMESTAMPTZ DEFAULT NOW(),
565:   updated_at                  TIMESTAMPTZ DEFAULT NOW(),
567:   UNIQUE (paciente_id, numero_atencion)
575: CREATE TABLE IF NOT EXISTS planes_parto (
577:     paciente_id                     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
579:   fecha                           DATE NOT NULL,
589:   ha_tenido_atencion_prenatal     BOOLEAN DEFAULT FALSE,
602:   parto_anterior_hospital         BOOLEAN DEFAULT FALSE,
603:   parto_anterior_caimi            BOOLEAN DEFAULT FALSE,
604:   parto_anterior_comadrona        BOOLEAN DEFAULT FALSE,
605:   parto_anterior_clinica_privada  BOOLEAN DEFAULT FALSE,
608:   peligro_dolor_cabeza            BOOLEAN DEFAULT FALSE,
609:   peligro_vision_borrosa          BOOLEAN DEFAULT FALSE,
610:   peligro_embarazo_multiple       BOOLEAN DEFAULT FALSE,
611:   peligro_hemorragia_vaginal      BOOLEAN DEFAULT FALSE,
612:   peligro_edema_mi                BOOLEAN DEFAULT FALSE,
613:   peligro_nino_transverso         BOOLEAN DEFAULT FALSE,
614:   peligro_dolor_estomago          BOOLEAN DEFAULT FALSE,
615:   peligro_salida_liquidos         BOOLEAN DEFAULT FALSE,
616:   peligro_convulsiones            BOOLEAN DEFAULT FALSE,
617:   peligro_fiebre                  BOOLEAN DEFAULT FALSE,
618:   peligro_ausencia_mov_fetales    BOOLEAN DEFAULT FALSE,
619:   peligro_placenta_no_salia       BOOLEAN DEFAULT FALSE,
625:   casa_materna_cercana            BOOLEAN DEFAULT FALSE,
626:   usara_casa_materna              BOOLEAN DEFAULT FALSE,
632:   ropa_nino                       BOOLEAN DEFAULT FALSE,
633:   ropa_madre                      BOOLEAN DEFAULT FALSE,
635:   lleva_dpi_madre                 BOOLEAN DEFAULT FALSE,
636:   lleva_dpi_conyuge               BOOLEAN DEFAULT FALSE,
637:   lleva_partida_nacimiento        BOOLEAN DEFAULT FALSE,
639:   cuenta_ahorro                   BOOLEAN DEFAULT FALSE,
640:   comunicado_comite               BOOLEAN DEFAULT FALSE,
651:   created_at                      TIMESTAMPTZ DEFAULT NOW(),
652:   updated_at                      TIMESTAMPTZ DEFAULT NOW()
655: ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS no_registro VARCHAR(80);
656: ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS servicio_salud VARCHAR(200);
657: ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS lugar_residencia VARCHAR(250);
658: ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS edad_gestacional_au INTEGER;
659: ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS acompana_traslado VARCHAR(80);
660: ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS acompana_parto VARCHAR(80);
668: CREATE TABLE IF NOT EXISTS fichas_riesgo_obstetrico (
670:   paciente_id                       INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
672:   fecha                             DATE NOT NULL,
676:   migrante                          BOOLEAN DEFAULT FALSE,
698:   muerte_fetal_neonatal_previa      BOOLEAN DEFAULT FALSE,
699:   abortos_espontaneos_3mas          BOOLEAN DEFAULT FALSE,
700:   gestas_3mas                       BOOLEAN DEFAULT FALSE,
701:   peso_ultimo_bebe_menor_2500g      BOOLEAN DEFAULT FALSE,
702:   peso_ultimo_bebe_mayor_4500g      BOOLEAN DEFAULT FALSE,
703:   antec_hipertension_preeclampsia   BOOLEAN DEFAULT FALSE,
704:   cirugias_tracto_reproductivo      BOOLEAN DEFAULT FALSE,
707:   embarazo_multiple                 BOOLEAN DEFAULT FALSE,
708:   menor_20_anos                     BOOLEAN DEFAULT FALSE,
709:   mayor_35_anos                     BOOLEAN DEFAULT FALSE,
710:   paciente_rh_negativo              BOOLEAN DEFAULT FALSE,
711:   hemorragia_vaginal                BOOLEAN DEFAULT FALSE,
712:   vih_positivo_sifilis              BOOLEAN DEFAULT FALSE,
713:   presion_diastolica_90mas          BOOLEAN DEFAULT FALSE,
714:   anemia                            BOOLEAN DEFAULT FALSE,
715:   desnutricion_obesidad             BOOLEAN DEFAULT FALSE,
716:   dolor_abdominal                   BOOLEAN DEFAULT FALSE,
717:   sintomatologia_urinaria           BOOLEAN DEFAULT FALSE,
718:   ictericia                         BOOLEAN DEFAULT FALSE,
721:   diabetes                          BOOLEAN DEFAULT FALSE,
722:   enfermedad_renal                  BOOLEAN DEFAULT FALSE,
723:   enfermedad_corazon                BOOLEAN DEFAULT FALSE,
724:   hipertension_arterial             BOOLEAN DEFAULT FALSE,
725:   consumo_drogas_alcohol_tabaco     BOOLEAN DEFAULT FALSE,
726:   otra_enfermedad_severa            BOOLEAN DEFAULT FALSE,
747:   created_at                        TIMESTAMPTZ DEFAULT NOW(),
748:   updated_at                        TIMESTAMPTZ DEFAULT NOW()
755: CREATE TABLE IF NOT EXISTS comunidades (
757:   nombre VARCHAR(150) NOT NULL,
758:   territorio SMALLINT NOT NULL CHECK (territorio BETWEEN 1 AND 4),
759:   sector CHAR(1) NOT NULL CHECK (sector IN ('A', 'B')),
760:   lat DECIMAL(10,7) NOT NULL,
761:   lng DECIMAL(10,7) NOT NULL,
762:   activo BOOLEAN NOT NULL DEFAULT TRUE,
763:   created_at TIMESTAMPTZ DEFAULT NOW(),
764:   updated_at TIMESTAMPTZ DEFAULT NOW(),
769: CREATE UNIQUE INDEX IF NOT EXISTS ux_comunidades_nombre
772: ALTER TABLE comunidades
773:   ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE,
774:   ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
775:   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
776:   ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
777:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
787: ALTER TABLE comunidades
788:   ALTER COLUMN activo SET DEFAULT TRUE,
789:   ALTER COLUMN activo SET NOT NULL,
790:   ALTER COLUMN created_at SET DEFAULT NOW(),
791:   ALTER COLUMN updated_at SET DEFAULT NOW();
841: ALTER TABLE pacientes
842:   ADD COLUMN IF NOT EXISTS comunidad_id INTEGER REFERENCES comunidades(id);
844: CREATE INDEX IF NOT EXISTS idx_pacientes_comunidad_id
854: CREATE TABLE IF NOT EXISTS comunidades_aliases (
856:   comunidad_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
857:   alias VARCHAR(150) NOT NULL,
858:   UNIQUE (comunidad_id, alias)
932: CREATE TABLE IF NOT EXISTS auditoria_eventos (
935:   accion            VARCHAR(30) NOT NULL CHECK (
945:   tabla             VARCHAR(80) NOT NULL,
954:   fecha_hora        TIMESTAMPTZ DEFAULT NOW(),
955:   created_at        TIMESTAMPTZ DEFAULT NOW()
958: ALTER TABLE auditoria_eventos ADD COLUMN IF NOT EXISTS modulo VARCHAR(80);
959: ALTER TABLE auditoria_eventos ADD COLUMN IF NOT EXISTS entidad_afectada VARCHAR(80);
960: ALTER TABLE auditoria_eventos ADD COLUMN IF NOT EXISTS id_entidad TEXT;
961: ALTER TABLE auditoria_eventos ADD COLUMN IF NOT EXISTS fecha_hora TIMESTAMPTZ DEFAULT NOW();
963: ALTER TABLE auditoria_eventos DROP CONSTRAINT IF EXISTS auditoria_eventos_accion_check;
964: ALTER TABLE auditoria_eventos ADD CONSTRAINT auditoria_eventos_accion_check
983: CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_eventos(usuario_id);
984: CREATE INDEX IF NOT EXISTS idx_auditoria_paciente ON auditoria_eventos(paciente_id);
985: CREATE INDEX IF NOT EXISTS idx_auditoria_embarazo ON auditoria_eventos(embarazo_id);
986: CREATE INDEX IF NOT EXISTS idx_auditoria_tabla_registro ON auditoria_eventos(tabla, registro_id);
987: CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria_eventos(created_at);
988: CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON auditoria_eventos(modulo);
989: CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria_eventos(entidad_afectada, id_entidad);
990: CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_hora ON auditoria_eventos(fecha_hora);
991: CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_usuario ON auditoria_eventos(fecha_hora DESC, usuario_id);
992: CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_paciente ON auditoria_eventos(fecha_hora DESC, paciente_id);
993: CREATE INDEX IF NOT EXISTS idx_auditoria_accion_fecha ON auditoria_eventos(accion, fecha_hora DESC);
994: CREATE INDEX IF NOT EXISTS idx_auditoria_cursor
1001: ALTER TABLE usuarios
1002:   ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
1003:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
1005: ALTER TABLE pacientes
1006:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
1008: ALTER TABLE embarazos
1009:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
1011: ALTER TABLE controles_prenatales
1012:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
1014: ALTER TABLE controles_puerperio
1015:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
1017: ALTER TABLE morbilidad_embarazo
1018:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
1020: ALTER TABLE fichas_riesgo_obstetrico
1021:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
1023: ALTER TABLE planes_parto
1024:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
1026: ALTER TABLE vacunas_paciente
1027:   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
1028:   ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
1034: ALTER TABLE vacunas_paciente
1035:   ALTER COLUMN updated_at SET DEFAULT NOW();
1037: ALTER TABLE vacunas_paciente ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1038: ALTER TABLE controles_prenatales ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1039: ALTER TABLE morbilidad_embarazo ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1040: ALTER TABLE controles_puerperio ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1041: ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1042: ALTER TABLE fichas_riesgo_obstetrico ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1089:   WHERE embarazo_id IS NOT NULL
1095: CREATE INDEX IF NOT EXISTS idx_pacientes_expediente   ON pacientes(no_expediente);
1096: CREATE INDEX IF NOT EXISTS idx_pacientes_cui          ON pacientes(cui);
1097: CREATE UNIQUE INDEX IF NOT EXISTS ux_pacientes_cui_unico
1099:   WHERE cui IS NOT NULL AND BTRIM(cui) <> '';
1100: CREATE INDEX IF NOT EXISTS idx_pacientes_apellidos    ON pacientes(apellidos);
1101: CREATE INDEX IF NOT EXISTS idx_pacientes_nombres      ON pacientes(nombres);
1102: CREATE INDEX IF NOT EXISTS idx_controles_paciente     ON controles_prenatales(paciente_id);
1103: CREATE INDEX IF NOT EXISTS idx_controles_fecha        ON controles_prenatales(fecha);
1104: CREATE INDEX IF NOT EXISTS idx_morbilidad_paciente    ON morbilidad_embarazo(paciente_id);
1105: CREATE INDEX IF NOT EXISTS idx_puerperio_paciente     ON controles_puerperio(paciente_id);
1106: DROP INDEX IF EXISTS ux_riesgo_paciente_unico;
1107: DROP INDEX IF EXISTS ux_vacunas_paciente_dosis;
1108: ALTER TABLE controles_prenatales DROP CONSTRAINT IF EXISTS controles_prenatales_paciente_id_numero_control_key;
1109: ALTER TABLE controles_puerperio DROP CONSTRAINT IF EXISTS controles_puerperio_paciente_id_numero_atencion_key;
1111: CREATE UNIQUE INDEX IF NOT EXISTS ux_riesgo_embarazo_unico ON fichas_riesgo_obstetrico(embarazo_id);
1112: CREATE UNIQUE INDEX IF NOT EXISTS ux_plan_parto_embarazo_unico ON planes_parto(embarazo_id);
1113: CREATE INDEX IF NOT EXISTS idx_riesgo_paciente        ON fichas_riesgo_obstetrico(paciente_id);
1114: DROP INDEX IF EXISTS ux_vacunas_embarazo_dosis;
1115: CREATE UNIQUE INDEX IF NOT EXISTS ux_vacunas_td_paciente_posicion
1118: CREATE UNIQUE INDEX IF NOT EXISTS ux_vacunas_spr_sr_paciente_posicion
1121: DROP INDEX IF EXISTS ux_vacunas_tdap_embarazo;
1122: CREATE UNIQUE INDEX ux_vacunas_tdap_embarazo
1125:     AND embarazo_id IS NOT NULL
1127: CREATE UNIQUE INDEX IF NOT EXISTS ux_controles_embarazo_numero ON controles_prenatales(embarazo_id, numero_control);
1128: CREATE UNIQUE INDEX IF NOT EXISTS ux_controles_id_embarazo ON controles_prenatales(id, embarazo_id);
1129: CREATE UNIQUE INDEX IF NOT EXISTS ux_puerperio_embarazo_numero ON controles_puerperio(embarazo_id, numero_atencion);
1130: CREATE INDEX IF NOT EXISTS idx_embarazos_paciente      ON embarazos(paciente_id);
1131: CREATE INDEX IF NOT EXISTS idx_controles_embarazo      ON controles_prenatales(embarazo_id);
1132: CREATE INDEX IF NOT EXISTS idx_riesgo_embarazo         ON fichas_riesgo_obstetrico(embarazo_id);
1133: CREATE INDEX IF NOT EXISTS idx_vacunas_paciente       ON vacunas_paciente(paciente_id);
1134: CREATE INDEX IF NOT EXISTS idx_usuarios_username      ON usuarios(username);
1141: CREATE TABLE IF NOT EXISTS citas_prenatales (
1143:   embarazo_id              INTEGER NOT NULL REFERENCES embarazos(id) ON DELETE CASCADE,
1144:   fecha_programada         DATE NOT NULL,
1145:   estado                   VARCHAR(20) NOT NULL DEFAULT 'programada',
1146:   control_origen_id        INTEGER NOT NULL,
1152:   created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
1153:   updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
1155:   CONSTRAINT citas_prenatales_estado_check CHECK (
1158:   CONSTRAINT citas_prenatales_cumplimiento_estado_check CHECK (
1159:     (estado = 'atendida' AND control_cumplimiento_id IS NOT NULL)
1162:   CONSTRAINT citas_prenatales_controles_distintos_check CHECK (
1165:   CONSTRAINT citas_prenatales_reprogramacion_no_circular_check CHECK (
1168:   CONSTRAINT citas_prenatales_seguimiento_no_circular_check CHECK (
1171:   CONSTRAINT citas_prenatales_derivacion_exclusiva_check CHECK (
1174:   CONSTRAINT citas_prenatales_id_embarazo_key UNIQUE (id, embarazo_id),
1175:   CONSTRAINT citas_prenatales_control_origen_embarazo_fkey
1179:   CONSTRAINT citas_prenatales_control_cumplimiento_embarazo_fkey
1183:   CONSTRAINT citas_prenatales_reprogramada_desde_embarazo_fkey
1187:   CONSTRAINT citas_prenatales_seguimiento_embarazo_fkey
1193: CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_control_origen_raiz
1198: CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_control_cumplimiento
1200:   WHERE control_cumplimiento_id IS NOT NULL;
1202: CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_reprogramada_desde
1204:   WHERE reprogramada_desde_id IS NOT NULL;
1206: CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_seguimiento_inasistencia_desde
1208:   WHERE seguimiento_inasistencia_desde_id IS NOT NULL;
1210: CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_programada_embarazo
1214: CREATE INDEX IF NOT EXISTS idx_citas_programadas_fecha
1218: CREATE INDEX IF NOT EXISTS idx_citas_embarazo_fecha
1226: CREATE TABLE IF NOT EXISTS automatizacion_despachos (
1228:   tipo               VARCHAR(80) NOT NULL,
1229:   periodo_desde      DATE NOT NULL,
1230:   periodo_hasta      DATE NOT NULL,
1231:   estado             VARCHAR(24) NOT NULL,
1233:   total_registros    INTEGER NOT NULL DEFAULT 0,
1234:   numero_intento     INTEGER NOT NULL DEFAULT 1,
1238:   created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
1239:   updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
1241:   CONSTRAINT automatizacion_despachos_periodo_check CHECK (
1244:   CONSTRAINT automatizacion_despachos_estado_check CHECK (
1247:   CONSTRAINT automatizacion_despachos_total_check CHECK (total_registros >= 0),
1248:   CONSTRAINT automatizacion_despachos_intento_check CHECK (numero_intento >= 1),
1249:   CONSTRAINT automatizacion_despachos_token_check CHECK (
1251:       AND token_hash IS NOT NULL
1252:       AND reservado_at IS NOT NULL
1255:       AND token_hash IS NOT NULL
1256:       AND reservado_at IS NOT NULL
1257:       AND enviado_at IS NOT NULL)
1265:       AND reservado_at IS NOT NULL
1268:   CONSTRAINT automatizacion_despachos_tipo_periodo_key UNIQUE (
1273: CREATE UNIQUE INDEX IF NOT EXISTS ux_automatizacion_despachos_token
1275:   WHERE token_hash IS NOT NULL;
1277: CREATE INDEX IF NOT EXISTS idx_automatizacion_despachos_estado_periodo
1284: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS vive_sola BOOLEAN DEFAULT FALSE;
1285: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cobertura_igss BOOLEAN DEFAULT FALSE;
1286: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cobertura_privada BOOLEAN DEFAULT FALSE;
1287: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS viene_referida BOOLEAN DEFAULT FALSE;
1288: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS es_migrante BOOLEAN DEFAULT FALSE;
1289: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS eg_confiable_fur BOOLEAN DEFAULT FALSE;
1290: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS eg_confiable_usg BOOLEAN DEFAULT FALSE;
1291: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cirugia_genito_urinaria BOOLEAN DEFAULT FALSE;
1292: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS infertilidad BOOLEAN DEFAULT FALSE;
1293: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fin_embarazo_menos_1anio BOOLEAN DEFAULT FALSE;
1294: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS embarazo_planeado BOOLEAN DEFAULT FALSE;
1295: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_diabetes_tipo VARCHAR(1);
1296: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_diabetes BOOLEAN DEFAULT FALSE;
1297: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_tbc BOOLEAN DEFAULT FALSE;
1298: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_hipertension BOOLEAN DEFAULT FALSE;
1299: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_preeclampsia BOOLEAN DEFAULT FALSE;
1300: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_eclampsia BOOLEAN DEFAULT FALSE;
1301: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_cardiopatia BOOLEAN DEFAULT FALSE;
1302: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_nefropatia BOOLEAN DEFAULT FALSE;
1303: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_otra_condicion BOOLEAN DEFAULT FALSE;
1304: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cirugia_genito_urinaria_pers BOOLEAN DEFAULT FALSE;
1305: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fam_diabetes BOOLEAN DEFAULT FALSE;
1306: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fam_tbc BOOLEAN DEFAULT FALSE;
1307: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fam_hipertension BOOLEAN DEFAULT FALSE;
1308: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fam_preeclampsia BOOLEAN DEFAULT FALSE;
1309: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fam_eclampsia BOOLEAN DEFAULT FALSE;
1310: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fam_cardiopatia BOOLEAN DEFAULT FALSE;
1311: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fam_gemelos BOOLEAN DEFAULT FALSE;
1312: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fam_otra_condicion_medica_grave BOOLEAN DEFAULT FALSE;
1313: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS nacidos_muertos INTEGER DEFAULT 0;
1314: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS rn_nc BOOLEAN DEFAULT FALSE;
1315: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS rn_normal BOOLEAN DEFAULT FALSE;
1316: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS rn_menor_2500g BOOLEAN DEFAULT FALSE;
1317: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS rn_mayor_4000g BOOLEAN DEFAULT FALSE;
1318: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_vih_positivo BOOLEAN DEFAULT FALSE;
1319: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_emb_ectopico_num INTEGER DEFAULT 0;
1320: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_emb_ectopico BOOLEAN DEFAULT FALSE;
1321: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_gemelares BOOLEAN DEFAULT FALSE;
1322: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS abortos_3_espont_consecutivos BOOLEAN DEFAULT FALSE;
1323: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS partos INTEGER DEFAULT 0;
1324: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_violencia BOOLEAN DEFAULT FALSE;
1331: ALTER TABLE vacunas_paciente ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1332: ALTER TABLE controles_prenatales ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1333: ALTER TABLE morbilidad_embarazo ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1334: ALTER TABLE controles_puerperio ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1335: ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1336: ALTER TABLE fichas_riesgo_obstetrico ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
1375: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_activamente_1er_trimestre BOOLEAN DEFAULT FALSE;
1376: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_activamente_2do_trimestre BOOLEAN DEFAULT FALSE;
1377: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_activamente_3er_trimestre BOOLEAN DEFAULT FALSE;
1378: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_pasivamente_1er_trimestre BOOLEAN DEFAULT FALSE;
1379: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_pasivamente_2do_trimestre BOOLEAN DEFAULT FALSE;
1380: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_pasivamente_3er_trimestre BOOLEAN DEFAULT FALSE;
1381: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_alcohol_1er_trimestre BOOLEAN DEFAULT FALSE;
1382: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_alcohol_2do_trimestre BOOLEAN DEFAULT FALSE;
1383: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_alcohol_3er_trimestre BOOLEAN DEFAULT FALSE;
1384: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_drogas_1er_trimestre BOOLEAN DEFAULT FALSE;
1385: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_drogas_2do_trimestre BOOLEAN DEFAULT FALSE;
1386: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_drogas_3er_trimestre BOOLEAN DEFAULT FALSE;
1387: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_activamente BOOLEAN DEFAULT FALSE;
1388: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_pasivamente BOOLEAN DEFAULT FALSE;
1389: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_alcohol BOOLEAN DEFAULT FALSE;
1390: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_drogas BOOLEAN DEFAULT FALSE;
1391: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS violencia_1er_trimestre BOOLEAN DEFAULT FALSE;
1392: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS violencia_2do_trimestre BOOLEAN DEFAULT FALSE;
1393: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS violencia_3er_trimestre BOOLEAN DEFAULT FALSE;
1394: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS embarazo_abuso_sexual BOOLEAN DEFAULT FALSE;
1395: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tiene_ficha_riesgo BOOLEAN DEFAULT FALSE;
1396: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS edad_manual INTEGER;
1397: ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS edad_calculada VARCHAR(80);
1399: ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_categoria_servicio_check;
1400: ALTER TABLE pacientes ADD CONSTRAINT pacientes_categoria_servicio_check
1403: ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_clasificacion_alfa_beta_check;
1404: ALTER TABLE pacientes ADD CONSTRAINT pacientes_clasificacion_alfa_beta_check
1407: ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_nivel_estudios_check;
1408: ALTER TABLE pacientes ADD CONSTRAINT pacientes_nivel_estudios_check
1411: ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_estado_civil_check;
1412: ALTER TABLE pacientes ADD CONSTRAINT pacientes_estado_civil_check
1415: ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_antec_diabetes_tipo_check;
1416: ALTER TABLE pacientes ADD CONSTRAINT pacientes_antec_diabetes_tipo_check
1421: WHERE fpp IS NULL AND fur IS NOT NULL;
1425: WHERE fpp IS NULL AND fur IS NOT NULL;
1427: ALTER TABLE embarazos DROP CONSTRAINT IF EXISTS embarazos_estado_check;
1428: ALTER TABLE embarazos ADD CONSTRAINT embarazos_estado_check
1447:     ALTER TABLE embarazos ADD CONSTRAINT embarazos_id_paciente_key UNIQUE (id, paciente_id);
1460:         'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (embarazo_id, paciente_id) '
1471:     EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I',
```
