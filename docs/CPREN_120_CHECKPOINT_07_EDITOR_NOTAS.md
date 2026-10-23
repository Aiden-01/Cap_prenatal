# CPREN-120 — CHECKPOINT-07: editor compartido y bloqueo del PDF

> Registro histórico del primer cierre local. El bloqueo de logos se resolvió
> posteriormente y se implementó el PDF; estado vigente, autorización de publicación
> y pruebas en [CHECKPOINT-08](CPREN_120_CHECKPOINT_08_LOGOS_PDF.md).

Fecha: 2026-10-23. Equipo: Trabajo; dispositivo: Aiden29.
Issue: https://tareajiraads.atlassian.net/browse/CPREN-120.
Jerarquía comprobada: CPREN-120 → CPREN-12 → Epic CPREN-3.

## Preparación y alcance

Checkout inicialmente limpio en `feature/cpren-119-seguimiento-notas-controles`,
HEAD `0be423033f4928f3e2a7409b5541dc5976fbc3cd`, upstream homónimo de origin.
`git pull --ff-only`: Already up to date. Se creó la rama solicitada
`feature/cpren-120-editor-pdf-notas-clinicas` desde ese HEAD.
La rama nueva no tiene upstream, pues no se publicó.
El historial contiene `d5fae67`, merge de CPREN-125 `31d9f98`, `da8f250` y
`bbd0bed`. No se usó main como base. No hay commit ni push de esta sesión.

## Contratos auditados y decisiones

- CPREN-118: router montado en `/api/pacientes/:pacienteId/notas-clinicas`.
  GET listado paginado y GET detalle; POST borrador con UUID de idempotencia;
  PUT con versión; POST `/:notaId/finalizar` con versión. Las mutaciones devuelven
  metadatos, por lo que el editor recupera el detalle después de guardar.
  Se reutilizan servicio, repositorio y esquemas estrictos: 20000 caracteres,
  fecha civil, hora, responsable, contexto opcional y unicidad de principal.
- CPREN-115–117: responsable autenticado, usuario del directorio o externo;
  medicina, AE y EP explícitos. `/profesionales` filtra por clasificación y
  permite precisar búsquedas cuando hay más resultados. Se conserva el snapshot
  histórico salvo cambio explícito. Capturista y responsable se muestran aparte.
- Permisos por tipo: `ver`, `registrar`, `finalizar_captura`, además de acceso al
  expediente. El rol no selecciona automáticamente el tipo de nota. El servidor
  conserva la autoridad sobre clasificación, permisos y embarazo editable.
- CPREN-119: seguimiento y estado documental siguen derivados de las notas.
  Desde seguimiento se abre el editor del tipo elegido y se busca la principal
  en todas las páginas antes de permitir crear. La confirmación posterior al
  control conserva su acceso existente al seguimiento. No se altera control/cita.
- Historial propio accesible desde expediente aun sin embarazo; muestra notas de
  todos los embarazos, notas independientes y estados, con paginación.
  El editor usa el embarazo seleccionado para nuevas notas; si no existe admite
  nota independiente sin embarazo, conforme al backend.
- Concurrencia: 409 conserva texto local y bloquea sobrescritura hasta recuperar
  explícitamente la versión guardada. Un POST con resultado incierto conserva
  UUID y cuerpo exacto; se reintenta sin duplicar. Cambios posteriores permanecen
  locales para un siguiente PUT versionado. Un error HTTP definitivo permite
  corregir el cuerpo; 409 requiere revisión. Doble envío bloqueado sincrónicamente.
- Finalizar requiere documento guardado sin cambios locales, fecha, hora y
  narrativa. Solo finaliza captura; no representa firma clínica. El permiso de
  finalizar no implica permiso de editar. Documentos finalizados son de lectura.
- Narrativa renderizada como valor de textarea, sin HTML interpretable, sin
  localStorage ni telemetría adicional. Se conserva Axios/CSRF y no-store del API.
  No se añadieron endpoints, permisos, modelos, migraciones ni auditoría sensible.

## PDF: bloqueo explícito

La búsqueda de recursos disponibles encontró formularios completos en
`backend/src/assets/mspas`, `backend/src/assets/official_forms` y fondos en
`backend/src/templates`; iconos de app y recursos gráficos frontend no equivalen
a los dos logos institucionales. No se localizaron archivos independientes
oficiales del Gobierno de Guatemala y MSPAS con procedencia verificable.

Por instrucción expresa se pospone la implementación del PDF. No se sustituyeron
logos, no se recortaron formularios oficiales y no se añadió descarga parcial.
La UI informa el requisito pendiente. No se modificaron PDFs MSPAS ni Todo en uno.

Se revisaron `pdf.js`, `pdfController`, `pdfService`, `pdfRateLimit`,
`pdfResponse`, `pdfTemp` y el administrador Puppeteer como dependencias para la
siguiente etapa. La futura ruta independiente deberá mantener autorización por
tipo, no-cache, rate limit, generación sin recursos remotos y limpieza segura.
Debe producir carta vertical con CAP El Chal / DDRISS Petén Área Sur Oriente,
ambos logos reales, narrativa íntegra, tildes, saltos y paginación automática.

