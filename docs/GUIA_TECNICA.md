# Guia tecnica del proyecto CAP Prenatal

Esta guia explica como esta armado el sistema, que decisiones importantes ya existen y como mantenerlo sin romper flujos clinicos.

## Resumen ejecutivo

CAP Prenatal es una aplicacion web para administrar expedientes clinicos prenatales. El nucleo del dominio es:

1. Una paciente se registra una vez.
2. Una paciente puede tener muchos embarazos.
3. Solo debe existir un embarazo `activo` por paciente.
4. Los registros clinicos se asocian al embarazo correspondiente.
5. El expediente puede consultarse por embarazo usando `?embarazo_id=`.
6. Los embarazos cerrados son historicos y deben tratarse como solo lectura.

## Arquitectura general

```text
React/Vite
   |
   | Axios con cookies y CSRF
   v
Express API /api
   |
   | routes -> controllers -> services -> repositories
   v
PostgreSQL
```

El frontend no accede directamente a la base de datos. Toda operacion clinica pasa por el backend.

## Backend

Ruta principal:

```text
backend/src/index.js
```

Responsabilidades:

- Cargar variables de entorno desde `backend/.env`.
- Configurar Helmet, CORS, JSON body limit y CSRF.
- Montar rutas bajo `/api`.
- Exponer `/api/health`.
- Delegar errores a `middleware/errorHandler.js`.

### Capas

El backend sigue este patron:

```text
routes -> controllers -> services -> repositories
```

- `routes`: define URL, middleware de autenticacion, permisos y validacion.
- `controllers`: traduce HTTP a llamadas de servicio y arma respuestas.
- `services`: aplica reglas de negocio, normaliza datos, coordina repositorios y auditoria.
- `repositories`: concentra SQL y acceso a PostgreSQL.
- `validations`: schemas Zod por modulo.

El documento canonico del patron esta en `backend/src/ARCHITECTURE.md`.

### Seguridad backend

Autenticacion:

- Login en `POST /api/auth/login`.
- JWT firmado con `JWT_SECRET`.
- Token guardado en cookie httpOnly `cap_prenatal_token`.
- Token CSRF guardado en cookie legible `cap_prenatal_csrf`.

CSRF:

- Aplica a `POST`, `PUT`, `PATCH` y `DELETE`.
- El frontend envia `X-CSRF-Token`.
- Login queda exceptuado porque aun no hay token.

Permisos:

- Se cargan con `cargarPermisos`.
- Se validan con `verificarPermiso("codigo.permiso")`.
- Algunos endpoints administrativos usan rol `director`.

Errores:

- Usar `AppError` o `HttpError` para errores esperados.
- El `errorHandler` convierte errores Zod, PostgreSQL y de negocio en JSON uniforme.

Respuesta de error esperada:

```json
{
  "ok": false,
  "message": "Mensaje claro",
  "code": "CODIGO_ERROR"
}
```

### Chatbot Lia: privacidad y validacion

Los endpoints autenticados son `POST /api/chatbot/mensaje` y
`POST /api/chatbot/feedback`. Ambos usan schemas Zod y devuelven HTTP 400 con
el codigo estable `VALIDATION_ERROR` cuando el payload no cumple el contrato.

`/mensaje` solo acepta `mensaje` como string. El backend aplica `trim`, exige
entre 1 y 500 caracteres y rechaza valores ausentes, `null`, numeros, objetos,
arreglos, espacios vacios y textos que excedan el limite.

`/feedback` exige `helpful` como booleano JSON real e `intent` como string no
vacio de hasta 100 caracteres. Para mantener compatibilidad, `mensaje` y
`message` pueden llegar en el payload, pero se descartan y nunca se registran.

#### Alcance operativo y guardas de comportamiento

Lia orienta sobre el uso del sistema: donde encontrar pantallas, como registrar
informacion y como completar flujos existentes. No consulta expedientes por el
usuario, no revela resultados de pacientes y no toma decisiones clinicas.

Antes del clasificador de las 39 intenciones operativas se aplican guardas
deterministas en este orden:

1. Mensaje vacio.
2. Saludo breve.
3. Agradecimiento breve.
4. Despedida breve.
5. Excepciones operativas explicitas para no bloquear preguntas sobre donde
   registrar tratamiento o medicamento indicado.
6. Solicitud de datos clinicos de una paciente.
7. Solicitud de medicamento, dosis, diagnostico, tratamiento o valoracion de
   gravedad.
