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

- Cargar y validar variables mediante `backend/src/config/env.js`; en desarrollo
  puede leer `backend/.env`, que nunca debe versionarse.
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

`/mensaje` exige `mensaje` como string y acepta `context` y `conversation` como
objetos seguros opcionales.
El backend aplica `trim` al mensaje, exige entre 1 y 500 caracteres y rechaza
valores ausentes, `null`, numeros, objetos, arreglos, espacios vacios y textos
que excedan el limite. Los clientes que envian unicamente `mensaje` conservan
exactamente el comportamiento anterior.

`/feedback` exige `helpful` como booleano JSON real e `intent` como string no
vacio de hasta 100 caracteres. Para mantener compatibilidad, `mensaje` y
`message` pueden llegar en el payload, pero se descartan y nunca se registran.

#### Contexto seguro de pantalla y permisos

El frontend puede adjuntar a `/mensaje` este contrato exacto y minimo:

```json
{
  "route": "/pacientes/:id/expediente",
  "module": "expediente",
  "hasPatientContext": true,
  "hasPregnancyContext": true,
  "pregnancyStatus": "activo",
  "permissions": ["pacientes.editar", "controles.crear"]
}
```

`context` es opcional, no se conserva entre turnos y se valida estrictamente.
Sus unicos campos son:

- `route`: una ruta normalizada de la lista cerrada indicada abajo. Nunca lleva
  query string ni los IDs reales de paciente, embarazo o registro.
- `module`: `dashboard`, `pacientes`, `expediente`, `reportes`, `usuarios`,
  `mapa_riesgo`, `comunidades` u `otro`.
- `hasPatientContext` y `hasPregnancyContext`: booleanos. Un embarazo solo
  puede declararse cuando existe contexto de paciente.
- `pregnancyStatus`: `activo`, `puerperio`, `cerrado` o `null`; un estado no
  nulo requiere un embarazo seleccionado.
- `permissions`: hasta 50 codigos unicos, de 3 a 80 caracteres, con formato
  `modulo.accion` en minusculas. Sirven unicamente para orientar la respuesta.

Campos adicionales dentro de `context` se rechazan con HTTP 400 y
`VALIDATION_ERROR`. En particular, nunca se envian ni aceptan nombre de
paciente, CUI, numero de expediente, telefono, diagnosticos, resultados de
laboratorio, VIH, otros datos clinicos o texto visible de formularios. El
frontend construye el objeto desde React Router, la sesion ya cargada y el
estado del embarazo ya obtenido por el expediente; no realiza una solicitud
adicional ni inspecciona controles del DOM.

El contexto personaliza explicaciones, pero no autoriza operaciones. Un
cliente puede declarar cualquier permiso en el payload y Lia podra usarlo para
orientar, pero las rutas clinicas y administrativas siguen aplicando JWT,
CSRF, roles y permisos cargados por el backend. Para explicar la gestion de
usuarios, el frontend deriva el indicador informativo `usuarios.gestionar`
cuando el rol de sesion es `admin` o `director`; este indicador tampoco
reemplaza `permitirRoles` ni otra verificacion del servidor.

El mapeo normalizado es:

| Ruta React | `route` enviado | `module` |
| --- | --- | --- |
| `/dashboard` | `/dashboard` | `dashboard` |
| `/pacientes`, `/nuevo` | la misma ruta | `pacientes` |
| `/pacientes/:id` | `/pacientes/:id/expediente` | `expediente` |
| Edicion, controles, riesgo, plan de parto, puerperio, morbilidad y vacunas bajo `/pacientes/:id/...` | patron equivalente con `:id` | `expediente` |
| `/reportes` | `/reportes` | `reportes` |
| `/usuarios` | `/usuarios` | `usuarios` |
| `/mapa-riesgo` | `/mapa-riesgo` | `mapa_riesgo` |
| `/comunidades` | `/comunidades` | `comunidades` |
| Cualquier otra ruta | `/otro` | `otro` |

