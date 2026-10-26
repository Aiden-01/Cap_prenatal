# CPREN-120 — CHECKPOINT-13 / 13B: ajustes finales del PDF

## Aprobación visual y respaldo autorizado — 2026-10-25

El propietario confirmó la aprobación visual de las cuatro muestras de 13B y
autorizó su respaldo junto con CHECKPOINT-11/12/13 en la rama CPREN-120.
El [informe de publicación](cpren120/PUBLICACION_CHECKPOINT_11_13B.md) contiene
el inventario, controles y resultados comprobados. CPREN-120/126 siguen En revisión;
la política de firma por hoja continúa pendiente de validación clínica con el CAP.
El registro siguiente conserva el estado al entregar las muestras, antes de
esta aprobación y de la autorización de commit/push.

## Registro de implementación: CHECKPOINT-13B — 2026-10-25, Casa / HUGUITO

Las muestras nuevas están listas para revisión visual, sin aprobación definitiva.
CPREN-120 y CPREN-126 permanecen En revisión. Se aplicaron exclusivamente los
tres ajustes de presentación solicitados; el generador compartido se conserva.

1. **Identificación a 9 puntos reales** (12 px CSS), el mayor tamaño solicitado.
   Paciente, expediente, control, responsable y cargo conservan dos columnas
   adaptables. Se mide la altura efectiva del pie con el mismo Chrome y se reserva
   el espacio necesario; no se reduce la fuente ni se invade la narrativa/firma
   cuando hay nombres largos. Se probaron campos de paciente de 100 caracteres
   y responsable/cargo de 150 caracteres, íntegros y sin superposición.
2. **Capturista omitido si no hay identidad histórica verificable.** No se imprime
   «Nombre histórico no disponible» ni un ID como sustituto. El servicio actual
   no conserva/proporciona ese nombre, por lo que el endpoint omite todo el campo.
   La plantilla solo admite una proyección interna previamente verificada de
   `snapshot_captura`, con ID coincidente y nombre válido; no la recibe del cliente
   HTTP ni consulta usuarios actuales. La rama positiva se prueba con una fuente
   exclusivamente sintética. No se creó un snapshot persistente ni se rellenó
   historia por inferencia. `capturista_usuario_id` permanece intacto.
3. **Leyenda administrativa eliminada del PDF**, tanto en borradores como en
   capturas finalizadas. No se imprimen «Captura finalizada», «No equivale a firma
   clínica» ni su variante de borrador. Estados, finalización, permisos, auditoría,
   versionado y reglas de firma no cambiaron. La ausencia de la leyenda no acredita
   una firma: se mantiene el espacio manuscrito y su política por hoja está pendiente.

Se conservan logos originales, carta 612 × 792 pt, CAP El Chal, títulos, fecha/hora
clínica en cada hoja, columna de 88 px, narrativa rayada, control legible,
FIN DE NOTA al final y numeración. La separación libre mínima de firma medida es
**31.84 pt**, aproximadamente **11.2 mm**. La posición del cierre usa el margen
inferior efectivamente medido; no se agrega una página solo para la leyenda.

### Evidencia nueva de 13B

Salida exclusiva: `docs/cpren120/checkpoint13b/`. Las evidencias 11/12/13 no se
sobrescribieron. Se verificaron **17 PDF / 66 páginas** y se renderizaron **12 PNG**;
se inspeccionaron primera/última, intermedia del estrés y el caso de nombres al
límite con identidad histórica sintética. La extracción de nombres se valida por
columna, evitando mezclar las dos columnas del pie al comparar su contenido.

| Muestra para revisión | Archivo en `checkpoint13b/pdf/` | Páginas |
| --- | --- | --- |
| Evolución breve | `01-evolucion-breve.pdf` | 1 |
| Enfermería breve, nombres largos | `02-enfermeria-breve.pdf` | 1 |
| Evolución multipágina | `03-evolucion-dos-paginas.pdf` | 2 |
| Enfermería de estrés | `04-enfermeria-estres.pdf` | 12 |

