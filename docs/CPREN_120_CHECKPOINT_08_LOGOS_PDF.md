# CPREN-120 — CHECKPOINT-08: logos y PDF institucional

2026-10-23. Trabajo / Aiden29. Issue:
https://tareajiraads.atlassian.net/browse/CPREN-120.
Jerarquía conservada: CPREN-120 → CPREN-12 → CPREN-3.

## Estado y autorización

El usuario autorizó incorporar los originales de Descargas y publicar imágenes,
editor y generador PDF únicamente en la rama de desarrollo. Rama:
`feature/cpren-120-editor-pdf-notas-clinicas`; base:
`0be423033f4928f3e2a7409b5541dc5976fbc3cd` de CPREN-119, con CPREN-125 conservado.
Al retomar había cambios locales de CHECKPOINT-07; se preservaron y no se hizo pull.
La consulta remota previa confirmó que la rama aún no existía en origin.
Los identificadores reales del commit y resultado del push se registran en Jira
una vez ejecutados; consultar también `git log -1` y el upstream de esta rama.

Sin merge a main, despliegue, AWS, n8n ni PostgreSQL persistente. CPREN-121 no iniciado.

## Logos aportados

Los nombres exactos indicados inicialmente no existían. La búsqueda acotada de
archivos relacionados encontró `Logo Ministerio.png` y `Logo DDRISS.png` en
Descargas. La inspección visual confirmó el encabezado Gobierno de Guatemala/MSPAS
y el emblema de DDRISS Petén Área Sur Oriente descritos por el usuario.

Se copiaron sin transformación a `backend/src/assets/institucional`:

| Recurso | Dimensiones y modo original | SHA-256 |
| --- | --- | --- |
| gobierno-guatemala-mspas.png | 421 × 151 px, RGBA | BE807EA1E1CBD1109975ED5D04F7A5C9BBA0A3D70B36A78ED7C553B962E85425 |
| ddriss-peten-area-sur-oriente.png | 158 × 151 px, RGBA | A15796E379264A52C8C6EAB68743EB28DF1B83EDE31D559AEF910744E5CA5EF8 |

Hashes de originales y copias idénticos, comprobados otra vez al terminar.
Se conservan resolución, transparencia, proporciones y colores; no se modificaron
ni eliminaron los originales. Sin internet, recortes ni iconos sustitutos.
La procedencia es el aporte del usuario, sin certificación externa de vigencia.

## Implementación y decisiones

Se conserva el editor compartido de CHECKPOINT-07: autoría interna/externa,
capturista separado, borradores, finalización, lectura, historial paginado,
principal recuperada sin duplicados, versionado e idempotencia.

Se añadió la representación PDF independiente de la nota en
`GET /api/pacientes/:pacienteId/notas-clinicas/:notaId/pdf`. No existía un endpoint
equivalente: se amplió el router de notas, sin duplicar altas, edición, lectura
JSON o finalización. No se añadieron permisos ni migraciones.

- `obtenerNotaParaPdf` reutiliza el contexto clínico existente: sesión actual,
  `pacientes.ver`, permiso `ver` del tipo almacenado y pertenencia a paciente.
  Solo consulta identidad mínima de paciente y el snapshot de autoría de la nota.
- Controlador independiente con cuota PDF existente, respuesta privada/no-store,
  Pragma no-cache, nosniff, nombre con ID sin datos de paciente y auditoría privada
  obligatoria. La auditoría contiene tipo/formato/resultado, sin narrativa ni nombres.
- Puppeteer compartido con contexto aislado por operación; JavaScript deshabilitado,
  CSP sin conexiones y peticiones restringidas a data URI. HTML clínico escapado,
  PNG incrustados desde archivos fijos del servidor. Sin archivos clínicos temporales.
- Carta vertical 612 × 792 pt. Encabezado repetido con ambos logos, CAP El Chal y
  DDRISS Petén / Área Sur Oriente. Color original de logos; tipografía y cuerpo
  negros, bordes grises, sin depender de fondos de color para comprender el texto.
- Tamaños proporcionales mediante `height:auto`, sin recortes. Márgenes reservados
  para encabezado/pie; narrativa pre-wrap, corte de palabras extensas, paginación
  automática y pie Página X de Y. Se incluye estado borrador/finalizado y se
  explicita que la finalización administrativa no equivale a firma clínica.
- Descarga en editor para documentos guardados, tanto borrador como finalizado,
  con permiso de lectura. Cambios sin guardar bloquean la descarga para evitar
  confundir texto local con la versión almacenada. Maneja errores y revoca blob URL.

La decisión clínica de firmas sigue pendiente. No se añadió bloque de firma
manuscrita hasta validarlo, ni firmas electrónicas, simuladas o estado firmado.
No se tocaron los PDFs oficiales MSPAS ni el flujo Todo en uno.

## Archivos adicionales a CHECKPOINT-07

