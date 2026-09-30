# CPREN-22 / PERF-01D: límites y métricas operativas

Auditoría local en Casa sobre `main` 0549dcb700452c149754b882cabeda577f946c1f. Solo datos sintéticos. Los tiempos de esta máquina no son un SLA ni una medición del servidor.

## Inventario auditado en código

`CPU/RAM/duración` expresa riesgo relativo según tecnología y tamaño de entrada, no una medición de producción. `Sin tope` significa que no existe un tope explícito para trabajos simultáneos en el código de la aplicación.

| Operación | Ruta / servicio | Tecnología y riesgo CPU/RAM/duración | Concurrencia y protección previa | Timeout, límite y logging previos |
| --- | --- | --- | --- | --- |
| Control prenatal PDF | `GET /api/pacientes/:pacienteId/:controlId/pdf`; `pdfController`, `puppeteerBrowserManager` | HTML, Chromium; medio/alto/medio | Browser compartido, Context y Page por solicitud; sin tope ni cola | Cuota 20 PDF/5 min por usuario (fallback IP); Puppeteer 30 s por `setContent` y `pdf` según dependencia instalada; error HTTP sanitizado, auditoría de éxito; sin duración |
| Expediente MSPAS PDF | `GET /api/pacientes/:pacienteId/mspas/pdf`; `pdfController`, `fichaClinicaPrenatalPdf` | `pdf-lib`, plantilla de 4 páginas en memoria; medio/medio/bajo | Una carga y guardado por solicitud; sin tope ni cola | Misma cuota; sin deadline explícito; auditoría de éxito y error HTTP, sin duración |
| Ficha de riesgo PDF | `GET /api/pacientes/:pacienteId/riesgo/pdf`; `pdfController`, `riskPdfRenderer` | `pdf-lib`, plantilla de 1 página; medio/medio/bajo | Un documento por solicitud; sin tope ni cola | Misma cuota; sin deadline explícito; auditoría de éxito y error HTTP, sin duración |
| Plan de parto PDF | `GET /api/pacientes/:pacienteId/plan-parto/pdf`; `pdfController` | ExcelJS y Excel COM en Windows o LibreOffice en Linux; alto/alto/alto | Proceso externo y directorio temporal por solicitud; sin tope ni cola | Misma cuota; proceso 120 s, buffer stdout/stderr 10 MB, terminación de árbol al vencer y limpieza `finally`; auditoría de éxito y error HTTP, sin duración |
| PDF combinado | `GET /api/pacientes/:pacienteId/documentos/pdf`; `pdfController` | Tres lecturas concurrentes; `pdf-lib` MSPAS/riesgo + conversión del plan en paralelo, luego fusión `pdf-lib`; alto/alto/alto | Una conversión externa por solicitud, más buffers PDF simultáneos; sin tope ni cola | Misma cuota; solo el proceso externo tiene deadline de 120 s; auditoría de éxito y error HTTP, sin duración |
| Exportación PDF de reportes | `GET /api/reportes/{controles-prenatales,censo/primer-control,censo,pacientes-riesgo,proximas-a-parir,sin-control-reciente,resumen-comunidades}/pdf`; `reportesController`, `reportesService`, `reportesPdfService` | Consulta, normalización, HTML completo, Chromium; alto/alto/alto según filas | Comparte Browser con PDF de control; Context/Page por solicitud; sin tope ni cola | Puppeteer 30 s por `setContent` y `pdf`; periodos acotados a 366 días solo donde se solicitan fechas; sin límite de filas ni cuota específica; auditoría de éxito y error HTTP, sin duración |
| Exportación Excel de reportes | Las mismas rutas con `/excel`; `reportesController`, `reportesService` | Consulta, ExcelJS en memoria, serialización a respuesta; medio/alto/medio según filas | Cada solicitud crea Workbook; sin tope ni cola | Columnas validadas (cadena <=500), fechas <=366 días donde aplica; sin límite de filas ni deadline; auditoría de éxito y error HTTP, sin duración |
| Consulta JSON de reportes | Rutas base `/api/reportes/*`; `reportesController`, repositorio | Consulta y JSON completo; bajo/medio/medio según filas | Solicitudes independientes, pool `pg` sin límites adicionales versionados | Fechas <=366 días donde aplica; sin límite general de filas; error HTTP sanitizado, sin duración |
| Automatizaciones Excel | `/api/automatizaciones/v1/censo-primer-control/excel` y `/v1/tdap/xlsx`; `automatizacionesService` | ExcelJS `writeBuffer`, alto uso posible de RAM | Rutas M2M con autenticación y rate limiter propio; fuera de los controladores de reportes | Sin nueva instrumentación en CPREN-22; requiere medición separada antes de cambiar límites M2M |