Se mantienen las extensiones anteriores de las cuatro muestras. Las regresiones
previas conservan 10 páginas por tipo y 8 para cada caso de 20 000 caracteres.
Los seis bordes 32/33/34 y 65/66/67 líneas pasan, así como el caso de nombres
máximos en una sola hoja. Se comparan narrativa completa, fuente de identificación
a 9 pt, nombres íntegros, separación de columnas, firma, fechas, numeración,
ausencia de leyendas retiradas y capturista solo con la identidad histórica indicada.

| Prueba ejecutada en esta sesión | Resultado |
| --- | --- |
| Backend `npm test --prefix backend` | **1419 totales; 1362 aprobadas, 0 fallos, 57 opt-in omitidas** |
| Unitarias/HTTP/contexto PDF | **13 aprobadas, 0 fallos, 2 opt-in**, ejecutadas en muestras |
| Chrome: muestras, nombres, bordes y regresiones | **5/5**, sin omisiones |
| Endpoint, seguridad, estados y auditoría en PostgreSQL desechable | **21/21**, sin omisiones |
| Frontend lint y build | Aprobados; frontend sin modificaciones |
| Verificación Python/Poppler y revisión visual | **17 documentos / 66 páginas**, 12 renderizadas |
| `git diff --check` | Aprobado |

No se suman conteos solapados. Las pruebas DOM/recorridos UI de las entregas
anteriores no se presentan como ejecutados otra vez. No se consultaron bases
persistentes. Los avisos informativos de Browserslist/Vite no impidieron el build.
La primera comprobación de nombre largo mezclaba columnas al extraer texto: se
corrigió el verificador para examinarlas por separado; las imágenes confirmaron
que el nombre estaba completo, sin un defecto de recorte en el producto.

Reproducción desde `backend`, con binarios locales y destinos desechables:

```text
node scripts/validateCheckpoint13.cjs samples --checkpoint13b
node scripts/validateCheckpoint13.cjs unit --checkpoint13b
node scripts/validateCheckpoint13.cjs notes --checkpoint13b
```

Desde la raíz: `backend/scripts/verifyCheckpoint13bPdf.py` con el Python del runtime.
`checkpoint13b/README.md`, `pdf-verification.json`, `test-results.json`,
`preservation.json`, `git-state.json` y `evidence-manifest.json` concentran la evidencia.

Archivos de 13B: `backend/src/services/notaClinicaPdf.js` (único archivo productivo),
`backend/test/notaClinicaPdf.test.js`, `notaClinicaPdfCheckpoint13.test.js`,
`notasClinicasPostgres.test.js` (solo salida de evidencia),
`backend/scripts/validateCheckpoint13.cjs`, nuevo `verifyCheckpoint13bPdf.py`, este
informe y `docs/cpren120/checkpoint13b/`.

Git conserva la rama `feature/cpren-120-editor-pdf-notas-clinicas`, HEAD/origin
`375da7a5b06f40f3fc0c828f39df326d0ea0c1f9`, con avances previos y cambios nuevos
locales. Sin staging, commit, push, merge, main, AWS, migraciones persistentes,
datos reales o CPREN-121. Se detiene con las muestras listas para el propietario.

---

## Registro histórico CHECKPOINT-13

Las secciones siguientes conservan el informe de la entrega anterior. Sus reglas
de capturista neutral, leyenda administrativa y tamaño de identificación fueron
sustituidas por la actualización 13B anterior; sus evidencias siguen intactas.

2026-10-25, America/Guatemala. Equipo Casa, HP Victus, dispositivo HUGUITO.
Repositorio `C:\cap_prenatal`, rama `feature/cpren-120-editor-pdf-notas-clinicas`.
HEAD inicial y final: `375da7a5b06f40f3fc0c828f39df326d0ea0c1f9`.