Con este contexto, Lia puede resumir las secciones del expediente ya abierto;
explicar ausencia del boton de edicion por permiso o modo de solo lectura;
comprobar contexto, estado y permiso informativo antes de explicar controles o
vacunas; distinguir un embarazo ya cerrado al explicar el cierre; y aclarar
que la gestion de usuarios corresponde a administrador o director. Lia nunca
ejecuta esas acciones ni consulta datos clinicos.

El contexto se entrega solo al motor durante esa solicitud. No se agrega a
`chatbot_unrecognized.jsonl`, a feedback ni al logging de la ruta completa.
Las guardas de privacidad para VIH, datos clinicos y medicamentos se evaluan
antes de estas adaptaciones y conservan sus respuestas.

#### Memoria corta y guias paso a paso

El backend no mantiene sesiones conversacionales. El frontend conserva en
memoria React unicamente el ultimo estado seguro devuelto por `/mensaje` y lo
envia en la solicitud siguiente:

```json
{
  "conversation": {
    "lastIntent": "control_prenatal",
    "activeGuide": "control_prenatal",
    "currentStep": 2,
    "totalSteps": 7
  }
}
```

El contrato estricto de `conversation` contiene:

- `lastIntent`: ID de una de las 39 intenciones operativas o `null`.
- `activeGuide`: uno de los seis IDs de guia indicados abajo o `null`.
- `currentStep`: entero positivo o `null`. Debe existir solo con una guia
  activa y no puede exceder su cantidad real de pasos.
- `totalSteps`: opcional al iniciar, entero positivo o `null`. Cuando se envia,
  debe coincidir exactamente con el total calculado por el backend; el cliente
  no puede inventarlo.

Una guia activa exige que `lastIntent` coincida con `activeGuide`. Propiedades
adicionales, IDs desconocidos, texto libre y estados incoherentes producen HTTP
400 con `VALIDATION_ERROR`. La respuesta del backend normaliza siempre los
cuatro campos. El modulo se deriva de la intencion o guia conocida y no necesita
otro texto en memoria.

Las guias iniciales se derivan de los pasos numerados ya existentes en
`chatbotKnowledge.js`; no duplican ni reescriben las instrucciones operativas:

| Guia | Pasos | Contexto o permisos informativos |
| --- | ---: | --- |
| `registrar_paciente` | 5 | `pacientes.crear` |
| `control_prenatal` | 7 | Paciente, embarazo activo y `controles.crear` |
| `ficha_riesgo` | 7 | Paciente, embarazo no cerrado, `controles.crear` y `controles.editar` |
| `vacunas` | 7 | Paciente, embarazo no cerrado y `controles.crear` |
| `plan_parto` | 7 | Paciente, embarazo no cerrado, `controles.crear` y `controles.editar` |
| `cerrar_embarazo` | 5 | Embarazo activo o en puerperio y `pacientes.editar` |

Estos permisos solo adaptan la explicacion. Las operaciones reales siguen
protegidas por las rutas backend y Lia nunca ejecuta una accion.

El ciclo de vida es determinista:

1. `Guiame`, `acompaname` o `paso a paso` inicia una de las seis guias y muestra
   solo el primer paso.
2. `Siguiente`, `Continuar`, `Ya lo hice` y `Y despues` avanzan un paso.
   `Anterior` o `Volver` retroceden sin bajar de 1. `Repite` y `No entendi`
   conservan el paso.
3. Una duda relacionada responde con el clasificador operativo y conserva la
   guia, ofreciendo `Continuar guia`, `Repetir paso` y `Cancelar`.
4. Un cambio claro de tema cierra expresamente la guia anterior. Si el mensaje
   solicita otra guia, la sustituye y comienza en su paso 1.
5. `Cancelar`, `Dejemoslo` o `Empecemos de nuevo` limpian guia y paso, pero no
   eliminan el historial visual. Al avanzar desde el ultimo paso se finaliza la
   guia, se conserva `lastIntent` y se ofrecen de dos a cuatro acciones
   relacionadas.