Otras protecciones: Express usa `express.json({limit: JSON_BODY_LIMIT})` con valor por defecto `1mb`; no hay configuración PM2 versionada. `errorHandler` registra método, patrón de ruta, status y código seguro, sin URL completa ni query. `/api/health` devuelve estado estático y no consulta PostgreSQL. Shutdown espera cierre de servidor, Browser y pool con `Promise.allSettled`; el cierre del Browser puede coincidir con un PDF activo, riesgo operativo aún sin reproducción. No se modificó el shutdown.

En Node 24.11.1 local, el servidor HTTP sin overrides muestra `requestTimeout=300000`, `headersTimeout=60000`, `keepAliveTimeout=5000` y `timeout=0` ms. Estos valores son del runtime local, no parámetros versionados de la aplicación ni un deadline completo de generación. La dependencia Puppeteer 24.43.1 instalada usa 30 s por navegación/contenido y `Page.printToPDF` por defecto; la aplicación no define un deadline para toda la solicitud.

## Hechos medidos: resultados locales sintéticos

Ejecutar manualmente desde `backend` con `node scripts/benchmarkOperationalLimits.js report-pdf 2 80`, `node scripts/benchmarkOperationalLimits.js report-excel 200`, `node scripts/benchmarkOperationalLimits.js clinical` o `node scripts/benchmarkOperationalLimits.js clinical-combined-2`. El script no forma parte de `npm test`.

`backend/scripts/benchmarkOperationalLimits.js` ejecuta el servicio real de exportación con repositorio inyectado en memoria; no abre PostgreSQL ni HTTP. Los datos llevan marcadores `SINTETICO`; el script no guarda PDFs ni JSON instrumentales. Usa Chrome local o Excel local según escenario y cierra Browser y temporales. RSS es del proceso Node; el benchmark preexistente `benchmarkPuppeteer.js` estimó Chromium persistente en 422.95 MB con 7 procesos. La estimación de Chrome en Windows puede incluir otros Chrome y no se usa como umbral.

| Escenario | Duración de pared | Pico RSS Node | Resultado |
| --- | ---: | ---: | --- |
| Reporte PDF 80 filas, frío, 1 | 1916 ms | 89 MB | 1/1 PDF válido |
| Reporte PDF 80 filas, caliente, 2 | 1666 ms | 95 MB | 2/2 PDF válidos |
| Reporte PDF 80 filas, caliente, 3 | 2122 ms | 101 MB | 3/3 PDF válidos |
| Reporte PDF 80 filas, caliente, 5 | 2469 ms | 106 MB | 5/5 PDF válidos |
| Reporte PDF 20 / 200 / 1000 filas, frío | 2347 / 2134 / 3439 ms | 85 / 94 / 129 MB | Todos válidos |
| Reporte Excel 20 / 200 / 1000 filas | 48 / 73 / 151 ms | 86 / 99 / 128 MB | Todos serializados |
| Expediente MSPAS / ficha de riesgo, `pdf-lib` | 125-157 / 139-143 ms | 87 / 101 MB | Ambos válidos |
| Plan de parto, conversión local warm | 2518 ms | 102 MB | PDF válido; RSS no incluye Excel externo |
| Combinado, primera / warm | 8921 / 2585 ms | 122 / 111 MB | Ambos válidos; primera cifra dominada por inicio de Excel |
| Dos combinados warm simultáneos | 3511 ms | 119 MB | 2/2 válidos |

## Deducciones y riesgos operativos

El Browser se crea de forma lazy y una sola promesa evita lanzamientos duplicados. Cada trabajo Puppeteer crea Context/Page y los cierra en `finally`, también en error. Si Browser se desconecta, la siguiente solicitud puede recrearlo; un fallo de launch limpia la promesa. No hay semaphore, cola ni protección global de trabajos pendientes. Con 2, 3 o 5 solicitudes de reporte PDF se abren 2, 3 o 5 Context/Page sobre el mismo Browser. Un combinado crea además un proceso de conversión de plan por solicitud. `pdf-lib` y ExcelJS compiten por CPU/memoria del proceso Node y pueden retrasar endpoints ordinarios del mismo proceso.