**Muestras listas para aprobación visual del propietario.** CPREN-120 y CPREN-126
permanecen En revisión. El diseño anterior fue aprobado como base por el usuario;
esta entrega no presume aprobación de los ajustes ni validación clínica de firma.

## Alcance y preservación

Se revisaron rama, HEAD, Git, informe CHECKPOINT-11, cambios locales y generador/
pruebas antes de editar. El árbol tenía trabajo de CHECKPOINT-12: se conservó,
sin pull, reset, clean ni cambio de rama. No se reconstruyó el generador: se
mantienen tabla clínica, corte de líneas, plantilla compartida, Chrome, logos,
numeración, autorización y generación del endpoint existente.

Los hashes iniciales de 128 archivos están en
`cpren120/checkpoint13/initial-file-hashes.json`. De ellos, 124 permanecen idénticos.
Los cuatro cambios intencionales corresponden al generador, servicio/repositorio
del PDF y extensión de su prueba previa. Las correcciones anteriores y toda la
evidencia CHECKPOINT-11/12 se preservan. `preservation.json` registra la comprobación.
La prueba previa de 20 000 caracteres sigue presente y se ejecutó nuevamente con
salida separada. No se modificó el editor web ni el CSS de CHECKPOINT-12.

## A. Fecha y hora en todas las hojas

La fecha/hora original de atención aparece ahora en el encabezado repetido de la
columna FECHA/HORA: `20/10/2026` y `09:30`, por ejemplo. No se repite en cada fila.
El ancho sigue siendo **88 px CSS / 66 pt**. Se conserva la narrativa sin cambios.

El formato se obtiene de los valores civiles DATE/TIME del registro, reordenando
la fecha y mostrando HH:mm. No se convierte a UTC, no se usa la zona del navegador
ni se sustituye por la fecha de generación. Fecha/hora ausentes en borradores se
presentan neutralmente como «Sin fecha» / «Sin hora». Las integraciones existentes
de DATE/TIME y zonas horarias pasaron nuevamente.

## B. Capturista y control

**Capturista:** el modelo conserva `capturista_usuario_id`, pero no una instantánea
de su nombre al capturar. El nombre del responsable clínico es otro dato y no
demuestra el nombre histórico del capturista, aunque en algunos casos coincidan
las cuentas. No se consulta el nombre actual de usuarios ni se reconstruye una
identidad a partir de auditorías incompletas o con permisos distintos.

Se muestra **«Capturista: Nombre histórico no disponible»**. El ID continúa en el
registro interno y no se imprime como nombre. Es una limitación documentada, no
un nombre inventado. Propuesta posterior, fuera de alcance: evaluar un snapshot
inmutable del capturista al crear nuevas notas, con diseño/migración/auditoría
autorizados; los registros existentes sin evidencia no deberían rellenarse por
inferencia. No se implementó ese cambio estructural.

**Control:** la consulta mínima ya existente de paciente para PDF incorpora un
LEFT JOIN al control, restringido simultáneamente por ID, paciente y embarazo.
Se ejecuta después de autorizar la nota y el tipo documental; no agrega consultas
a usuarios ni expone email, permisos u otros datos personales. El servicio entrega
al generador únicamente número y fecha clínica de la relación comprobada.

- Con relación válida: `Control: N.º 2 · 20/10/2026`, por ejemplo.
- Sin relación: `Sin control asociado`.
- Relación sin información recuperable: `Referencia no disponible`; nunca se usa
  la clave primaria como número correlativo.

La integración demuestra que el control **114** corresponde al **N.º 4**, fecha
**01/09/2026**, conservando por separado la atención original **01/06/2026 08:30**.
Controles de otra paciente o embarazo no aportan referencias al PDF. Los nombres
actuales ajenos al contrato se excluyen por lista explícita de campos.
No se modificó ningún registro histórico, autoría clínica ni esquema de datos.