Cerrar y volver a abrir el widget conserva la guia porque `Layout` sigue
montado. Cambiar `identityKey` muestra inmediatamente una memoria vacia y no
reutiliza historial, input, feedback ni solicitudes del usuario anterior.
Recargar la pagina reinicia todo el estado. No se usa base de datos, archivos,
cookies, `localStorage`, `sessionStorage` ni logging para esta memoria.

El historial visual puede seguir mostrando los mensajes de la sesion actual,
pero `conversation` nunca contiene ni reenvia preguntas o respuestas completas,
nombres, CUI, expedientes, identificadores, resultados clinicos o datos de
formularios. Solo contiene IDs cerrados y contadores. El frontend mantiene un
cerrojo de solicitud y deshabilita chips mientras Lia responde para impedir que
un doble clic avance dos pasos.

#### Sugerencias y acciones rapidas contextuales

`POST /api/chatbot/mensaje` conserva el campo legado `suggestions` y puede
agregar `quickActions`. Los clientes anteriores pueden ignorar el campo nuevo;
el widget actual prefiere acciones rapidas validas y usa `suggestions` solo
cuando la respuesta no contiene ese contrato.

Ejemplo:

```json
{
  "intent": "control_prenatal",
  "answer": "...",
  "suggestions": ["Guiame paso a paso"],
  "quickActions": [
    {
      "id": "start-control-guide",
      "label": "Guiame con el control",
      "type": "message",
      "message": "Guiame para registrar un control prenatal"
    },
    {
      "id": "open-current-record",
      "label": "Ir al expediente actual",
      "type": "navigate",
      "target": "expediente_actual"
    }
  ]
}
```

Solo existen dos tipos discriminados:

- `message`: contiene exactamente `id`, `label`, `type` y `message`. El
  frontend envia `message` mediante el flujo normal de Lia, con el mismo
  `AbortController` y cerrojo contra doble envio.
- `navigate`: contiene exactamente `id`, `label`, `type` y `target`. El
  frontend resuelve el target mediante React Router; no envia un mensaje, no
  llama al API y no cambia `conversation`.

Cada respuesta contiene como maximo cuatro acciones. Sus IDs y etiquetas son
unicos; tampoco se repiten mensajes o destinos. `label` admite de 1 a 60
caracteres. La validacion rechaza propiedades adicionales y cualquier tipo que
no sea `message` o `navigate`.

La lista cerrada de targets es:

| Target | Ruta resuelta por el frontend | Condicion informativa |
| --- | --- | --- |
| `dashboard` | `/dashboard` | Siempre segura dentro del shell autenticado |
| `pacientes` | `/pacientes` | `pacientes.ver` |
| `nueva_paciente` | `/nuevo` | `pacientes.crear` |
| `reportes` | `/reportes` | `reportes.ver` |
| `usuarios` | `/usuarios` | Capacidad funcional `usuarios.gestionar` |
| `mapa_riesgo` | `/mapa-riesgo` | `mapa_riesgo.ver` |
| `comunidades` | `/comunidades` | Capacidad funcional explicita `comunidades.gestionar` |
| `expediente_actual` | Ubicacion actual, incluido su query existente | Contexto de paciente y `pacientes.ver` |

`expediente_actual` nunca recibe una ruta o ID desde Lia. El navegador conserva
la ubicacion que ya tiene abierta; no extrae identificadores del texto de la
conversacion. No se admiten URLs arbitrarias ni acciones `submit`, `delete`,
`update`, `confirm`, `api` o `external_url`.

La generacion se centraliza en:

```text
backend/src/config/chatbotQuickActions.js
backend/src/services/chatbotQuickActionsService.js
backend/src/validations/chatbotQuickActions.schemas.js
```