- `backend/src/assets/institucional`: ambos PNG originales y README de procedencia.
- `backend/src/services/notaClinicaPdf.js`: plantilla y render seguro.
- `backend/src/controllers/notasClinicasPdfController.js`: autorización delegada,
  cuota, generación, auditoría y respuesta.
- `backend/src/routes/notasClinicas.js`, `services/notasClinicasService.js`,
  `repositories/notasClinicasRepository.js`: acceso a representación PDF.
- `backend/test/notaClinicaPdf.test.js`, `notaClinicaPdfHttp.test.js`: render y HTTP.
- `backend/test/notasClinicasService.test.js`, `notasClinicasPostgres.test.js`:
  permisos del tipo almacenado, pertenencia, datos mínimos y PDF real con DB efímera.
- `backend/test/helpers/seguimientoNotasBrowser.js`, `seguimientoNotasPostgres.test.js`:
  descarga real desde editor médico, AE y EP, con cierre del navegador de PDF.
- `frontend/src/components/EditorNotaClinica.jsx`, `frontend/test-dom/notasClinicas.test.jsx`:
  descarga, bloqueo por cambios locales, permiso y errores.
- `backend/test/pacienteEmbarazoPostgres.test.js`: comparación SQL portable CRLF/LF.
- `backend/scripts/verifyNotaClinicaPdf.py`: QA geométrica y texto completo de muestras.
- `docs/cpren120/pdf-validation.json`, `pdf-contact-sheet.png`: evidencia sintética.
- `docs/cpren120/desktop.png`, `mobile.png`: capturas renovadas con botón PDF.
- `output/pdf/cpren120-nota_evolucion-sintetica.pdf` y
  `cpren120-nota_enfermeria-sintetica.pdf`: muestras sintéticas de revisión.

## Pruebas ejecutadas

| Comprobación | Resultado de esta continuación |
| --- | --- |
| Frontend completo `npm test -- --maxWorkers=2` | 189 lógicas + 287 DOM aprobadas, 0 fallos |
| Frontend lint y build | Aprobados; aviso informativo de Browserslist desactualizado |
| Backend completo `npm test` | 1407 pruebas: 1352 aprobadas, 0 fallos, 55 omisiones opt-in |
| Servicio de notas + HTTP notas/PDF | 16 aprobadas, 0 fallos |
| Render PDF real `RUN_NOTA_PDF_BROWSER=1 node --test test/notaClinicaPdf.test.js` | 2 aprobadas, 0 fallos; dos documentos de nueve páginas carta |
| CPREN-118/120 PostgreSQL temporal propio 55478 | 21 aprobadas, 0 fallos ni omisiones; PDF real, autoría interna, lectura por tipo, no-cache, auditoría sin narrativa |
| CPREN-119/120 PostgreSQL temporal propio 55479 + Chrome | 18 aprobadas, 0 fallos ni omisiones; médico asociado, AE/EP independientes, guardar/GET/finalizar/recargar/descargar a 1440/390/320 px, sin overflow |
| QA PDF con pdfplumber/Pillow y render Poppler | 18 páginas revisadas: carta, ambos logos por página, proporciones, narrativa íntegra, tildes/ñ, palabras largas, límites y separación de encabezado/pie |
| Comparación de integridad SQL portable tras ajuste | 1 aprobada, 3 integraciones históricas omitidas por no habilitar destinos configurables |

La primera ejecución global del backend falló por una comparación byte a byte:
`schema.sql` local tenía CRLF y la migración 021 LF. Los blobs de HEAD coincidían;
ambos archivos coincidían con Git al ignorar EOL. Se confirmó el diagnóstico
normalizando temporalmente solo la copia local del esquema, con diff SQL vacío,
y la suite global aprobó. Después se restauraron los EOL originales del esquema
y se hizo portable únicamente la aserción de prueba; esa prueba aprobó otra vez.
No existe cambio SQL versionado ni se ejecutó una migración persistente.

Se usaron exclusivamente datos sintéticos, .env deshabilitado en integraciones,
clústeres propios con comprobación de data_directory y borrado por sus suites.
Las omisiones son suites opt-in que no fueron habilitadas en el comando global;
las integraciones de notas y seguimiento sí se ejecutaron aparte sin omisiones.

QA reproducible: generar muestras con el test opt-in, renderizar con `pdftoppm`
a `tmp/pdfs/cpren120/{medica,enfermeria}-N.png` y ejecutar el script Python con
pdfplumber y Pillow. Las muestras no contienen datos clínicos reales.

## Pendientes y cierre

Listo para revisión del editor y PDF en la rama de desarrollo. Validación clínica
final del formato y tratamiento de firma manuscrita pendiente; Jira queda En revisión.
El bloqueo técnico de logos queda resuelto. No se afirma validación clínica o firma.
El commit/push autorizado se verifica con el SHA y upstream registrados en Jira;
no se fusiona ni despliega a producción.