8. Prioridades operativas exactas para las colisiones confirmadas.
9. Clasificador operativo existente y fallback.

Las guardas sociales toleran mayusculas, acentos, puntuacion y el nombre Lia.
Solo interceptan expresiones breves. Si el mensaje contiene una solicitud
operativa, por ejemplo `Hola Lia, como registro una paciente`, continua hacia
el clasificador y conserva la respuesta util.

Las consultas sobre resultados, diagnosticos, presion, laboratorios u otros
datos de una paciente devuelven `solicitud_dato_clinico`. Lia explica que la
informacion debe revisarse dentro del expediente con los permisos
correspondientes. En solicitudes sobre VIH menciona que el acceso depende de
`controles.ver_vih`, sin afirmar que la cuenta actual posea el permiso ni
confirmar resultado alguno.

Las solicitudes de medicamentos, dosis, diagnosticos, tratamientos, gravedad o
decision de referencia devuelven `solicitud_consejo_clinico`. La respuesta no
prescribe ni diagnostica: remite al profesional responsable y a los protocolos
vigentes del MSPAS con un tono no alarmista.

La forma de la pregunta determina si es clinica u operativa. `Esta paciente
tiene VIH` intenta consultar un dato y activa la guarda de privacidad; `Donde
ingreso el resultado de VIH` pregunta como usar el sistema y continua a
`laboratorio`. Del mismo modo, `Que tratamiento le pongo` activa la guarda
clinica, mientras `Donde escribo el tratamiento` orienta a `morbilidad`.

#### Precision operativa y colisiones confirmadas

El clasificador conserva su puntuacion determinista, pero una frase completa
solo recibe la puntuacion fuerte cuando aparece con limites de palabra. Esto
evita que `bot` coincida dentro de `boton`; `bot` y `chatbot` siguen activando
`ayuda_bot`. No se agrego coincidencia difusa ni analisis linguistico general.

Despues de las guardas clinicas se aplican prioridades exactas y acotadas para
los casos confirmados por pruebas:

- Las solicitudes de imprimir, descargar o generar la ficha MSPAS usan la
  impresion del expediente y no `reportes`, que continua reservado para censos
  e indicadores. Se conserva el identificador legado
  `impresion_no_disponible` por compatibilidad con feedback y registros, aunque
  su respuesta ya describe desde antes la funcion real disponible.
- `cerrar_embarazo` es la unica intencion nueva. Se separo de
  `embarazo_activo` porque esta ultima explica como crear otra gestacion. La
  nueva respuesta diferencia pasar un embarazo activo a puerperio mediante
  `Registrar puerperio` de finalizar el seguimiento con `Cerrar embarazo`.
- El cambio voluntario desde una sesion activa usa `cambiar_password`; una
  clave que no funciona, la imposibilidad de entrar o el olvido usan
  `olvido_contrasena`. Ninguno de esos casos cae en la gestion general de
  `usuarios`.
- Si el usuario ya abrio el expediente, Lia orienta a
  `secciones_expediente`; las frases posteriores al parto priorizan
  `puerperio` sobre citas prenatales.
- Registrar una vacuna conserva `vacunas`, mientras editarla o corregir su
  dosis usa `editar_vacuna` sin depender de un empate por orden del catalogo.
- `laboratorio` conserva un solo ID. Las preguntas con `ver` o `donde estan`
  reciben pasos para consultar la pestana Laboratorios; `registrar` o
  `ingresar` mantienen los pasos de captura dentro del control prenatal. La
  guarda `solicitud_dato_clinico` continua evaluandose antes.

La negacion se trata de forma deliberadamente limitada. Solo se reconocen los
prefijos `no quiero`, `no deseo`, `no necesito` y `no voy a`, y unicamente se
descarta la accion inmediatamente relacionada en los patrones operativos
probados. Si la accion positiva identifica el modulo, por ejemplo corregir el
control o buscar la paciente, se usa esa intencion. Si solo dice `quiero
editar` sin indicar el registro, Lia reutiliza `no_reconocida` con una pregunta
de aclaracion; no supone un modulo ni crea una intencion de catalogo adicional.

#### Arquitectura del catalogo de Lia

El conocimiento estatico ya no vive dentro del motor de clasificacion:

- `backend/src/config/chatbotKnowledge.js` contiene las 39 intenciones
  operativas en orden estable. Cada entrada declara `id`, `title`, `keywords`,
  `answer` y `suggestions`. Tambien contiene las reglas de prioridad exacta y
  los patterns que distinguen la visualizacion de laboratorios.
