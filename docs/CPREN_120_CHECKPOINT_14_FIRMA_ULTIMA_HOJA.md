# CPREN-120 — CHECKPOINT-14: firma únicamente en última hoja

2026-10-25, America/Guatemala. Casa / HP Victus / HUGUITO.
Rama `feature/cpren-120-editor-pdf-notas-clinicas`.
HEAD y origin: `0f341d78d9fcfa6bb8178cd1a36bec141adf7b5e`.
`origin/main`: `d5fae677fa462af9ca5b7174a46d3ebf21e12196`.
Inicio limpio; `git pull --ff-only` confirmó que ya estaba actualizado; fetch,
worktrees y referencias revisados. Main está ocupado por su worktree y no se tocó.

## Decisión e implementación

El propietario aprobó las cuatro muestras 13B y decidió que el espacio para
firma manuscrita aparezca **únicamente en la última hoja**, también cuando el
documento tiene una sola página. Aplica a evolución médica y enfermería AE/EP.
CPREN-120 y CPREN-126 continúan **En revisión**. Esta implementación no acredita
firma electrónica ni aprobación clínica institucional definitiva.

Se modifica únicamente `backend/src/services/notaClinicaPdf.js` como código
productivo. El pie común de Puppeteer conserva identificación, numeración y el
espacio reservado de la plantilla aprobada; se retira su línea y rótulo de firma.
El hueco sin contenido conserva los 46 px de separación y 10 px de alto del
bloque anterior. No se amplía la narrativa de páginas intermedias.

Tras paginar, el mismo posprocesado `pdf-lib` que coloca FIN DE NOTA obtiene la
última página y dibuja una sola línea y un solo rótulo. La línea mide 148.5 pt,
centrada entre x=231.75 y 380.25, a 39 pt del borde inferior; el rótulo usa
Helvetica de 6.75 pt con línea base a 29.25 pt. Estas posiciones reproducen el
espacio de firma medido de la plantilla carta 13B; no son coordenadas genéricas
para otros tamaños. La identificación sigue a 9 pt y crece hacia arriba mediante
la medición dinámica anterior. No se usa JavaScript en `footerTemplate`.

Las pruebas de geometría comparan las posiciones de Paciente, Responsable y
Hoja No. con 13B, con tolerancia de 0.1 pt, y mantienen el número de páginas en
los casos existentes. La separación mínima entre identificación y línea de
firma es **31.09 pt**, superior a 30 pt. El rótulo queda separado de la línea y
de la numeración. FIN DE NOTA conserva su posición tras la última línea narrativa.

No cambian estados, finalización administrativa, auditoría, versión, responsables,
permisos ni datos persistentes. Descargar un PDF no marca una nota como firmada.
Se conservan logos, títulos, fecha/hora clínica por hoja, columna FECHA/HORA,
narrativa rayada, referencias del control, nombres largos y omisión del capturista
sin identidad histórica verificable. Las leyendas retiradas en 13B siguen ausentes.

## Muestras y verificación

Toda la salida nueva está en [`cpren120/checkpoint14/`](cpren120/checkpoint14/).
Los documentos 09/10/11/12/13/13B permanecen íntegros y no se regeneraron.

| Muestra sintética | Páginas | Firma |
| --- | --- | --- |
| [Evolución breve](cpren120/checkpoint14/pdf/01-evolucion-breve.pdf) | 1 | Solo hoja 1 |
| [Enfermería EP, nombres largos](cpren120/checkpoint14/pdf/02-enfermeria-breve.pdf) | 1 | Solo hoja 1 |
| [Evolución continua](cpren120/checkpoint14/pdf/03-evolucion-dos-paginas.pdf) | 2 | Solo hoja 2 |
| [Enfermería extensa](cpren120/checkpoint14/pdf/04-enfermeria-estres.pdf) | 12 | Solo hoja 12 |
| [Última hoja completa, 66 renglones](cpren120/checkpoint14/pdf/05-evolucion-limite-ultima-hoja.pdf) | 2 | Solo hoja 2 |

Se verifican **19 PDF / 69 páginas**, incluidas las cinco muestras, seis bordes
de 32/33/34 y 65/66/67 renglones, nombres de paciente de 100+100 caracteres y
responsable/cargo de 150, caso positivo de capturista histórico sintético, enfermería
AE, cuatro regresiones extensas de 10/8 hojas y dos PDF del endpoint autorizado.

El verificador exige en cada documento exactamente una línea de firma de la
geometría indicada y una aparición del rótulo, ambas únicamente en la última
hoja; también comprueba identificación y numeración en todas, carta 612×792 pt,
logos sin deformación, nombres íntegros por columnas, fecha/hora originales,
ausencia de leyendas retiradas, FIN DE NOTA únicamente al final y narrativa
completa normalizada, sin pérdidas ni duplicaciones. No se crean hojas adicionales
para firma ni páginas vacías. Los nuevos casos sin antecedente 13B se distinguen
de las comparaciones de regresión en `pdf-verification.json`.

Se renderizaron **14 PNG** con Poppler. La inspección de primeras, últimas e
intermedia de estrés se resume en [contact-sheet.png](cpren120/checkpoint14/contact-sheet.png).
La hoja 1/2 y las hojas 1/12 y 6/12 no muestran firma; las últimas sí. El caso
de 66 renglones conserva FIN DE NOTA, identificación, firma y número en su segunda
hoja, sin colisiones. Se inspeccionaron además los casos de nombres máximos y
de 20 000 caracteres.

