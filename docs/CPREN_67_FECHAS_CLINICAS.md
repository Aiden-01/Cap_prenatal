# CPREN-67 — Fechas clínicas civiles

Sesión local del 7 de octubre de 2026, equipo Casa (Huguito). Base: `main`,
`193b27046899853fe32e4df60bb9c3640349760f`. Sin commit ni push.
Corrección propuesta para revisión; producción no fue consultada ni modificada.

## Causa raíz demostrada

PostgreSQL `DATE` representa un día civil. El parser predeterminado de `pg`
(OID 1082) lo convertía a un `Date` a medianoche **local del backend**. JSON
serializaba ese objeto como un instante UTC. El listado de pacientes y el
dashboard volvían a interpretar el instante en la zona del navegador, mientras
que expediente, formulario y reportes conservaban el prefijo `YYYY-MM-DD`.

La regresión ejecutada reproduce exactamente esta diferencia, sin datos reales:

| Paso | Valor anterior |
| --- | --- |
| DATE sintético | `2026-01-01` |
| Parser pg en UTC y JSON | `2026-01-01T00:00:00.000Z` |
| Listado anterior en America/Guatemala | `31/12/2025` |
| Expediente/formulario anteriores, tomando prefijo civil | `1/1/2026` / `2026-01-01` |

Además, en Asia/Tokyo el parser anterior serializa el mismo DATE como
`2025-12-31T15:00:00.000Z`. Por ello, conservar solamente el prefijo ISO en el
frontend no corrige el contrato del backend para todas las zonas horarias.

## Recorrido y fuentes

- `pacientesRepository.listar` devuelve DATE de paciente y aliases de embarazo.
  El embarazo priorizado es activo, después puerperio y finalmente el último
  cerrado. `Pacientes` prioriza sus fechas, manteniendo el fallback existente.
- `GET /pacientes/:id` entrega la fila de paciente para edición.
- `GET /pacientes/:id/expediente` entrega paciente y embarazo seleccionado;
  expediente presenta las fechas de ese embarazo. Un embarazo histórico puede
  legítimamente diferir del embarazo actual y de la fila de paciente.
- No se cambió la selección de fuentes ni se igualaron datos. Un fixture con
  fechas distintas demuestra que listado y expediente conservan el embarazo
  seleccionado y que la API no sobrescribe la fecha de paciente.
- Para el mismo embarazo y fechas sincronizadas, las pruebas DOM comprueban
  listado, expediente y campos de edición contra el día civil esperado.
- No se verificó la consistencia de todas las filas productivas en esta sesión:
  el usuario prohibió acceder/modificar la base productiva. La causa del código
  quedó reproducida y corregida con fixtures sintéticos.

## Corrección y decisiones

El pool de la aplicación usa un parser de DATE de texto que conserva
`YYYY-MM-DD`. No altera los parsers globales de pg ni TIMESTAMP/TIMESTAMPTZ.
Se descartó normalizar cada DTO: eso dejaría caminos de reportes/documentos
expuestos a la conversión inicial a UTC.

`gestationalAge.parseClinicalDate` reutiliza `riskAgeRules.normalizeClinicalDate`
en vez de mantener otro normalizador. El formato clínico usa la fecha civil
validada y UTC explícito únicamente como soporte de formato/aritmética.
Listado, expediente, reportes y dashboard comparten ese formato. Edición usa el
mismo normalizador existente al cargar FUR/FPP. Se admiten también los ISO del
contrato anterior conservando su prefijo civil.

La FPP automática sigue sumando **280 días clínicos**. Los indicadores de semanas
de listado/dashboard comparan contra el día actual de Guatemala, sin depender
de la hora fraccionaria ni de la zona del navegador. No se aplicó +/-1 día,
no se modificaron fechas almacenadas y no se cambiaron las reglas de FPP manual,
sincronización transaccional, permisos, auditoría o concurrencia optimista.
El fallback de FPP estimada del listado sigue siendo de presentación cuando
falta una FPP registrada; no se persiste al guardar sin modificaciones.