- `backend/src/config/chatbotSpecialResponses.js` contiene aperturas, cierres,
  disclaimer, respuestas sociales, clinicas y de fallback, sugerencias
  especiales y conectores de pasos.
- `backend/src/services/chatbotService.js` conserva normalizacion,
  tokenizacion, scoring, guardas sociales y clinicas, negacion limitada,
  resolucion de prioridades, calculo de FPP, humanizacion y coordinacion de la
  respuesta final.

El catalogo y sus arreglos internos se congelan al cargar el modulo para evitar
mutaciones accidentales durante la clasificacion. `chatbotService.js` mantiene
el export legado `knowledgeBase` con la forma anterior por compatibilidad, pero
los consumidores nuevos deben importar el catalogo canonico desde
`config/chatbotKnowledge.js`.

Para agregar una intencion operativa:

1. Agrega una entrada en `chatbotKnowledge` con un `id` unico, titulo, keywords
   no vacias, respuesta y `suggestions` como arreglo, aunque quede vacio.
2. Colocala conscientemente en el orden del catalogo. El orden aun resuelve
   empates que no tengan una prioridad explicita y define las sugerencias
   iniciales y de fallback.
3. No agregues `priority` a la intencion si no existe una regla funcional. Si
   una colision confirmada requiere prioridad exacta, agrega una regla con ID,
   numero y patterns en `operationalPriorityRules` y cubrela con pruebas
   positivas y negativas.
4. Coloca textos sociales, clinicos o de fallback reutilizables en
   `chatbotSpecialResponses.js`; no los mezcles con el algoritmo de scoring.
5. Ejecuta `npm run test:chatbot` antes y despues de cambiar keywords,
   respuestas, orden o prioridades, y luego ejecuta todas las pruebas del
   backend.

La suite valida cantidad y orden exactos, IDs unicos, estructura, keywords,
respuestas, sugerencias, prioridades, snapshot estructural e inmutabilidad del
catalogo. Tambien comprueba que los consumidores productivos no necesiten
obtener el catalogo desde el servicio legado.

Ambos endpoints conservan la proteccion global CSRF y la autenticacion JWT. Una
vez autenticada la solicitud, Lia aplica rate limits independientes por usuario
(`id`, o `username`) y usa la IP como respaldo cuando no hay identidad:

- `/mensaje`: 30 solicitudes por ventana de 60 segundos.
- `/feedback`: 20 solicitudes por ventana de 60 segundos.

Los limites se ejecutan antes de validar el payload y antes del controller. Al
superarlos, la solicitud no clasifica el mensaje ni intenta registrar logging;
responde HTTP 429 mediante el manejador global con el codigo estable
`CHATBOT_RATE_LIMITED`. Se envian headers estandar `RateLimit-*` y `Retry-After`
cuando corresponde. Los dos limitadores usan contadores separados, por lo que
agotar mensajes no consume la cuota de feedback.

`CHATBOT_RATE_LIMIT_WINDOW_MS`, `CHATBOT_MESSAGE_RATE_LIMIT` y
`CHATBOT_FEEDBACK_RATE_LIMIT` permiten ajustar la ventana y las cuotas. Solo se
aceptan enteros positivos; valores ausentes, vacios, decimales, cero, negativos
o no numericos recuperan los defaults seguros de 60000 ms, 30 y 20. No existe
una configuracion que desactive los limites por defecto.

El almacenamiento de contadores es el `MemoryStore` local del proceso. En un
despliegue con varias instancias, cada proceso mantiene su propia cuota; antes
de escalar horizontalmente debe configurarse un store compartido compatible
con `express-rate-limit`.

El logging del chatbot es local, opcional y best-effort:

- Esta desactivado por defecto. Solo se activa con
  `CHATBOT_LOGGING_ENABLED=true`.
- La ruta por defecto es `backend/runtime/chatbot/`, ignorada por Git. Puede
  cambiarse con `CHATBOT_RUNTIME_DIR` para un volumen privado del despliegue.
- `chatbot_unrecognized.jsonl` registra unicamente `createdAt`,
  `messageLength`, `intent` y, si existen, `confidence` y `rulesVersion`.
- `chatbot_feedback.jsonl` registra unicamente `createdAt`, `helpful`, `intent`
  y, si existe, `classifierVersion`.