El catalogo declara solo textos y targets estaticos e inmutables. El generador
recibe `{ intent, conversation, context }`, no modifica sus entradas y valida
el arreglo final antes de entregarlo al controller. La intencion prioriza
acciones relacionadas, pero las reglas de guia, estado y permisos se aplican
antes de mostrar cualquier escritura posible.

Reglas principales:

- En el primer paso de una guia se muestran `Siguiente`, `Repetir` y
  `Cancelar`; en pasos intermedios tambien `Anterior`; en el ultimo,
  `Finalizar`, `Anterior`, `Repetir` y `Cancelar`. `Finalizar` envia la frase
  reconocida `Siguiente`. Al terminar se ofrecen entre dos y cuatro acciones
  relacionadas sin reiniciar la misma guia.
- Dashboard y lista de pacientes priorizan busqueda, alta si existe
  `pacientes.crear`, reportes si existe `reportes.ver`, apertura de expediente
  y ayuda del sistema.
- Un embarazo activo puede ofrecer control, vacuna, riesgo, plan de parto o
  cierre, siempre filtrados por sus permisos informativos. En puerperio no se
  ofrece crear un control prenatal. Un embarazo cerrado solo ofrece historial,
  secciones y navegacion de lectura; no ofrece registrar, editar, agregar
  vacuna o cerrar nuevamente.
- Ante una intencion que requiere embarazo sin contexto seleccionado, Lia
  ofrece buscar una paciente, abrir su expediente y aprender a iniciar o
  seleccionar un embarazo. Ninguna accion simula la seleccion.
- Saludos usan entre dos y tres opciones del modulo actual. Agradecimientos
  conservan una accion relacionada o los controles de la guia y permiten
  terminar. Una despedida ofrece como maximo una nueva consulta.
- `solicitud_dato_clinico` nunca revela resultados: solo puede orientar al
  expediente, la busqueda o el permiso de VIH. `solicitud_consejo_clinico`
  ofrece orientacion de sistema sobre referencias y morbilidad; la respuesta
  conserva la remision a protocolos institucionales. Nunca propone
  medicamentos, dosis, diagnosticos o tratamientos.
- La ficha MSPAS ofrece como generar la ficha y, cuando corresponde, volver al
  expediente actual; no navega a reportes. Cambio de contrasena solo muestra
  instrucciones y un olvido de acceso no navega a pantallas que requieran otra
  sesion.

Los permisos de estas acciones son solo presentacion. Una accion nunca concede
acceso ni sustituye la autenticacion, CSRF o autorizacion del endpoint de
destino.

El frontend guarda las acciones solo en el estado React del historial visible.
No se escriben en cookies, storage, base de datos, JSONL ni feedback. Cada
mensaje registra una huella formada por `module`, `hasPatientContext`,
`hasPregnancyContext` y `pregnancyStatus`. Si cambia cualquiera de esos datos,
las acciones `navigate` anteriores dejan de mostrarse sin realizar solicitudes
automaticas. Una accion `message` de guia solo puede permanecer si esa misma
guia continua activa. El `key` de `ChatbotWidget` limpia historial y acciones
al cambiar de usuario.

Los botones son elementos `button` reales, se deshabilitan durante una
solicitud, admiten teclado y foco visible, envuelven etiquetas largas y nunca
exceden cuatro opciones. Las etiquetas se renderizan como texto de React, no
como HTML enviado por el backend.

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
- `backend/src/config/chatbotGuides.js` define las seis guias, deriva sus pasos
  numerados desde el catalogo y agrega modulo, requisitos informativos,
  relaciones, finalizacion y sugerencias permitidas.
- `backend/src/config/chatbotQuickActions.js` declara los dos tipos de accion,
  sus textos estaticos y la lista cerrada de destinos. El servicio
  `chatbotQuickActionsService.js` aplica contexto, permisos, estado y guia sin
  modificar el catalogo ni el motor de clasificacion.
