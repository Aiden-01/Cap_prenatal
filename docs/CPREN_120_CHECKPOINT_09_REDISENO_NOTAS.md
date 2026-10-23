# CPREN-120 — CHECKPOINT-09: expediente, editor y guardado real

2026-10-23. Equipo Trabajo, dispositivo Aiden29. Rama:
`feature/cpren-120-editor-pdf-notas-clinicas`. HEAD inicial y final:
`b00ddf3e881abfa784e2262aceabaabef00bb465`.
Issue: https://tareajiraads.atlassian.net/browse/CPREN-120.

## Alcance y estado

El propietario no aprobó funcionalmente CHECKPOINT-08. Se rediseñó el módulo y
se comprobó el guardado real en un entorno desechable. Este checkpoint queda
local, sin staging, commit ni push, para revisión visual y funcional del propietario.
No se cierra CPREN-120; no se inició CPREN-121.

Checkout inicialmente limpio, rama y upstream correctos; `git pull --ff-only`
respondió Already up to date. Se preservó el commit anterior con sus logos y PDF.
Sin main, AWS, n8n, cambios de migraciones ni consultas a bases clínicas persistentes.

## Diagnóstico de 401/404: evidencia y límites

El propietario identificó los mensajes originales de consola:

| Solicitud | Evidencia original disponible |
| --- | --- |
| `GET http://localhost:5173/api/auth/me` | HTTP 401; no se aportó cuerpo ni código de aplicación |
| `GET http://localhost:5173/api/pacientes/9/notas-clinicas` | HTTP 404; no se aportó cuerpo ni código de aplicación |

Se inspeccionó el entorno local antes de editar:

- Vite en 5173, proceso 18704, ejecutable Vite dentro de este checkout.
- Listener 3001 en loopback, proceso 19376, `node src/index.js`; padre 13428,
  nodemon del directorio backend de este repositorio. No se encontró un segundo
  listener en ese mismo puerto. No se finalizaron procesos ni cambiaron puertos.
- `frontend/vite.config.js` conserva `/api → http://127.0.0.1:3001`.
- Axios conserva base relativa `/api`, cookies con credentials y cabecera CSRF
  en métodos de escritura. Se conservan coordinador de refresh e invalidación de sesión.
- `backend/src/index.js` monta pacientes y profesionales; pacientes monta
  `/:pacienteId/notas-clinicas`. Los contratos no se cambiaron.
- Se hicieron únicamente peticiones **sin credenciales** a auth/me y notas de
  paciente 9, directamente en 3001 y a través de 5173. Las cuatro devolvieron
  401 JSON con `AUTHENTICATION_REQUIRED`. El middleware rechaza la ausencia de
  token antes de consultar una base de datos.

**Causa comprobada del 401 reproducido:** ausencia de credencial en las peticiones
anónimas de diagnóstico. La URL original quedó identificada como auth/me.
**No verificable:** si el 401 original fue por ausencia, expiración o revocación;
el código HTTP aislado no distingue esos casos. No se leyó la sesión real del usuario.

**Causa del 404 original: No verificable** sin cuerpo de respuesta o registro de
esa petición autenticada. La prueba anónima actual no reproduce ese 404. No se
atribuye a backend antiguo, ruta faltante o paciente inexistente por conjetura.
Al cierre, el propietario aportó una verificación de Network:
`GET http://localhost:5173/api/pacientes/9/notas-clinicas?pagina=1&limite=20`,
**200 OK**, dirección remota 127.0.0.1:5173. El fallo no se reproduce en esa
consulta actual. Es evidencia del propietario, no una consulta autenticada del
agente a datos persistentes; no demuestra por sí sola la causa histórica del 404.
La ruta declarada y sus permisos se comprobaron con Express real y DB temporal.
En ese entorno, paciente inexistente devuelve 404 `PACIENTE_NO_ENCONTRADA`, una
nota ajena/inexistente usa `NOTA_NO_ENCONTRADA`, y la ruta válida permite POST 201
y GET 200. Se diferencian esos mensajes en la UI de un endpoint no disponible.

No se cambió el proxy ni se deshabilitó auth; no se inventaron respuestas exitosas
ni se ordenó reiniciar o finalizar el backend existente. Las pruebas usan puertos efímeros propios para
Express/Vite y el puerto temporal 55479 para PostgreSQL; no reemplazan el entorno
5173/3001 ni se conectan al PostgreSQL persistente en 5432.

## Cambios de interfaz

- Notas clínicas es una pestaña inmediatamente después de Controles. Orden:
  Datos generales, Controles, Notas clínicas, Laboratorios, Riesgo obstétrico,
  Plan de parto, Morbilidad, Puerperio, Vacunas. Sin embarazo se mantienen las
  pestañas; las dependientes de embarazo se deshabilitan, Notas sigue disponible.