- `CHATBOT_RULES_VERSION` y `CHATBOT_CLASSIFIER_VERSION` permiten declarar las
  versiones opcionales sin modificar el clasificador ni su catalogo.
- Nunca se registran el mensaje o respuesta completos, pregunta original,
  username, userId, nombres, CUI, expediente, telefonos ni identificadores
  clinicos. Tampoco se crean hashes del texto.
- Si crear el directorio o anexar una linea falla, Lia conserva su respuesta
  normal. La consola solo recibe el tipo de evento y un codigo tecnico, nunca
  el mensaje crudo.

Retencion: estos archivos contienen telemetria temporal y no son una fuente de
auditoria. Cuando el logging se habilite, el responsable del despliegue debe
eliminarlos en un maximo de 30 dias o configurar una politica de rotacion con
ese limite. La aplicacion no realiza purga automatica en este sprint.

Los JSONL heredados estuvieron rastreados en commits anteriores. Se ignoran y
se retiran del seguimiento actual, pero sus versiones historicas continuan en
Git. Limpiar o reescribir ese historial requiere una tarea separada y
coordinada, porque afecta clones y ramas existentes.

## Frontend

Ruta principal:

```text
frontend/src/App.jsx
```

El frontend usa:

- React Router para navegacion.
- `Layout.jsx` como shell autenticado.
- `api/axios.js` para llamadas HTTP.
- `useAuth` para sesion local.
- `useToast` y `ToastContext` para notificaciones.

### Cliente HTTP

Archivo:

```text
frontend/src/api/axios.js
```

Comportamiento:

- `baseURL` usa `VITE_API_URL` o `/api`.
- `withCredentials: true` permite cookies de sesion.
- Para escrituras agrega `X-CSRF-Token` desde cookie.
- Si recibe 401, limpia usuario local y redirige a `/login`, salvo que la request use `skipAuthRedirect`.

### Rutas frontend principales

| Ruta | Vista | Uso |
| --- | --- | --- |
| `/login` | `Login.jsx` | Inicio de sesion |
| `/dashboard` | `Dashboard.jsx` | Panel principal |
| `/pacientes` | `Pacientes.jsx` | Busqueda/listado |
| `/nuevo` | `NuevaPaciente.jsx` | Crear paciente |
| `/pacientes/:id` | `ExpedientePaciente.jsx` | Expediente por embarazo |
| `/pacientes/:id/editar` | `NuevaPaciente.jsx` | Editar paciente |
| `/pacientes/:id/controles/nuevo` | `NuevoControl.jsx` | Crear control prenatal |
| `/pacientes/:id/riesgo` | `FichaRiesgo.jsx` | Ficha de riesgo |
| `/pacientes/:id/plan-parto` | `PlanPartoForm.jsx` | Plan de parto |
| `/pacientes/:id/puerperio/nuevo` | `PuerperioForm.jsx` | Puerperio |
| `/pacientes/:id/morbilidad/nuevo` | `MorbilidadForm.jsx` | Morbilidad |
| `/pacientes/:id/vacunas/nuevo` | `VacunaForm.jsx` | Vacunas |
| `/reportes` | `Reportes.jsx` | Reportes |
| `/mapa-riesgo` | `MapaRiesgo.jsx` | Mapa de riesgo |
| `/usuarios` | `Usuarios.jsx` | Administracion, solo director |

## Flujo de expediente y embarazo

El expediente se carga desde:

```text
GET /api/pacientes/:id/expediente
GET /api/pacientes/:id/expediente?embarazo_id=:embarazoId
```

Reglas:

- Sin `embarazo_id`, el backend selecciona el embarazo visible preferente: activo, luego puerperio, luego cerrado mas reciente.
- Con `embarazo_id`, el backend valida que el embarazo exista y pertenezca a la paciente.
- La respuesta incluye `embarazo_seleccionado`, `embarazo_actual`, `embarazo_activo`, `is_read_only` e `is_embarazo_actual`.
- El frontend debe comparar IDs como string porque la URL siempre entrega strings.
- Si el usuario selecciona el mismo embarazo, no debe limpiar estado ni recargar.
- Si selecciona otro embarazo, se actualiza `?embarazo_id=` y se recarga el expediente.
- Las escrituras clinicas asociadas a embarazo deben enviar `embarazo_id`; el backend lo exige con `requerirEmbarazoId` para controles, riesgo, plan de parto, puerperio, vacunas, morbilidad y cambios de estado del embarazo.

Estados de embarazo:

| Estado | Significado | Edicion |
| --- | --- | --- |
| `activo` | Embarazo en seguimiento prenatal | Editable |
| `puerperio` | Seguimiento posterior al parto o cierre prenatal | Editable para puerperio |
| `cerrado` | Historico | Solo lectura |

## Flujos clinicos principales

### Crear paciente

1. Frontend envia datos generales a `POST /api/pacientes`.
2. Backend normaliza fechas, edad, FUR/FPP y campos booleanos.
3. Se crea paciente.
4. Se crea embarazo inicial activo con FUR/FPP.
5. Se auditan paciente y embarazo.

### Actualizar paciente

1. Frontend envia `PUT /api/pacientes/:id`.
2. Backend filtra campos sensibles segun permisos.
3. Se actualizan campos permitidos.
4. Si cambia FUR/FPP, se sincronizan fechas del embarazo activo.
5. Se audita el cambio.

### Nuevo embarazo

1. `POST /api/pacientes/:id/embarazos`.
2. Se cierran embarazos en seguimiento.
3. Se valida que no quede otro embarazo activo.
4. Se crea un nuevo embarazo activo con numero consecutivo.
5. Se sincroniza FUR/FPP en paciente.
6. Se audita cierre anterior, nuevo embarazo y paciente actualizado.

### Pasar a puerperio

1. `POST /api/pacientes/:id/embarazo/puerperio?embarazo_id=:id`.
2. Requiere embarazo activo.
3. Cambia estado a `puerperio`.
4. Registra fecha de parto/cierre si aplica.
5. Audita cambio de estado.

### Cerrar embarazo

1. `POST /api/pacientes/:id/embarazo/cerrar?embarazo_id=:id`.
2. Requiere embarazo activo o puerperio.
3. Cambia estado a `cerrado`.
4. El expediente queda historico/solo lectura.
5. Audita cambio de estado.

### Vacunas y antecedentes

Las vacunas propias del embarazo seleccionado se leen desde:

```text
GET /api/pacientes/:pacienteId/vacunas?embarazo_id=:id
```

Los antecedentes de vacunacion se leen desde:

```text
GET /api/pacientes/:pacienteId/vacunas/antecedentes?excluir_embarazo_id=:id
```

Reglas:

- Las vacunas del embarazo seleccionado son editables solo si el embarazo esta `activo` o `puerperio`.
- Las vacunas de otros embarazos se muestran como antecedentes.
- Una vacuna sin `embarazo_id` se considera antecedente de solo lectura.
- Para crear, actualizar o eliminar vacunas, `embarazo_id` es obligatorio.

## PDF y reportes

PDF institucionales:

- Ficha MSPAS prenatal.
- Ficha de riesgo obstetrico.
- Plan de parto.
- Control prenatal individual.

La pagina 3 de la ficha MSPAS prenatal se completa con `pdf-lib` sobre la plantilla oficial:

- Las cinco columnas de suplementacion corresponden, sin consolidar ni sumar, a los controles prenatales 1 a 5. Se imprimen sulfato ferroso, numero de tabletas, acido folico, numero de tabletas, hallazgos y tratamiento.
- La morbilidad se filtra por el embarazo seleccionado, se ordena por fecha, hora e identificador y admite los dos primeros eventos cronologicos. Los eventos adicionales no se imprimen.
- El segundo bloque oficial no incluye casillas repetidas para fecha, hora ni motivo de consulta; esos tres datos solo pueden mostrarse para el primer evento. Los demas campos se imprimen en ambos bloques.
- Para la persona que atiende se usa `nombre_cargo_atiende`; si esta vacio, se utiliza el nombre real del usuario asociado mediante `registrado_por`. Si ninguno esta disponible, el espacio queda vacio.
- Los textos extensos reducen su fuente hasta un minimo legible y luego se recortan con puntos suspensivos dentro de la casilla.

La generacion usa una mezcla de:

- Assets oficiales en `backend/src/assets`.
- Coordenadas en `backend/src/config`.
- `pdf-lib`.
- Puppeteer.
- Excel/LibreOffice para ciertos flujos de formatos.

En Docker/Linux se recomienda:

```env
PDF_EXCEL_ENGINE=libreoffice
LIBREOFFICE_PATH=/usr/bin/soffice
```

En Windows con Excel instalado se puede usar:

```env
PDF_EXCEL_ENGINE=excel
```

## Automatizaciones y n8n

El backend expone endpoints de automatizacion bajo:

```text
/api/automatizaciones
```