## C. Firma manuscrita

Se amplió la separación vertical antes de la línea de firma y se ajustó el margen
inferior de forma coordinada. El mínimo medido entre los últimos datos de
identificación y la línea es **31.57 pt**, aproximadamente **11.1 mm**. Se conservan
nombre/cargo del responsable, línea, rotulación y numeración, sin superposiciones.

Se mantiene provisionalmente el bloque por hoja. **La política clínica definitiva
de firma por hoja sigue pendiente.** No se incorpora firma electrónica/simulada,
no se crea un estado firmado y «Captura finalizada» sigue sin equivaler a firma.

## D. FIN DE NOTA

El cierre gris discreto aparece una sola vez, inmediatamente después de la tabla
del contenido, en la última hoja. Se aplica al PDF ya paginado mediante `pdf-lib`,
dependencia existente. No se concatena a `contenido`, no modifica la base ni el
objeto original y no participa en el flujo que determina saltos de página.

La posición usa la altura de fila/cabecera medida en Chrome y el espacio reservado
del documento carta. Se comprueba la paginación antes de entregar el resultado;
una discrepancia provoca un error controlado de generación, sin PDF parcial.
Las pruebas cubren 32/33/34 y 65/66/67 líneas, incluidos finales exactos de página.
La leyenda no desplaza ni oculta la última línea y no crea una hoja para sí sola.

«FIN DE NOTA» identifica el final del contenido exportado, incluso en borradores;
no representa finalización administrativa, firma ni aprobación clínica. Las
regresiones extensas anteriores siguen teniendo 10 páginas y las de 20 000
caracteres siguen teniendo 8, sin incremento en estos casos.

## Muestras nuevas para el propietario

Todas contienen nombres y narrativas ficticios, marcados como sintéticos.

| Muestra | Archivo en `cpren120/checkpoint13/` | Páginas |
| --- | --- | --- |
| Evolución breve | `pdf/01-evolucion-breve.pdf` | 1 |
| Enfermería breve | `pdf/02-enfermeria-breve.pdf` | 1 |
| Evolución continua | `pdf/03-evolucion-dos-paginas.pdf` | 2 |
| Estrés de enfermería, párrafos/tildes/ñ/palabras largas | `pdf/04-enfermeria-estres.pdf` | 12 |

El caso de estrés tiene 19 004 caracteres. Las cuatro regresiones anteriores se
generaron aparte en `regression/`, incluidos ambos tipos con 20 000 caracteres.
Se conservan seis casos de borde en `boundaries/` y dos PDF generados mediante el
endpoint autorizado en `endpoint/`. Total técnico: **16 PDF / 65 páginas**.

## Pruebas ejecutadas en Casa

| Verificación | Resultado |
| --- | --- |
| Backend `npm test --prefix backend` | **1418 totales, 1361 aprobadas, 0 fallos, 57 opt-in omitidas** |
| Unitarias/HTTP/contexto PDF | **12 aprobadas, 0 fallos, 2 opt-in omitidas**, ejecutadas aparte en muestras |
| Chrome: muestras, bordes y regresiones PDF | **4/4**, sin omisiones |
| Endpoint/seguridad/notas, PostgreSQL temporal propio | **21/21**, sin omisiones |
| Seguimiento CPREN-119 y notas, PostgreSQL temporal | **18 aprobadas, 0 fallos, 2 recorridos UI opt-in omitidos** |
| Frontend DOM de notas y navegación | **24/24**, 2 archivos |
| Frontend ESLint y build | Aprobados |
| Python/pdfplumber/Pillow/Poppler | **16 documentos / 65 páginas** comprobados; 11 páginas renderizadas |
| `git diff --check` | Aprobado |