- `backend/src/services/chatbotService.js` conserva normalizacion,
  tokenizacion, scoring, guardas sociales y clinicas, negacion limitada,
  resolucion de prioridades, calculo de FPP, humanizacion, navegacion efimera de
  guias y coordinacion de la respuesta final.

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
- El GET es exclusivamente de lectura y nunca inicializa un embarazo ni actualiza timestamps.
- Si no hay embarazo, devuelve listas clinicas vacias, objetos clinicos y campos de embarazo en `null`, y ambos indicadores en `false`.
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
2. Requiere sesion, `pacientes.editar` y token CSRF.
3. Dentro de una transaccion se bloquea la fila de la paciente con `FOR UPDATE`.
4. Se rechaza cualquier embarazo `activo` o en `puerperio`; no se cierra ninguno automaticamente.
5. Se crea un nuevo embarazo activo con numero consecutivo y se sincroniza FUR/FPP.
6. Se auditan el embarazo y la paciente dentro de la misma transaccion.
7. La fila bloqueada serializa dos POST concurrentes. El indice parcial `ux_embarazo_activo_paciente` refuerza solo el estado `activo`.

Cuando el GET devuelve un expediente sin embarazo, el frontend muestra un
estado vacio. Solo una accion explicita `Iniciar embarazo`, visible para quien
tenga `pacientes.editar`, ejecuta el POST y recarga el expediente al confirmar
la respuesta. La accion se oculta si cualquier embarazo esta `activo` o en
`puerperio`; en este ultimo caso se indica que primero debe completarse y
cerrarse el puerperio. Un fallo no debe simular un embarazo en la interfaz.

El backend responde `ACTIVE_PREGNANCY_EXISTS` para un conflicto activo y
`PUERPERIUM_PREGNANCY_EXISTS` para uno en puerperio. La base solo tiene una
unicidad parcial para `activo`; escritores ajenos a este POST podrian evadir la
regla de puerperio si no toman el mismo bloqueo de paciente. Un indice futuro
para ambos estados exige auditar antes los datos existentes y no se incorpora
en este cierre.

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

Las cuatro rutas conservan sus URLs `GET`, pero requieren sesion valida y el
permiso `pacientes.ver`. Ese permiso autoriza consultar pacientes e imprimir
el formato oficial completo. No se exige `controles.ver_vih`: el resultado de
VIH permanece en el documento por politica clinica confirmada por el CAP.

La autorizacion, la existencia de la paciente y la pertenencia de
`embarazo_id`/`control_id` se resuelven antes de iniciar cualquier generador.
Una respuesta valida aplica cabeceras privadas `no-store`, nombre de archivo
sanitizado y auditoria minima del tipo de documento, usuario, paciente y
embarazo, sin guardar el binario ni el contenido clinico.

El limite permite 20 inicios de generacion por usuario autenticado cada 5
minutos. Solo se incrementa despues de autenticacion, autorizacion, validacion
de IDs, existencia y pertenencia, inmediatamente antes de invocar el generador.
Por ello un rechazo anterior no consume; si Puppeteer, ExcelJS, Excel,
LibreOffice o el generador MSPAS ya fue invocado, el consumo se conserva aunque
la respuesta termine en error. El intento 21 devuelve `429` sin ejecutar el
generador. El limite usa memoria local, apropiada mientras el sistema opere en
una sola instancia, y no depende solo de la IP compartida del CAP. Los
auxiliares de Excel/LibreOffice se crean en el directorio temporal del sistema
con nombres aleatorios y se eliminan en `finally`.

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
| `ACCESS_TOKEN_TTL_MINUTES` | Vida del access JWT. Default `10`. |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Inactividad maxima validada por backend. Default `15`. |
| `SESSION_WARNING_MINUTES` | Momento de advertencia visual. Default `13`; menor que idle. |
| `SESSION_ABSOLUTE_HOURS` | Vida maxima inmutable de una sesion. Default `8`. |
| `SESSION_ACTIVITY_UPDATE_SECONDS` | Throttling minimo de actividad real. Default `60`. |
| `SESSION_RETENTION_DAYS` | Retencion usada solo por la limpieza manual. Default `30`. |
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
| `PDF_RATE_LIMIT_WINDOW_MS` | Ventana por usuario para PDF clinico. Default `300000`. |
| `PDF_RATE_LIMIT` | Generaciones PDF permitidas por ventana. Default `20`. |
| `PDF_EXCEL_ENGINE` | `auto`, `excel` o `libreoffice`. |
| `LIBREOFFICE_PATH` | Ruta a `soffice` cuando se usa LibreOffice. |
| `VITE_API_URL` | Base URL del API en frontend. |