Propuesta pendiente de validación clínica: reservar un bloque discreto para firma
manuscrita al final, desplazándolo a otra página cuando falte espacio. No añadir
firma electrónica, firma simulada ni estado firmado. No se implementó ese bloque.
PDF multipágina, impresión B/N y ausencia de recortes: **no verificables en este
checkpoint**, porque todavía no hay generador de notas autorizado sin los logos.

## Archivos

- `frontend/src/components/EditorNotaClinica.jsx`: editor único, lectura y API.
- `frontend/src/components/ResponsableNota.jsx`: selección de responsable.
- `frontend/src/pages/NotasClinicas.jsx`: contexto, historial y principal.
- `frontend/src/App.jsx`: ruta lazy con permiso existente.
- `frontend/src/pages/ExpedientePaciente.jsx`: entrada al historial.
- `frontend/src/pages/SeguimientoNotasControl.jsx`: entrada por tipo desde control.
- `frontend/src/pages/seguimiento-notas.css`: narrativa y disposición responsive.
- `frontend/test-dom/notasClinicas.test.jsx`: autoría, API, versión y errores.
- `frontend/test-dom/notasClinicasNavegacion.test.jsx`: historial y principal paginada.
- `backend/test/helpers/seguimientoNotasBrowser.js`: recorrido del editor con API
  real y PostgreSQL desechable, además de regresiones del seguimiento.
- `backend/test/seguimientoNotasPostgres.test.js`: espera tres notas creadas por
  acciones explícitas en el recorrido ampliado, en lugar de la navegación sin alta.
- `docs/cpren120/desktop.png` y `mobile.png`: capturas sintéticas inspeccionadas;
  tomadas antes de cambiar la etiqueta del shell de Nuevo a Historial.

## Validación

| Comprobación de esta sesión | Resultado |
| --- | --- |
| Frontend completo `npm test -- --maxWorkers=2` | 189 lógicas + 284 DOM aprobadas, 0 fallos |
| Editor/navegación después del último ajuste de errores | 14 DOM aprobadas, 0 fallos; incluye nueva regresión de recuperación del contexto |
| Backend pertinente: servicios/HTTP de notas y seguimiento | 15 aprobadas, 0 fallos |
| CPREN-118 PostgreSQL temporal, puerto 55478 | 20 aprobadas, 0 fallos ni omisiones |
| CPREN-119/120 PostgreSQL temporal + Chrome, puerto 55479 | 18 aprobadas, 0 fallos ni omisiones |
| Chrome real del editor | Médico asociado y AE/EP independientes, 1440/390/320 px, guardar/GET/finalizar/recargar, texto extenso con acentos, sin overflow |
| Regresiones CPREN-119/125 | Confirmación de control, seguimiento, abandono, recarga, citas intactas; DOM y recorrido real conservados |
| Frontend lint y build | Aprobados; advertencia informativa de Browserslist desactualizado |
| Integridad Git | `git diff --check` aprobado; sin staging, commit ni push |

Al cierre no se detectaron listeners en los puertos temporales 55478 y 55479.

La prueba de Chrome verificó por SQL exactamente tres notas nuevas; recuperar
la principal no duplica documentos. La inspección visual de capturas de 1440 y
320 px confirmó texto y controles legibles. Después se corrigió el manejo de
errores de contexto para que no desaparezcan cuando carga el historial y para
que Reintentar consulte también el expediente; se añadió una regresión DOM.

Primeros intentos: sandbox impidió loopback (EACCES) y archivos temporales de
Vitest (ENOENT). Fuera del sandbox aparecieron dos timeouts por saturación y dos
aserciones nuevas incorrectas sobre `disabled` heredado del fieldset. Se ajustó
la aserción a `:disabled` y se limitó Vitest a dos workers. La prueba inicial de
Chrome detectó un setter de fecha incorrecto en el propio test y un warning de
React por prop key dentro de un spread; ambos se corrigieron. El recorrido
ampliado pasó todos los pasos pero falló la antigua aserción SQL de cero notas
nuevas: se actualizó a tres altas explícitas y la suite completa aprobó.
Se corrigió también
la URL del cliente tras verificar el montaje real `notas-clinicas`.

Resultados históricos de CHECKPOINT-06 se conservan en su documento; no se
atribuyen a esta sesión. Solo se usan datos sintéticos y clústeres propios en
loopback, con verificación de data_directory y .env deshabilitado.

## Revisión y pendientes

Trabajo local para revisión. Sin merge, despliegue, AWS, n8n o base persistente.
CPREN-121 no iniciado. Pendientes: aportar/verificar ambos logos, implementar y
validar PDF, validar propuesta de firma manuscrita y revisión funcional clínica.
No considerar CPREN-120 finalizada mientras falte el PDF y esa validación.