- Se eliminó el botón aislado anterior. Estado activo con aria-current, foco
  visible, navegación por botones nativos y revelado de la pestaña activa en la
  barra horizontal. No hay cabecera clínica duplicada dentro del expediente.
- `NotasClinicas` admite modo embebido y reutiliza el mismo módulo en enlaces
  directos. Usa la paciente y embarazo seleccionados en el expediente sin una
  segunda petición de contexto. Se mantienen `/pacientes/:id/notas`, seguimiento
  y URLs con nota_id/control_id/tipo/embarazo_id.
- El módulo ya visitado se conserva montado al cambiar de pestaña, preservando
  el texto local. Un nuevo paciente remonta el módulo para separar contextos.
- Nueva nota abre un selector documental explícito; no se infiere tipo por rol.
- Historial con estado, fecha, responsable, control, ID y acciones Abrir/PDF;
  paginación discreta y vacío distinto del error. En escritorio el historial
  acompaña al editor en una columna lateral con scroll; en móvil se apila.
- Editor por secciones: Información de la atención, Profesional responsable y
  Narrativa clínica. Resumen compacto de paciente, estado, contador, mensajes
  de guardado y acciones inferiores. Se reutilizan tokens y estilos del sistema
  en claro/oscuro. Se corrigieron ancho intrínseco de selectores y título comprimido
  a 320 px, detectado durante revisión visual aunque ya no había overflow global.

## Fecha, autoría y guardado

- Fecha/hora iniciales se calculan una sola vez por captura con Intl.DateTimeFormat
  + formatToParts, zona America/Guatemala y ciclo h23. Sin toISOString en el
  cálculo. Se permiten ajustes manuales; no se reemplazan fechas de notas guardadas.
- Pruebas a 23:59/00:00 de Guatemala y cambio de año. El navegador real de la
  prueba usa Asia/Tokyo y aun así inicializa los valores de Guatemala.
- Directorio conserva filtros médico / AE / EP del servidor y excluye inactivos
  o perfiles no clínicos. La consulta usa `/api/profesionales`, no usuarios genéricos.
  Estados de carga, vacío, error con reintento y selección válida.
- Yo atendí se habilita al encontrar al usuario autenticado en el directorio
  profesional filtrado. Un digitador no adquiere atribución clínica por sus
  permisos de captura. Se mantienen las opciones directorio y externo.
- Validación visible antes de POST: fecha/hora, fecha no futura, responsable
  y datos externos completos. `noValidate` permite dar retroalimentación propia
  en el editor en vez de depender solo de mensajes nativos silenciosos.
- Se distinguen 401/403/404/409/400/422/red/servidor, manteniendo validaciones
  del backend y la seguridad global de sesión. Un cierre real de sesión puede
  redirigir al login conforme al mecanismo existente; no se persiste narrativa
  en localStorage para eludir ese cierre.
- El éxito se informa solo después de escritura confirmada y GET de recuperación.
  Se conserva el ID real en URL, se refresca historial y se evita el remontaje
  que antes borraba la confirmación en notas principales. Reintentos conservan
  UUID/cuerpo y concurrencia; errores transitorios o 409 no borran el texto.
- Se corrigió otro riesgo de duplicación: un POST confirmado seguido de GET 403
  ya no se trata como una creación fallida que deba repetirse. Se conserva el ID
  real confirmado y el siguiente intento hace solo GET. Alternativa descartada:
  eliminar la clave al recibir cualquier 4xx, porque ese 4xx puede corresponder a
  la lectura posterior y no al POST. La confirmación visual completa espera el
  detalle recuperado, pero el mensaje distingue la escritura ya confirmada.
  Regresión DOM específica: un único POST y dos lecturas ante GET 403/reintento.
- Descarga PDF compartida por historial/editor; se conservan permisos y bloqueo
  de descarga con cambios locales. Finalizadas son inmutables; finalizar captura
  no equivale a firma clínica. Sin firmas añadidas.

## Pruebas reales y evidencia