No se suman las suites entre sí porque se solapan. Los recorridos UI completos
ya tienen evidencia de CHECKPOINT-12 y no se presentan como ejecutados nuevamente
en este checkpoint. Se ejecutaron las regresiones DOM pertinentes sin editar el
editor. Las integraciones usan exclusivamente `initdb`, pool explícito, loopback
propio y comprobación de `SHOW data_directory`; no cargan `.env` ni aceptan una URL
de base persistente. Los clústeres se detienen y eliminan en `finally`.

Se verificó por página: carta 612 × 792 pt, fecha/hora clínica repetida una vez,
control/capturista correctos, texto completo por igualdad, acentos, saltos de
línea, ausencia de duplicaciones/recortes, logos con proporción original,
numeración, separación de firma y cierre exclusivamente en la última hoja.
Se comprueba que ninguna raya cruza cajas de glifos ni el cierre invade la
narrativa o la identificación. El endpoint mantiene permisos por tipo, pertenencia,
no-store/no-cache, rate limit y auditoría sin narrativa.

Poppler renderizó las páginas primera/última de las cuatro muestras y la
intermedia 6 del estrés; además, los límites exactos 33/66 y primera/última del
caso de 20 000. Se inspeccionaron las imágenes, no solo la generación automática.
`contact-sheet.png` permite comparar las muestras. Los logos originales mantienen
sus hashes de CHECKPOINT-12 y no se incorporan institución/teléfono de la referencia.

Durante la verificación se corrigieron la alineación del cierre al margen y la
separación medida de firma. El sandbox bloqueó el loopback HTTP (EACCES), por lo
que esas pruebas se repitieron fuera del sandbox. La nueva prueba de endpoint
necesitó un control sintético propio para no ocupar el de la prueba concurrente y
una importación explícita del servicio. Son ajustes del harness, no fallos del
producto. Avisos de Browserslist y tiempos de plugins Vite son informativos.

Reproducción desde `backend`:

```text
node scripts/validateCheckpoint13.cjs samples
node scripts/validateCheckpoint13.cjs unit
node scripts/validateCheckpoint13.cjs notes
node scripts/validateCheckpoint13.cjs tracking
```

Verificador desde la raíz con Python del runtime:
`backend/scripts/verifyCheckpoint13Pdf.py`. Usa Poppler local. Runtime comprobado:
Node 24.11.1, PostgreSQL 18.3, Chrome 155.0.8059.85. El runner está limitado a estas
suites y preparado para los binarios de Casa; toda salida va a `checkpoint13/`.

## Archivos de este checkpoint

- `backend/src/services/notaClinicaPdf.js`: referencias visuales, firma y cierre.
- `backend/src/repositories/notasClinicasRepository.js`: relación mínima del control.
- `backend/src/services/notasClinicasService.js`: contexto PDF autorizado y filtrado.
- `backend/test/notaClinicaPdf.test.js`: conserva los casos previos y separa su salida.
- `backend/test/notasClinicasService.test.js`: referencia y minimización de datos.
- `backend/test/notasClinicasPostgres.test.js`: endpoint real, referencia y contexto.
- `backend/test/notaClinicaPdfCheckpoint13.test.js` y
  `backend/test/helpers/notasPdfCheckpoint13Fixtures.js`: muestras y bordes nuevos.
- `backend/scripts/validateCheckpoint13.cjs` y `verifyCheckpoint13Pdf.py`:
  reproducción y comprobación de evidencias.
- Este documento y `docs/cpren120/checkpoint13/`: PDF, PNG, logs, manifiestos y resultados.

## Cierre

Cambios locales preservados, sin staging, commit ni push. HEAD y origin permanecen
en `375da7a`; main, CPREN-119 y los otros worktrees no se modificaron. Sin cambios
de migraciones, datos reales, AWS, despliegues, n8n o CPREN-121.

Pendientes: aprobación visual de estas cuatro muestras, decisión clínica de firma
por hoja y evaluación posterior del nombre histórico del capturista. Se detiene
la ejecución con las muestras listas; no se presume autorización de publicación.
