# CPREN-63 — Ayuda contextual de Lía

## Auditoría antes de implementar

HEAD inicial: `a0c6af764ae1d132bf5ca25a98aae71817f24953`, Casa, árbol limpio y alineado con `origin/main`.
Clasificación **A, con cobertura parcial B/E**: el tuneo anterior está integrado
(contexto operativo, ayuda por campo, guías y acciones rápidas). No hay evidencia
de pérdida C ni de fallo D para ruta/formulario/foco. Faltaba identificar la
categoría de vacuna seleccionada. La frase «que debo colocar aca?» se reprodujo
como `no_reconocida`: no pertenecía al conjunto exacto de frases deícticas.
Una frase reconocida sin foco tampoco explicaba el formulario conocido.

Lía usa reglas y catálogos locales; **no hay proveedor/modelo externo ni prompts
generativos**. El conocimiento, las guías y las respuestas especiales son código
versionado. El historial visible vive en React y se separa por identidad de sesión;
el backend recibe solo memoria de intenciones/guías/pasos, no el historial completo.

## Contexto y privacidad

Se conservan ruta normalizada con `:id`, módulo, sección, formulario, pestaña,
ID de campo enfocado, presencia de paciente/embarazo, estado de embarazo y permisos
informativos. Se añade únicamente `vaccineType`, opcional y cerrado a `td`, `tdap`,
`influenza`, `spr_sr` o `null`, solo en formularios de Vacunas.
`useChatbotVaccineScreen` publica esa categoría y la asocia a la navegación actual;
el widget descarta un contexto de otra navegación. La categoría vuelve a validarse
en el constructor frontend y en el esquema estricto backend.

No se extrae DOM arbitrario ni se envían valores del formulario, IDs de paciente,
embarazo o control, CUI, expediente, nombres, nacimiento, teléfono, dirección,
VIH, diagnósticos, notas, resultados, fechas de aplicación ni query completa.
Los IDs reales se usan localmente para navegación de acciones existentes.
El mensaje escrito explícitamente por el usuario sí llega a la API propia y puede
contener información sensible: no se afirma que el texto libre sea anónimo.
No se agrega un destinatario externo ni se registra texto/contexto en logs.
El logging existente, desactivado por defecto, conserva solo metadatos y feedback.

## Mapa y decisión

`backend/src/config/chatbotScreenHelp.js` contiene ayuda estática para alta/edición
de paciente, control, vacunas, puerperio y morbilidad, ficha de riesgo, plan de
parto y consulta del expediente; distingue las pestañas del control y Tdap.
Los campos enfocados y las ayudas explícitas conservan el catálogo anterior.
Las frases deícticas ahora incluyen «acá», «qué selecciono» y «para qué sirve esto».

Las guardas de datos/consejo clínico preceden a toda ayuda. Después se resuelve
campo explícito/enfocado, formulario/pestaña, intenciones y acciones existentes;
el último recurso pide el nombre del campo/botón y aprovecha la pantalla conocida.
No se pide otra vez la pantalla cuando el contexto ya la identifica.
Las respuestas de pantalla tienen normalmente entre dos y cinco oraciones.
Las acciones rápidas, rutas, memoria de guías, autorización y rate limiting
existentes se conservan; esta información es orientativa, no una autorización.

Tdap explica dosis única, momento y fecha **documentados**, sin recomendar
aplicación ni inventar fechas. La interfaz versionada también ofrece
Postparto/aborto, además de Previo/Durante el embarazo; la ayuda refleja las tres
opciones reales, sin cambiar sus reglas. Riesgo explica edad/criterios automáticos
sin asignar puntajes. Plan de parto explica secciones, precarga e impresión.
VIH se explica solo desde permisos/interfaz; diagnóstico, tratamiento,
medicamentos y decisiones individuales se derivan al profesional/protocolo.

## Verificación local

Pruebas backend de pregunta original, variantes, foco/fecha, pantallas, límites
clínicos, fallback, esquema y acciones; frontend de minimización con canarios y
rutas dinámicas; DOM con widget/formularios reales, API de datos sintéticos y
motor/esquema reales de Lía. No hay conexión a una base clínica ni a un proveedor.
La comprobación manual local usa las mismas cinco pantallas: Tdap, Control,
Riesgo, Plan y ruta desconocida, y chat a 390 px con input, scroll y botones.

Resultados finales: backend Lía 358 aprobadas; backend completo 1250 aprobadas,
48 omitidas y 0 fallidas (aislamiento por archivo, concurrencia 1). Frontend Node
184 aprobadas, DOM focal 7 aprobadas con formularios reales; ESLint y Vite build
correctos. No se ejecutó la suite DOM global de calendario/dashboard (CPREN-59).
Desktop y móvil 390 px comprobados sin overflow horizontal del chat; input,
scroll y acciones rápidas operativos. El preview sintético local quedó detenido.

No se modifican datos, reglas médicas, credenciales, `.env` ni producción.
Sin SSH, commit, push o despliegue. CPREN-59 permanece separado.
