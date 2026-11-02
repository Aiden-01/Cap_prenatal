# PREDEPLOY-03 — Correcciones locales y diagnóstico Linux pendiente

2026-11-02, America/Guatemala. Casa / HP Victus / dispositivo Huguito.
CPREN-120 y CPREN-126 permanecen **En revisión** por instrucción del propietario.

**Correcciones preparadas localmente, sin commit, push ni cuarto workflow.**
La autorización cubre diagnóstico y correcciones locales; publicar/ejecutar
requiere revisión posterior del inventario. El tercer ensayo continúa
**failure**: este documento no cambia su resultado histórico.

Referencia: [tercer ensayo 41489452026](https://github.com/Aiden-01/Cap_prenatal/actions/runs/41489452026),
commit `adff7e11e76a1e3ca67e02251746eedb76200654`, rama
`feature/cpren-120-editor-pdf-notas-clinicas`.
Se revisaron el [informe PREDEPLOY-02](CPREN_PREDEPLOY_02_GITHUB_ACTIONS.md),
el [plan clínico 115–126](CPREN_PLAN_DESPLIEGUE_CLINICO_115_126.md) y la
evidencia descargada en `tmp_predeploy02/third-run-41489452026/`.
El informe local previo y `docs/tesis/` se preservaron; no se hizo pull por
existir cambios locales. No se modificó main ni ningún worktree ajeno.

## 1. Harness de seguimiento: causa confirmada y corrección

El import `service` de `seguimientoNotasService` quedaba oculto dentro del test
por `const service = serviceFixture(...)`. La fixture PostgreSQL ofrece
`start`, `verify` y `close`, sin los métodos clínicos `confirmar` y `listar`.
Dos subtests llamaban a esos métodos sobre el objeto incorrecto.

Se renombraron la variable y exclusivamente sus referencias de ciclo de vida
a **`postgresFixture`**. Se conservaron el import y las llamadas clínicas a
`service.confirmar` y `service.listar`, sus assertions, transacciones y validación
de permisos. No se cambió ningún contrato de backend productivo.

Las pruebas unitarias de seguimiento y autoría verifican permisos actuales,
sesión revocada/inactiva, identidad, elegibilidad, no atribución implícita y
snapshots legados. **La reversión transaccional real ante fallo de auditoría,
aislamiento SQL y revocación con PostgreSQL siguen pendientes de Linux.**
El test PostgreSQL local produjo **1 skip y 0 pass** por no activar el opt-in;
no se usa ese resultado como validación. No había `pg_ctl`/`psql` en PATH ni
se instaló o inició PostgreSQL en la Victus.

## 2. Timeout documental: lo demostrado y lo todavía desconocido

La assertion y el stack del fallo original no están en el artefacto del tercer
run. **No se puede demostrar cuál fue su causa raíz histórica**. Se encontraron
dos problemas observables en el diseño del test, sin demostrar un defecto del
código productivo de terminación:

1. El plazo de **450 ms** comenzaba antes de que el padre/hijo confirmaran
   arranque. Al vencer, el catch leía `child.pid` obligatoriamente; si aún no
   existía, `ENOENT` ocultaba `DOCUMENT_PROCESS_TIMEOUT`. Un caso sintético de
   arranque demorado reproduce de forma determinista archivo ausente a450ms.
2. `process.kill(pid, 0)` prueba existencia/permisos, no ejecución. En Linux,
   un proceso `Z` es un zombi terminado que todavía puede existir en `/proc`.
   El test anterior lo consideraba activo. Se prueba esta distinción con
   fixtures de estado, sin afirmar haber observado un zombi en el runner real.

La fixture nueva inicia **padre e hijo reales sintéticos** mediante IPC y espera
confirmación del hijo antes de comenzar la medición de timeout. Su preparación
tiene un límite separado de5s que **falla**, nunca aprueba, si no hay readiness.
`runDocumentProcess` recibe ese ChildProcess mediante su punto de inyección
existente `execFileImpl`; su timer, terminación y callback de salida son reales.
Se conserva **450 ms**, se comprueba que ambos procesos estaban activos antes,
que padre/hijo dejan de ejecutar después y que desaparece el directorio temporal.
El test tiene límite exterior de15s para que un fallo del harness no cuelgue CI.

La sonda solo de tests lee el estado de `/proc/<pid>/stat` en Linux, considerando
`Z`/`X` terminados; estados desconocidos, lectura inválida o permisos insuficientes
se consideran **activos** conservadoramente. El estado zombi se conserva como
tal en el diagnóstico: no se afirma que desaparezca su entrada del kernel.

La revisión del código muestra que POSIX usa un grupo independiente (`detached`)
y señales a `-pid`; el hijo hereda ese grupo. Una prueba con señales inyectadas
comprueba TERM y KILL al grupo. **La terminación real de grupo en Linux permanece
pendiente**. Windows usa el árbol de `taskkill`, validado con procesos reales.

`withPdfTempDir` ya elimina en `finally`; se añadió un caso de excepción durante
la preparación, además de la comprobación de eliminación tras timeout.
`backend/src/utils/documentProcess.js` y `pdfTemp.js` **no se modificaron**;
el timeout productivo sigue en120s. Si el siguiente diagnóstico evidencia un
defecto productivo, se requiere propuesta y revisión antes de cambiarlo.

Resultado real Windows del ensayo focalizado: readiness **true**, padre **absent**,
hijo **absent**, temporales eliminados **true**. Las seis suites focalizadas se
ejecutaron concurrentemente por archivo; esto aporta evidencia local, sin
reproducir la carga ni el sistema operativo de GitHub.

## 3. Desbordamiento del título del expediente

Evidencia original: `notas-768-claro.png` del tercer run mide **808×4154** con
viewport768. El nombre de la paciente se extiende a la derecha del encabezado.
El módulo de notas está embebido en `ExpedientePaciente`; no es un problema
originado necesariamente en `NotasClinicas.jsx` o su formulario.

Causa demostrada de ese desbordamiento del título: `.patient-hero-title` exige
**`white-space: nowrap`**. A768px se conserva la barra lateral de260px, y el
hero tiene columnas de botón y nombre. Aunque tiene `min-width:0` y
`overflow-wrap:anywhere`, `nowrap` impide el salto de línea. Las tipografías
y el navegador influyen en cuánto sobresale el texto.

Se cambia **una propiedad** en `frontend/src/index.css`: `white-space: normal`
para ese título. No se reducen fuentes, no se oculta overflow de html/body y
no se eliminan controles, contenido ni navegación. No fue necesario modificar
NotasClinicas, ExpedientePaciente ni seguimiento-notas.css.

Reproducción local acotada: componente real ExpedientePaciente/Editor con API
sintética en memoria, sin PostgreSQL ni autenticación real. Se usó el Chrome
ya instalado **156.0.8078.74**, Windows, Node **v24.11.1**; no se instaló Chrome148.
Antes, a768px el título tenía `clientWidth=308`, `scrollWidth=332`,
`whiteSpace=nowrap`. Después: **308/308**, `whiteSpace=normal`, título en dos
líneas. En Windows el documento completo ya medía768 antes; **no se reprodujo
exactamente el808 de Linux**. Se reprodujo y corrigió la salida del texto de su
columna, que la captura Linux también muestra.

Se midieron **1440,1280,768,390,320**, en **claro y oscuro**: diez combinaciones
con `document.scrollWidth=viewport` y controles del editor con ancho positivo
y dentro del viewport. Se revisó visualmente la captura768 posterior. Esto no
equivale al recorrido completo con11 notas, directorio y PostgreSQL del runner.
DOM de notas/navegación/seguimiento también aprobó, con datos simulados.
La comprobación exacta **Linux/Chrome148 y todos los tramos posteriores del
recorrido CHECKPOINT-09/10 permanecen pendientes**.

La utilidad compartida de layout se ejecuta mediante `page.evaluate` y conserva
JSON **antes** de las assertions. Registra viewport/scrollWidth, selector de
tag/clases permitidas, bounding rectangle, anchos, hasta cinco antecesores y
CSS concreto (display, grid, flex, white-space, overflow-wrap, padding y gap).
No lee texto, valores de formularios, id, cuerpos HTTP, cookies ni tokens.
Las screenshots y el bloqueo de solicitudes externas del helper se conservan.

## 4. Diagnóstico de CI y control de integridad

Se añade un segundo reporter Node: TAP permanece únicamente en logs efímeros;
el reporter estructurado produce una lista limitada de metadatos seguros.
No se parsea ni publica el YAML libre del TAP. El resumen conserva fase, exit
code, tipo/código conocido de error, archivo de prueba relativo, línea/columna,
nombre estático comprobado contra el fuente y assertion sanitizada.

Solo operandos **numéricos, booleanos o null** y operadores conocidos se conservan.
Textos/objetos, mensajes libres, stacks, rutas externas, códigos desconocidos y
nombres dinámicos se omiten. Por ejemplo, `808 strictEqual 768` queda disponible
sin narrativa o identidad. Un fallo dinámico conserva su referencia y código
permitido aunque se omita el nombre. DOM/Vitest conserva referencias seguras;
sus mensajes libres se omiten. Si la información no es verificable, no se
inventa una assertion exacta.

El diagnóstico de timeout admite únicamente readiness, estados permitidos de
padre/hijo y booleano de eliminación temporal. Rechaza claves adicionales o
texto arbitrario. Se probó un fallo intencional en un subrunner: exit1 y
assertion numérica quedaron en JSON sin convertir el fallo en éxito. Ese fallo
es una fixture de prueba del reporter; la suite que lo comprueba aprobó.

Las fases Node invocan `node --test` con los mismos archivos que el anterior
`npm test`; solo se enumeran explícitamente para añadir el reporter sin cambiar
package.json. El proceso de publicación mantiene su filtro previo, extensiones,
rechazo de enlaces simbólicos y escaneo de secretos; no se suben logs crudos.

El preflight anterior exigía igualdad absoluta de todo frontend/src respecto al
candidato74a458a, incompatible con el cambio CSS solicitado. Se conserva igualdad
de **todo backend/src, manifiestos y lockfiles**. Frontend admite exclusivamente
`frontend/src/index.css` con contenido completo SHA256 aprobado:
`9b6d24a932331046de714e25fdcdac26d82368c813bcd2a7033f0e2a6dbd7509`
(LF normalizado). Cualquier otro archivo o contenido falla. Pruebas negativas
comprueban ambas restricciones. El hash queda registrado en el resumen futuro.
Esto hace explícita la única diferencia funcional propuesta para autorización;
no abre una excepción general al control de identidad o integridad.

No se modifican workflow YAML, permisos, usuario, ACL, probes de red, sandbox,
versión de Chrome, PostgreSQL service, migraciones023–030 o dependencias.

## 5. Validaciones efectivas y límites

| Verificación local | Resultado real |
| --- | --- |
| Backend focalizado, doble reporter | **66 pass / 0 fail / 0 skip / 0 cancel**, exit0, 3.942s |
| Reporter de procesos real | Readiness true, padre/hijo absent, temporales eliminados; JSON sin logs crudos |
| Frontend lógica responsive/fecha | **8 pass / 0 fail / 0 skip**, exit0 |
| DOM notas/navegación/seguimiento | **43 pass**, 3 archivos, exit0, 6.58s |
| Visual Windows | Diez combinaciones ancho/tema; sin overflow del documento y controles medidos dentro del viewport |
| Lint | `npm run lint`, exit0 |
| Build | `npm run build`, exit0, Vite8.2.1, 3.11s |
| Sintaxis | Node --check en los11 archivos JavaScript nuevos/modificados, aprobada |
| Diff | `git diff --check` aprobado |
| Seguimiento PostgreSQL | **1 omitida / 0 aprobadas**; integración SQL pendiente |
| Linux/Chrome148 y Node20 reporter | **No ejecutado**; pendiente de autorización del cuarto ensayo |

Comando focalizado: `node --test` con `pdfProcessHardening`, `predeploy03Diagnostics`,
`seguimientoNotas`, `autoriaClinica`, `predeploy02ChromeSandbox` y `predeploy02Safety`.
Todos los ensayos locales se hicieron con Node24.11.1 instalado; no se afirma
haber probado el nuevo reporter en Node20. Se conservan los engines del candidato.

Hubo fallos instrumentales durante preparación: Chrome no pudo arrancar bajo el
sandbox del agente; una prueba de terminación quedó bloqueada allí y se cerraron
solo sus cuatro procesos sintéticos identificados. Se repitió fuera de ese
sandbox con autorización y pasó. Vitest también falló inicialmente por ENOENT
en el directorio temporal del agente; fuera de él pasaron las tres suites.
No se desactivó el sandbox de Chrome. El reporter nuevo requirió corregir la
ruta Windows a file URL y separar NODE_TEST_CONTEXT del subrunner de su test;
el estado final está cubierto por la prueba de integración aprobada.

Avisos no bloqueantes: Browserslist desactualizado y tiempos de plugins del build;
no se actualizaron datos/dependencias ni se instaló software para silenciarlos.

Evidencia de trabajo local, ignorada y sin propuesta de publicación:
`tmp_predeploy03/before/`, `tmp_predeploy03/after/`, `visual-local.cjs` y
`process-diagnostics.jsonl`. La entrada frontend temporal se eliminó tras las
sondas para no interferir con lint. No se editaron los artefactos originales
del tercer run. Las copias de PDF Linux siguen siendo las de PREDEPLOY-02.

## 6. Inventario completo propuesto para revisión

| Ruta | Cambio |
| --- | --- |
| `.github/clinical/run-predeploy02.cjs` | Integración de reporter y excepción CSS exacta con integridad conservada |
| `.github/clinical/candidate-integrity.cjs` | Nuevo guard estricto de archivo/hash CSS |
| `.github/clinical/node-test-reporter.cjs` | Nuevo reporter limitado de eventos Node |
| `.github/clinical/test-failure-diagnostics.cjs` | Nuevo filtro compartido de metadatos/error/estado |
| `backend/test/seguimientoNotasPostgres.test.js` | Renombrar solo fixture; servicio clínico intacto |
| `backend/test/pdfProcessHardening.test.js` | Readiness, estado Linux, limpieza y casos negativos;450ms conservados |
| `backend/test/fixtures/document-process-tree.cjs` | Nueva fixture padre/hijo IPC sintética |
| `backend/test/helpers/syntheticProcessState.js` | Nueva sonda de procesos para tests |
| `backend/test/helpers/notasCheckpoint09Browser.js` | Guardar diagnóstico sanitizado antes de assertion |
| `backend/test/helpers/layoutDiagnostics.js` | Nuevo recolector de geometría/CSS sin contenido |
| `backend/test/predeploy03Diagnostics.test.js` | Nuevas pruebas de privacidad, reporter e integridad |
| `frontend/src/index.css` | Una propiedad: permitir wrap del título de paciente |
| `docs/CPREN_PREDEPLOY_02_GITHUB_ACTIONS.md` | Informe local previo preservado y referencia al nuevo trabajo |
| `docs/CPREN_PREDEPLOY_03_CORRECCIONES_LINUX.md` | Este diagnóstico e inventario |

**14 archivos propuestos; ninguno preparado para commit.** `docs/tesis/` es
trabajo ajeno preexistente, no forma parte del inventario. No se modificaron
datos, migraciones históricas, código de procesos productivo ni lockfiles.
HEAD local/origin sigue en `adff7e11e76a1e3ca67e02251746eedb76200654`.
Main y worktrees conservan sus SHAs previos.

## 7. Recomendación y riesgos residuales

Se recomienda **autorizar un cuarto ensayo controlado después de revisar este
inventario**, para validar las correcciones en Linux y obtener el diagnóstico
que faltaba. Esta recomendación **no constituye autorización ni GO clínico**.
Se mantiene **NO-GO para despliegue o siguiente fase operativa**.

Pendientes obligatorios: preflight completo intacto; reporter real Node20;
timeout/grupo y estados Linux; seguimiento PostgreSQL con rollback, revocación,
inactividad y aislamiento; UI148 en cinco anchos y ambos temas con todo el
recorrido posterior; suites completas y PDF sin regresiones. La causa exacta
del fallo original de timeout sigue abierta y puede reaparecer como defecto
real; no se modificará su lógica productiva sin revisión.

No hubo AWS, despliegue, main/PR, cuarto workflow, migraciones persistentes,
respaldos/pacientes reales, n8n, instalaciones o inicio de CPREN-121. El ensayo
de restauración real privada conserva su autorización separada pendiente.
Este trabajo se detiene localmente para revisión del propietario.

Registro Jira de esta preparación:
[CPREN-120, comentario10539](https://tareajiraads.atlassian.net/browse/CPREN-120?focusedCommentId=10539)
y [CPREN-126, comentario10540](https://tareajiraads.atlassian.net/browse/CPREN-126?focusedCommentId=10540).