La ausencia de cola permite que varias solicitudes simultáneas acumulen Context/Page, procesos externos y buffers. La dispersión entre arranque frío y caliente impide deducir capacidad garantizada del servidor de las cifras locales.

## Decisiones

| Protección | Decisión | Evidencia y consecuencia |
| --- | --- | --- |
| Métricas estructuradas y aviso lento | Necesaria; implementada | No había duración/error por operación. Una línea JSON por trabajo con nombre fijo, ms, resultado, timestamp, categoría de error y status si aplica. Warning sobre umbral y marca `degraded` tras 3 lentas consecutivas del mismo nombre por proceso. |
| Cuota clínica existente | Conservar | 20/5 min por usuario ya limita frecuencia; no demuestra por sí sola límite de simultáneas. |
| Tope de concurrencia/cola/semaphore PDF | Útil, no necesario ahora | 5 reportes concurrentes y 2 combinados sintéticos completaron sin error ni degradación fuerte. Revaluar con métricas del entorno destino. |
| Timeout total de PDF o reportes | Útil, no necesario ahora | Puppeteer y proceso externo ya tienen protecciones parciales. Un corte total nuevo podría interrumpir operaciones válidas; faltan distribuciones reales. |
| Límite de filas/tamaño de exportación | No justificado ahora | 1000 filas sintéticas completaron; cambiaría el contrato de exportación completa. |
| Rate limit nuevo, 429, circuit breaker, límite global HTTP | No justificado ahora | Sin evidencia de saturación; riesgo de bloquear operaciones legítimas. No se añadieron. |

Umbrales iniciales de **warning**, sin cortar trabajo: PDF Chromium 8000 ms (más de 2 veces el PDF de 1000 filas), `pdf-lib` 2000 ms (más de 10 veces las fichas medidas), plan/combinado 20000 ms (más de 2 veces el combinado frío), reporte PDF 8000 ms, Excel 3000 ms y consulta JSON 8000 ms. Son conservadores porque incluyen componentes no medidos localmente y deben ajustarse con observaciones del servidor antes de tratarlos como SLA. Se pueden configurar con `OP_SLOW_PDF_BROWSER_MS`, `OP_SLOW_PDF_LIB_MS`, `OP_SLOW_PDF_EXTERNAL_MS`, `OP_SLOW_REPORT_PDF_MS`, `OP_SLOW_REPORT_EXCEL_MS` y `OP_SLOW_REPORT_QUERY_MS` (enteros positivos en ms, hasta 600000). No se cambia ningún `.env` en esta fase.

Los nombres de operación están en una lista cerrada (`pdf.control`, `pdf.expediente`, `pdf.riesgo`, `pdf.plan_parto`, `pdf.combined`, `report.pdf.<tipo>`, `report.excel.<tipo>`, `report.query.<tipo>`). Cada ruta emite una métrica de la operación completa; el PDF combinado no emite métricas internas para sus componentes. El logger solo recibe estos nombres, duración, resultado, timestamp, categoría fija, status numérico y marcadores de lentitud. No recibe request, filtros, URL, IDs, mensajes de error ni contenido clínico. La racha se calcula por nombre y por proceso según el orden en que terminan las operaciones concurrentes, se acota a tres y se reinicia después de una operación rápida o fallida. Al reiniciar Node/PM2 se pierde. Es una heurística operativa local, no una alerta externa ni una métrica agregada entre instancias.

## Limitaciones

Los benchmarks usan datos sintéticos, sin base de datos, red, autenticación ni tráfico real. No producen un SLA ni p95 de producción. Las cifras dependen del calentamiento y de las cachés locales. En el combinado sintético se convierte una plantilla sin celdas clínicas rellenadas y se usan objetos ficticios mínimos; no mide el controlador con consultas y auditoría. RSS cubre Node, pero no la memoria de Excel/LibreOffice y Chromium; la estimación separada de Chrome en Windows puede incluir otros procesos. La calibración futura debe usar métricas agregadas sin PHI del servidor. Cualquier límite funcional nuevo requiere evidencia y una tarea separada.

Pendiente para una fase posterior: observar distribuciones sin PHI en el entorno destino, en particular plan/combinado frío, exportaciones con más filas y la memoria del proceso externo. Solo entonces decidir si una cola interna transparente o un deadline adicional aportan beneficio. No se propone ningún cambio de contrato en esta fase.