## Impacto revisado y probado

| Consumidor | Hallazgo / validación |
| --- | --- |
| Edad gestacional frontend | Aritmética UTC por días; febrero bisiesto, fin de año y 40 semanas exactas probados. Normalizador existente reutilizado. |
| Edad gestacional SQL/reportes | Aritmética DATE permanece igual. Censo real en cluster temporal valida FUR, FPP, primer control y semanas. |
| FPP automática/manual | +280 días conserva bisiesto y cruce de año; FPP manual sigue respetada. |
| Vacunas/controles/plan de parto | Consumidores del normalizador gestacional y helpers DATE aceptan texto civil; suites existentes ejecutadas. |
| Reportes de pantalla | FUR/FPP/primer control renderizados con días civiles exactos en prueba DOM. |
| Excel | Workbook escrito y leído con ExcelJS: FUR/FPP/primer control coinciden con medianoche UTC del día civil en UTC/Guatemala/Tokyo. Vacíos probados. |
| Censo HTML para PDF | Las tres celdas de fechas del cuerpo conservan el día esperado en las tres zonas. |
| Documentos oficiales | Renderer de riesgo y `drawDate` de ficha prenatal reciben y dibujan día/mes/año exactos. Suites PDF existentes también ejecutadas; no se realizó nueva inspección visual manual de PDF. |
| Auditoría/versionado | No-op conserva filas completas, metadata, versión y número de eventos. Cambio válido sincroniza paciente/embarazo y audita. Conflicto obsoleto no escribe. |