## Pruebas ejecutadas en CHECKPOINT-14

| Comprobación | Resultado exacto |
| --- | --- |
| Backend completo `npm test` | 1420 totales; **1362 aprobadas**, 0 fallos, **58 opt-in omitidas** |
| Chrome, muestras y regresiones PDF | **5/5**, 0 omitidas |
| Migraciones históricas 027→030 y nuevo ensayo main 022→030/restauración | **12/12**, 0 omitidas |
| Catálogos, HTTP y concurrencia | **7/7**, 0 omitidas |
| Perfiles, cuentas, correo, sesiones y renombrado | **15 aprobadas**, 0 fallos, 1 navegador opt-in omitido |
| Permisos, directorio y autoría | **15/15**, 0 omitidas |
| Notas, seguridad, endpoint PDF y auditoría | **21/21**, 0 omitidas |
| Seguimiento/controles | **18 aprobadas**, 0 fallos, 2 recorridos Chrome opt-in omitidos |
| Frontend `npm test` | **191 lógicas + 300 DOM**, 26 archivos DOM; 0 fallos |
| Frontend `npm run lint` / `npm run build` | Aprobados; build con `NODE_ENV=production` |
| Python/pdfplumber/Poppler | **19 PDF / 69 páginas**, 14 PNG; aprobado |
| `git diff --check` / preservación de migraciones y evidencia anterior | Aprobados |

No se suman conteos solapados. Los opt-in del backend general se ejecutan en las
selecciones explícitas relacionadas; no se afirma haber ejecutado todos los opt-in
del repositorio. Los tres recorridos UI de perfiles/seguimiento omitidos aquí
conservan su evidencia anterior, sin presentarla como una ejecución nueva.

Los clústeres propios se crean con initdb, escuchan solo en loopback, verifican
su directorio temporal y se cierran/eliminan al terminar. La prueba nueva emplea
schema y migraciones 001–022 del SHA de main indicado, datos sintéticos y la cadena
023–030 vigente. Comprueba conservación exacta de filas, credenciales/sesiones,
roles y concesiones previas; ningún permiso clínico se otorga automáticamente.
Las cuentas antiguas conservan `email=NULL` y `cargo_id=NULL`; el cargo Médico/a
continúa sin MED inferido. Se ensayó pg_dump/pg_restore antes y después del upgrade
solo con esa base sintética; los dumps temporales se eliminan y se publican
únicamente hashes y conteos. Esto **no es una prueba con un respaldo real de AWS**.

Incidencias del harness: el sandbox bloqueó initdb y se repitió fuera de él; una
fixture nueva usaba el mismo parámetro SQL como texto e integer (42P08), corregido
sin cambios del producto. El primer build del runner heredaba NODE_ENV=test;
se corrigió a production y se repitió. El build final y todas las selecciones
finales pasaron. Aviso informativo de Browserslist, sin actualizar dependencias.

## Reproducción y archivos

Desde `backend`, con Node/npm, Chrome local y PostgreSQL 18 de esta PC:

```text
node scripts/validateCheckpoint14.cjs samples
node scripts/validateCheckpoint14.cjs notes
node scripts/validateCheckpoint14.cjs migrations
node scripts/validateCheckpoint14.cjs catalogs
node scripts/validateCheckpoint14.cjs profiles
node scripts/validateCheckpoint14.cjs authorship
node scripts/validateCheckpoint14.cjs tracking
node scripts/validateCheckpoint14.cjs backend
node scripts/validateCheckpoint14.cjs frontend
node scripts/validateCheckpoint14.cjs lint
node scripts/validateCheckpoint14.cjs build
```

Desde raíz: `backend/scripts/verifyCheckpoint14Pdf.py` con Python y Poppler en
PATH, y `node backend/scripts/auditClinicalDeployment14.cjs`. Los resultados
estructurados están en `checkpoint14/*-result.json`, `test-results.json`,
`pdf-verification.json`, `migration-readiness.json`, `deployment-inventory.json`,
`git-state.json` y `evidence-manifest.json`. Logs locales en `tmp_cpren14/logs/`,
ignorados; sin credenciales ni datos reales en evidencia pública.

Archivos existentes modificados: generador, `notaClinicaPdf.test.js`,
`notaClinicaPdfCheckpoint13.test.js` y `notasClinicasPostgres.test.js`. En pruebas
se adapta exclusivamente la aserción de firma y el destino de salida para no
sobrescribir 13B; se añaden los casos de borde y AE. Archivos nuevos: tres scripts
14, `checkpoint14MigracionesPostgres.test.js`, este informe, el plan de despliegue
y las evidencias 14. Ningún archivo de frontend, migración histórica o n8n cambia.

## Preparación de despliegue y cierre

El [plan coordinado CPREN-115–126](CPREN_PLAN_DESPLIEGUE_CLINICO_115_126.md) incluye
inventario, dependencias, secuencia nativa, respaldos, recuperación, smoke y
bloqueadores. No hay un defecto técnico local pendiente de estas verificaciones;
sí faltan revisión final de 14, conciliación de issues, SHA integrado autorizado,
preflight productivo, respaldo real restaurado y validación en el entorno Linux.
Se puede preparar esa siguiente fase autorizada; **no se autoriza desplegar**.

HEAD no cambia. Sin staging, commit, push, PR, merge, rebase, squash, main, AWS,
migraciones persistentes, datos reales ni CPREN-121. CPREN-120/126 permanecen En
revisión. Los cambios quedan locales y las muestras listas para el propietario.
