# CPREN-68 — Preservar Date al filtrar datos VIH

Revisión local del 8 de octubre de 2026, equipo Casa. Base `main`,
`958d3396757eb4cc32b0da4738c38fd965741252`. Pull inicial: Already up to date.
Sin acceso a producción, commit, push, migraciones, build o reinicio.

## Causa y solución

Sin `controles.ver_vih`, el filtro reconstruía cualquier objeto mediante
`Object.entries`. Un Date nativo no tiene propiedades enumerables: quedaba `{}`
y perdía su serialización JSON habitual. Con permiso se devuelve el original.

Reproducción sintética ejecutada contra la versión de HEAD y la corrección:

```json
// Antes
{"created_at":{},"fur":"2024-02-29"}
// Después
{"created_at":"1970-01-01T00:00:00.000Z","fur":"2024-02-29"}
```

En ambos resultados se eliminó el campo VIH sintético de entrada.

Corrección de una línea: después del retorno autorizado, un Date se clona con
`new Date(value.getTime())`. Conserva el epoch sin conversión ni cambio de zona,
evita compartir una hoja mutable con la entrada y usa la serialización normal.
Un Date inválido continúa inválido y JSON produce null, no una fecha inventada.
Las propiedades adicionales de un Date no se copian, incluidos campos VIH.
Para usuarios autorizados no cambia nada: conserva identidad y campos del DTO.

No se modificaron campos protegidos, permiso requerido, recursión de objetos o
arrays, normalizadores civiles ni parsers PostgreSQL de CPREN-67.

## Auditoría de llamadas

Se encontraron nueve llamadas de producción, todas al preparar `res.json`:

| Controlador | Métodos afectados | DTO filtrado |
| --- | --- | --- |
| pacientesController | obtener, expedienteCompleto | Paciente individual y expediente compuesto; incluye paciente, colecciones y fichas anidadas, embarazos seleccionados/actuales y flags del servicio. |
| controlesPrenatalesController | listar, obtener, crear, actualizar | Array de controles o control individual; campos clínicos DATE y metadata de timestamps. |
| riesgoController | obtener, guardar, actualizar | Ficha de riesgo individual, o null cuando no existe. |

El listado de pacientes y las otras respuestas que no llaman al filtro no se
modifican. No se amplía el alcance a otras políticas de redacción.

## Pruebas ejecutadas

Node 24.11.1; PostgreSQL desechable local 18.3, exclusivamente datos sintéticos.

| Ejecución | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| `node --test test/datosSensibles.test.js` desde backend | 24 | 0 | 0 |
| `node --test --test-concurrency=1 test/*.test.js` desde backend | 1279 | 0 | 49 |
| `test/patientVersionPostgres.test.js`, TZ America/Guatemala | 12 | 0 | 1 |

Las 24 pruebas específicas incluyen los nueve controladores con y sin permiso,
JSON de respuestas, cinco campos VIH protegidos en varios niveles y arrays,
fechas válidas e inválidas, strings YYYY-MM-DD, texto ISO, null, undefined,
booleanos, números y arrays vacíos. Se verifica que ninguna clave protegida
aparezca sin permiso y que el DTO autorizado conserve su contenido e identidad.
La instantánea del original incluye epoch/invalid de Date; también se muta el
Date de salida sin permiso y se confirma que la entrada sigue intacta.

La suite completa incluye regresiones de pacientes/expedientes, controles,
riesgo, permisos, auditoría, fechas civiles y documentos. Las 49 integraciones
opcionales omitidas no se presentan como aprobadas. Se ejecutó separadamente
la integración HTTP PostgreSQL con `RUN_CLINICAL_DATE_POSTGRES=1` y binarios
`C:/Program Files/PostgreSQL/18/bin`: cluster propio 127.0.0.1:55465, sin leer
DATABASE_URL/.env ni conectar a una base existente. Se omitió el caso de
migración deliberadamente; no se invocó el migrador. El fixture define su
schema sintético y se detiene/elimina al terminar.

Concurrencia: dos conexiones cargan la misma versión; la segunda espera
FOR UPDATE y recibe 409 PATIENT_VERSION_CONFLICT, sin sobrescritura ni auditoría
exitosa. No-op conserva filas, versión y auditoría; escritura válida incrementa
y audita; fallo de auditoría revierte todo. Se verificaron DATE→API, permisos,
cinco sesiones y reconexión, TIMESTAMP/TIMESTAMPTZ frente a pg original.

Duración suite completa: 35428.0509 ms. Integración: 12313.7627 ms.
Logs locales ignorados: `tmp_cpren68/backend-suite-final.log` y
`tmp_cpren68/postgres-guatemala.log`.

Durante elaboración, las primeras aserciones de igualdad profunda no trataban
correctamente Invalid Date en Node; se reemplazaron por instantáneas de epoch
que distinguen explícitamente invalid y las pruebas pasaron. Una primera
suite fue lanzada erróneamente desde la raíz en un entorno restringido y tuvo
fallos; se detuvo su proceso y no se utiliza como evidencia de aprobación.
La ejecución válida completa fue desde backend, con servidores HTTP locales
permitidos. No se atribuye la causa de todos los fallos del intento descartado
a un único factor sin diagnóstico. La reproducción inicial por comando inline
falló por quoting; el script local posterior produjo el antes/después anterior.

## Alcance y revisión

Archivos: `backend/src/utils/datosSensibles.js`,
`backend/test/datosSensibles.test.js` y este informe. Sin cambios de frontend,
migraciones, schema, dependencias o despliegue. No procede repetir build/lint
frontend por este cambio exclusivamente backend; backend no define ESLint.

Riesgo acotado: Date se trata como hoja nativa; no se promete preservar
subclases, propiedades personalizadas o toJSON personalizado. Los DTO revisados
usan Date nativos de pg. El filtro sigue orientado a DTOs JSON acíclicos y la
lista existente de campos protegidos: no se amplió ni se alteró esa política.
Sin validación productiva de CPREN-68 ni aprobación de integraciones omitidas.

Git: cambios sin staging, sin commit/push. Diff listo para revisión.
CPREN-68 debe quedar En revisión hasta autorización posterior.
CPREN-65/66/67 no se cierran ni modifican en este trabajo.