`NODE_ENV`, JWT, PostgreSQL, `FRONTEND_URL`, `COOKIE_SAMESITE` y `DB_SSL`
se validan antes de montar rutas. Produccion rechaza secretos cortos o marcados
como ejemplos y exige un origen frontend HTTPS exacto, sin loopback, comodines,
credenciales, rutas, query ni fragmentos. Se permiten DNS internos e IP privadas
con HTTPS; los equipos deben confiar en el certificado y se recomienda DNS interno
en lugar de IP. Permitir una direccion privada concreta no habilita otros origenes.
Las variables `SEED_*` se validan exclusivamente al ejecutar `npm run db:seed`.

## Autenticacion revocable

`auth_sessions` es la fuente de verdad de cada sesion. El access JWT contiene
`sid`, `sub` y `jti`, usa HS256 con issuer/audience fijos y expira en 10 minutos;
no contiene rol ni permisos. El middleware verifica la firma y luego une sesion,
usuario y rol actuales. Los permisos granulares continúan consultandose en
PostgreSQL.

Antes del despliegue, `npm run db:migrate` desde `backend` aplica el schema base y
las migraciones versionadas pendientes en orden. Cada archivo queda registrado
por nombre y checksum en `schema_migrations`; `007_auth_sessions.sql` forma parte
de este flujo y no debe ejecutarse manualmente por separado.

El refresh tiene 48 bytes aleatorios, se guarda solo como SHA-256 y rota bajo
bloqueo transaccional. Reutilizar un valor anterior revoca la sesion. La cookie
refresh usa path `/api/auth`: se limita al modulo de autenticacion y permite que
`/auth/logout` cierre realmente la sesion aunque el access cookie ya haya
expirado. Refresh y `/auth/me` no actualizan actividad.

Solo `POST /auth/activity`, originado por teclado, pointer, touch o rueda real,
actualiza `last_activity_at`, como maximo una vez por minuto. A los 15 minutos la
sesion queda invalida; a las 8 horas vence aunque exista actividad. La advertencia
local de 13 minutos ayuda al usuario, pero el backend siempre decide. Cambiar la
contraseña propia o administrativa, desactivar, cambiar rol/permisos o eliminar
un usuario revoca todas sus sesiones en la misma transaccion critica.

Las pestanas se coordinan con `BroadcastChannel` sin transmitir credenciales. La
renovacion usa Web Locks en Chrome/Edge y un marcador local no sensible que solo
indica exito o fallo: una pestana que encontro el cerrojo ocupado espera y no
realiza una segunda rotacion. La UI no guarda automaticamente formularios
clinicos. Para purgar filas revocadas o expiradas antiguas, ejecutar
deliberadamente `npm run sessions:cleanup`; no hay scheduler de produccion en
este sprint.

## Checklist para cambios futuros

Antes de entregar un cambio:

1. Confirmar que el flujo respeta el embarazo seleccionado.
2. Confirmar que los historicos cerrados no permiten escrituras.
3. Confirmar permisos necesarios.
4. Confirmar auditoria en cambios de estado o datos clinicos.
5. Ejecutar al menos `npm run build` en frontend si se toco UI.
6. Ejecutar `node --check` o carga de modulos si se toco backend.
7. Actualizar docs si cambia una ruta, tabla, variable de entorno o regla clinica.