Hallazgo lateral reproducido en el fixture: `ocultarDatosVih` recorre los
objetos Date de timestamps como objetos vacíos cuando no existe permiso
`controles.ver_vih`. Es un defecto previo ajeno al desfase de FUR/FPP; este diff
no cambia ese filtro. Las fechas DATE pasan a ser strings y quedan preservadas
también sin ese permiso. El timestamp del listado mantiene su contrato. El
hallazgo queda registrado para tratamiento separado en
[CPREN-68](https://tareajiraads.atlassian.net/browse/CPREN-68), Error bajo CPREN-4,
en Tareas por hacer. Su corrección no forma parte de CPREN-67.

La auditoría final identificó 32 importadores directos del pool, incluidos
repositorios, servicios, utilidades, rutas y scripts operativos. No se encontró
una llamada no protegida a métodos de Date sobre un DATE recibido de SQL.
Los cálculos clínicos y comparaciones normalizan texto civil; Excel, censo HTML,
riesgo y ficha prenatal admiten texto civil. Auditoría y comparación de cambios
admiten ambos contratos; el no-op transaccional fue probado con PostgreSQL real.
Las fechas de sesiones y el corte de automatizaciones son TIMESTAMPTZ según el
esquema; sus consumidores siguen recibiendo Date. El historial convierte sus
timestamps mediante SQL. Los scripts se inspeccionaron, sin ejecutarlos.
`sanitizeAuditHistory` construye un pool independiente y no recibe este parser.
No se encontraron consumidores internos de DATE[] ni consultas binarias;
el alcance del parser nuevo sigue siendo DATE escalar en formato texto.

## Archivos del diff

Código:

- `backend/src/db/clinicalDateTypes.js`
- `backend/src/db/pool.js`
- `frontend/src/utils/gestationalAge.js`
- `frontend/src/pages/Pacientes.jsx`
- `frontend/src/pages/ExpedientePaciente.jsx`
- `frontend/src/pages/NuevaPaciente.jsx`
- `frontend/src/pages/Reportes.jsx`
- `frontend/src/pages/Dashboard.jsx`

Pruebas/documentación:

- `backend/test/clinicalDates.test.js`
- `backend/test/patientVersionPostgres.test.js`
- `frontend/test/clinicalDates.test.js`
- `frontend/test-dom/clinicalDates.test.jsx`
- `docs/CPREN_67_FECHAS_CLINICAS.md`

## Resultados ejecutados

Node 24.11.1; PostgreSQL temporal 18.3. Los conteos siguientes son por ejecución;
las matrices repiten los mismos casos y no deben sumarse como casos únicos.

| Ejecución final | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| Backend completo, `node --test --test-concurrency=1 test/*.test.js` | 1255 | 0 | 49 |
| Frontend Node completo, mismo comando, TZ=America/Guatemala | 187 | 0 | 0 |
| Frontend DOM completo, `vitest run test-dom --maxWorkers=1`, TZ=America/Guatemala | 126 (15 archivos) | 0 | 0 |
| DOM clínico + patientVersion, TZ=UTC | 24 (2 archivos) | 0 | 0 |
| PostgreSQL HTTP/versionado, TZ=UTC | 12 | 0 | 1 |
| PostgreSQL HTTP/versionado, TZ=America/Guatemala | 12 | 0 | 1 |
| PostgreSQL HTTP/versionado, TZ=Asia/Tokyo | 12 | 0 | 1 |

En la verificación posterior al diff se repitieron backend completo, las tres
ejecuciones PostgreSQL, ESLint y build. Los resultados frontend de la tabla
corresponden a la ejecución anterior de esta corrección; no se repitieron en
esta verificación porque no cambió código ni pruebas del frontend.

Se corrigió una debilidad real del fixture: `set_config` sobre el pool no
garantizaba la zona horaria de las consultas posteriores. Ahora cada conexión
recibe `options: -c TimeZone=<zona>` al abrirse y se carga el módulo real
`db/pool.js`, con configuración exclusiva del cluster sintético. Se verifican
cinco PID distintos, la zona de cada sesión y una sexta conexión nueva tras
cerrar las anteriores. Las peticiones HTTP usan ese mismo pool configurado.

La prueba nueva compara TIMESTAMP y TIMESTAMPTZ con un pool de control que usa
los parsers originales de pg. Ambos siguen siendo Date; epoch y JSON coinciden
con el control, incluso en la conexión reemplazada. Para el valor sintético
`2026-01-01 12:34:56.789`, el comportamiento anterior queda comprobado así:

| Zona del proceso/sesión | JSON TIMESTAMP | JSON TIMESTAMPTZ con +00 |
| --- | --- | --- |
| UTC | `2026-01-01T12:34:56.789Z` | `2026-01-01T12:34:56.789Z` |
| America/Guatemala | `2026-01-01T18:34:56.789Z` | `2026-01-01T12:34:56.789Z` |
| Asia/Tokyo | `2026-01-01T03:34:56.789Z` | `2026-01-01T12:34:56.789Z` |

TIMESTAMP sin zona conserva la interpretación local de Node que ya tenía pg;
no se convirtió su contrato en un instante universal. DATE conserva
`2024-02-29` como string y NULL como null en todas estas conexiones.

La suite backend incluye los cuatro casos de reproducción/exportación en las
tres zonas. La suite frontend Node incluye los tres procesos de normalización,
formato y edad gestacional en esas zonas. Los 18 casos DOM clínicos cubren fecha
normal, fin de mes, fin de año, febrero normal/bisiesto, vacíos, contrato DATE y
ISO anterior, FPP derivada, dashboard, reporte, borrador y recarga tras 409.

PostgreSQL se ejecutó con `RUN_CLINICAL_DATE_POSTGRES=1` y
`PATIENT_VERSION_POSTGRES_BIN=C:/Program Files/PostgreSQL/18/bin`. El test crea
su propio cluster `127.0.0.1:55465`, inicializa un esquema sintético con versión
ya definida y lo elimina al terminar. **No ejecuta el migrador ni applyMigration**
en este modo; por eso omite el caso de migración. Las otras 49 omisiones del
backend son integraciones opcionales no habilitadas; no se califican como aprobadas.

Concurrencia real: dos conexiones cargan la misma versión, la segunda espera
el bloqueo FOR UPDATE, A guarda y B recibe `409 PATIENT_VERSION_CONFLICT`.
Se comprueba fila, embarazo, versión, auditoría y rollback ante fallo de auditoría.
Un PUT intencional guarda las fechas elegidas exactamente y el GET posterior
recupera esos mismos días y la versión incrementada en las tres zonas.
En DOM, el borrador FUR/FPP se conserva y la recarga explícita recupera fechas
y versión recientes; guardar sin editar envía solamente la versión.

- ESLint: `npm run lint`, salida 0, sin errores ni warnings ESLint.
- Build: `npm run build`, salida 0, Vite 8.2.1, 1918 módulos, 2.51 s.
- `git diff --check`: salida 0.
- El shim local `npx` estaba roto; se usaron los CLI instalados de npm/Vitest
  con Node. No se instalaron ni actualizaron dependencias.
- Browserslist advierte que caniuse-lite tiene seis meses; no bloqueó build/tests.
- Durante elaboración hubo fallos en los fixtures nuevos y en su aserción DOM
  (inspección costosa de un nodo React); se corrigieron y se repitieron las suites.
  El primer intento de cluster quedó bloqueado por sandbox; la matriz final
  se ejecutó con autorización de proceso local. Ningún fallo involucró producción.

Los logs finales están en `tmp_cpren67/` (ignorado por Git): `backend-suite.log`,
`frontend-node.log`, `frontend-dom.log`, `dom-utc.log`, `postgres-UTC.log`,
`postgres-America-Guatemala.log`, `postgres-Asia-Tokyo.log`, `lint.log`, `build.log`.
La repetición final está en `verification-backend-suite.log`,
`verification-postgres-UTC.log`, `verification-postgres-America-Guatemala.log`,
`verification-postgres-Asia-Tokyo.log`, `verification-lint.log` y
`verification-build.log`.

## Integridad del diff para revisión

El archivo local anterior `tmp_cpren67/CPREN-67.diff` pasa
`git apply --numstat` con salida 0 y 13 archivos. La copia exportada que reportó
encabezados duplicados y corrupción en la línea 436 no está disponible aquí;
no se atribuye una causa exacta a esa copia sin inspeccionarla.

`tmp_cpren67/CPREN-67.verified.diff` se regenera desde stdout binario de Git:
diff contra HEAD para archivos registrados y `git diff --no-index` contra
`/dev/null` para archivos nuevos. Incluye los 13 archivos con un encabezado
único por archivo. Se valida con numstat, comprobación inversa en el árbol actual
y comprobación/aplicación en una copia aislada de HEAD. Los 13 archivos
reconstruidos coinciden con el árbol de trabajo mediante hashes Git, aplicando
sus filtros de fin de línea. El índice real no se altera. El SHA-256 y las
verificaciones exactas están en `tmp_cpren67/diff-verification.json`.

La última revisión cambió únicamente el fixture PostgreSQL y este informe;
no añadió modificaciones al código de producción ya revisado.

## Riesgos y pendientes de revisión

El cambio central hace que todos los DATE escalares leídos por el pool de la
aplicación sean strings civiles, en vez de Date/ISO datetime. Se revisaron los
consumidores internos y se ejecutaron las suites, pero cualquier consumidor
externo de la API debe aceptar el contrato `YYYY-MM-DD` de fechas clínicas.
Timestamps y su formato de instante conservan sus parsers.

No se acredita validación de producción ni integraciones omitidas. No hay
migraciones, reinicios, commit o push de esta corrección. El siguiente paso es
revisar el diff y aprobarlo; cualquier commit/push o despliegue requiere una
instrucción posterior. CPREN-67 queda En revisión; CPREN-65 y CPREN-66 siguen
En revisión.