| Verificación | Resultado de esta sesión |
| --- | --- |
| Frontend completo `npm test -- --maxWorkers=2` | 191 lógicas y 294 DOM aprobadas, 0 fallos; incluye POST confirmado/GET 403 sin duplicación |
| Frontend ESLint y build | Aprobados; aviso informativo de Browserslist |
| Backend notas/HTTP/PDF/seguimiento/sesiones | 49 aprobadas, 0 fallos |
| Backend autoría y perfiles profesionales | 22 aprobadas, 0 fallos |
| Regresión Chrome CPREN-119/125 en esta sesión | Subprueba original aprobada: control, cita, confirmación, seguimiento, editor/PDF; dos anchos previos |
| PostgreSQL temporal + CHECKPOINT-09 Chrome | 19 totales: 18 aprobadas, 1 omisión de la subprueba Chrome anterior, ejecutada aparte; 0 fallos |
| Prueba de éxito obligatoria | 7 POST 201 reales → GET Express → PostgreSQL temporal → recarga UI con mismo ID y narrativa |
| Autoría real | Médico, AE y EP autenticados; médico y AE de directorio; EP externo sin embarazo; capturista y responsable distintos donde procede |
| Error real de permisos | Revocar permiso en DB temporal → POST 403, texto preservado → restaurar permiso → guardado confirmado |
| Conflicto real | PUT concurrente confirmado → PUT obsoleto 409; texto local preservado; recuperación explícita de versión guardada |
| Sesión expirada y recurso ausente | JWT sintético expirado → auth/me 401 ACCESS_TOKEN_EXPIRED; paciente inexistente → 404 PACIENTE_NO_ENCONTRADA |
| Contextos | Paciente sin embarazo; embarazo activo/cerrado/puerperio; captura finalizada; entrada por expediente y enlaces de seguimiento/directos |
| Visual | 1440, 1280, 768, 390, 320 px, claro/oscuro; sin overflow, título legible, pestaña activa visible; capturas revisadas |

Comando opt-in de integración: `RUN_SEGUIMIENTO_TEMP_POSTGRES=1`,
`SEGUIMIENTO_POSTGRES_BIN` apuntando a binarios locales y `RUN_NOTAS_09_BROWSER=1`,
seguido de `node --test test/seguimientoNotasPostgres.test.js`. La suite crea y
comprueba un data_directory propio, no carga .env, aplica esquema/migraciones
solo allí y elimina el clúster al terminar. Las sesiones y profesionales son
sintéticos; el harness recibe sesiones firmadas de esa base y valida auth/me real.

En el harness se corrigió una lectura equivocada de la respuesta auth/me: devuelve
el usuario directamente, no `{usuario}`. También se corrigieron selectores DOM
ambiguos después de agregar regiones accesibles. Son ajustes de prueba, no causas
atribuidas al incidente original. La última captura espera que terminen las
transiciones de tema para mostrar sus colores finales. La preparación de sesión
usa una página vacía del harness y evita consultas de dashboard ajenas a esta prueba.

Evidencia sin narrativa ni credenciales en `cpren120/checkpoint09/http-evidence.json`:
método, ruta y status, actores sintéticos, siete notas creadas y tamaños probados.
No se guardaron cookies, JWT, secretos ni datos clínicos reales.

Comparación visual disponible:

- Antes: `cpren120/desktop.png`, `cpren120/mobile.png` (CHECKPOINT-08 sintético).
- Después: `cpren120/checkpoint09/notas-1440-claro.png`, `notas-320-claro.png`,
  y los restantes tamaños/temas en esa carpeta.

## Archivos modificados o añadidos

- `frontend/src/pages/ExpedientePaciente.jsx`: pestaña integrada y contexto.
- `frontend/src/pages/NotasClinicas.jsx`: modo embebido, historial, creación y confirmación.
- `frontend/src/components/EditorNotaClinica.jsx`: estructura, fecha/hora, validación y feedback.
- `frontend/src/components/ResponsableNota.jsx`: directorio y habilitación clínica.
- `frontend/src/pages/seguimiento-notas.css`: diseño responsive por tokens existentes.
- `frontend/src/utils/notasClinicas.js`: Guatemala, validación y errores.
- `frontend/src/api/notasClinicas.js`: descarga compartida.
- `frontend/test/notasClinicasFecha.test.js`, `frontend/test-dom/notasClinicas.test.jsx`,
  `notasClinicasNavegacion.test.jsx`: regresiones.
- `backend/test/helpers/notasCheckpoint09Browser.js`: recorrido UI/API/DB y capturas.
- `backend/test/helpers/seguimientoNotasBrowser.js`: adaptación al selector documental nuevo.
- `backend/test/seguimientoNotasPostgres.test.js`: directorio real y escenario aislado nuevo.
- Este documento y `docs/cpren120/checkpoint09`: evidencia sintética.

## Pendientes y riesgos

1. Revisión visual y funcional del propietario; CPREN-120 no está aprobada.
2. El listado original ya devuelve 200 según Network del propietario. Si reaparece
   el 404, capturar cuerpo/código para confirmar su causa; la causa histórica sigue
   No verificable. Tampoco se certifica la causa concreta de la sesión original de auth/me.
   No se ha consultado paciente 9 de una base persistente para intentar inferirlo.
3. Validación clínica del formato y tratamiento de firma manuscrita siguen pendientes.
4. La prueba de identidad propia depende de disponibilidad del directorio: si falla,
   Yo atendí no se habilita por conjetura; se conserva validación final del servidor.

Sin cambios en backend productivo, migraciones 023–027, logos, generador PDF,
auditoría, citas o controles. Git queda con cambios locales para revisión; sin
commit/push, merge ni despliegue en esta sesión.