El endpoint actual relevante:

```text
GET /api/automatizaciones/proximas-citas?dias=1
```

Requiere header:

```text
X-CAP-Prenatal-Secret: <AUTOMATION_SECRET>
```

En codigo el header se lee como `x-cap-prenatal-secret`.

Mas detalle operativo en `docs/N8N.md`.

## Laboratorios

Los resultados de laboratorio pertenecen a cada control prenatal y `controles_prenatales` es su unico modelo canonico. No existe un endpoint independiente de laboratorio: la captura se realiza desde el formulario de controles y la consulta desde los controles y el expediente de la paciente.

Los resultados sensibles de VIH conservan el filtrado y los permisos vigentes, incluido `controles.ver_vih` para su visualizacion.

## Pendientes y fuera de alcance

Fuera de alcance actual:

- Multitenancy para varios centros de salud.
- Diagnostico o seguimiento confirmado de VIH; el sistema solo registra tamizaje segun flujo prenatal.
- Gestion externa completa de n8n; el proyecto documenta la integracion y el endpoint, pero los workflows se administran aparte.
- Distribucion comercial del sistema.

## Convenciones de desarrollo

- Mantener cambios de backend en la capa correcta.
- No poner SQL nuevo en controllers.
- No duplicar reglas de embarazo en frontend; el backend es la fuente de verdad.
- En frontend, preservar `embarazo_id` al navegar hacia formularios clinicos.
- Comparar IDs de URL como string.
- Para escrituras clinicas, registrar auditoria.
- La auditoria es hibrida: algunos modulos usan `services/auditService.js` y otros utilidades compatibles en `utils/auditoria.js`; ambos caminos escriben en `auditoria_eventos`.
- No guardar tokens, contrasenas ni secretos en logs o auditoria.
- Usar Zod para nuevos endpoints.
- Preferir mensajes de error claros para el personal de salud.

## Variables de entorno importantes

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexion PostgreSQL completa. Alternativa a `DB_*`. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexion PostgreSQL por partes. |
| `DB_SSL` | Activa SSL para base de datos. |
| `DB_SSL_REJECT_UNAUTHORIZED` | Controla validacion de certificado SSL. |
| `JWT_SECRET` | Firma de JWT. Obligatoria. |
| `JWT_EXPIRES_IN` | Duracion de sesion. Default `8h`. |
| `PORT` | Puerto backend. Default `3001`. |
| `FRONTEND_URL` | Origenes permitidos por CORS, separados por coma. |
| `COOKIE_SAMESITE` | Politica SameSite de cookies. Default `lax`. |
| `JSON_BODY_LIMIT` | Limite del body JSON. Default `1mb`. |
| `CHATBOT_LOGGING_ENABLED` | Activa metadata JSONL de Lia solo con `true`. Default desactivado. |
| `CHATBOT_RUNTIME_DIR` | Directorio privado de runtime de Lia. Default `backend/runtime/chatbot/`. |
| `CHATBOT_RULES_VERSION` | Version opcional de reglas incluida en eventos no reconocidos. |
| `CHATBOT_CLASSIFIER_VERSION` | Version opcional incluida en feedback. |
| `CHATBOT_RATE_LIMIT_WINDOW_MS` | Ventana de rate limit de Lia en ms. Default `60000`. |
| `CHATBOT_MESSAGE_RATE_LIMIT` | Solicitudes de `/mensaje` por ventana y usuario/IP. Default `30`. |
| `CHATBOT_FEEDBACK_RATE_LIMIT` | Solicitudes de `/feedback` por ventana y usuario/IP. Default `20`. |
| `AUTOMATION_SECRET` | Secreto para endpoints n8n. |
| `PDF_EXCEL_ENGINE` | `auto`, `excel` o `libreoffice`. |
| `LIBREOFFICE_PATH` | Ruta a `soffice` cuando se usa LibreOffice. |
| `VITE_API_URL` | Base URL del API en frontend. |

## Checklist para cambios futuros

Antes de entregar un cambio:

1. Confirmar que el flujo respeta el embarazo seleccionado.
2. Confirmar que los historicos cerrados no permiten escrituras.
3. Confirmar permisos necesarios.
4. Confirmar auditoria en cambios de estado o datos clinicos.
5. Ejecutar al menos `npm run build` en frontend si se toco UI.
6. Ejecutar `node --check` o carga de modulos si se toco backend.
7. Actualizar docs si cambia una ruta, tabla, variable de entorno o regla clinica.
