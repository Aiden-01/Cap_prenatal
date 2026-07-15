const { chatbotKnowledge } = require('./chatbotKnowledge');

const FRIENDLY_OPENINGS = {
  calcular_fpp: 'Claro, te ayudo con eso.',
  registrar_paciente: 'Va, hagamos el registro con calma.',
  buscar_paciente: 'Claro, para encontrarla rápido:',
  editar_paciente: 'Si hay que corregir datos, se puede hacer desde el expediente.',
  embarazo_activo: 'Buena pregunta. Esto conviene hacerlo con cuidado.',
  control_prenatal: 'Claro, vamos con el control prenatal.',
  ficha_riesgo: 'Va, revisemos la ficha de riesgo.',
  interpretar_riesgo: 'Te cuento como leerlo en el sistema.',
  mapa_riesgo: 'Va, el mapa te ayuda a ver el riesgo por comunidad.',
  laboratorio: 'Claro, para registrar laboratorios:',
  reportes: 'Si quieres generar un reporte, ve por aquí:',
  filtrar_reportes: 'Para ajustar el período del reporte:',
  usuarios: 'Para usuarios y permisos, revisa esto:',
  cambiar_password: 'Claro, puedes cambiar tu contraseña desde tu cuenta.',
  olvido_contrasena: 'Eso pasa, no te preocupes.',
  errores_guardado: 'Entiendo, cuando no guarda desespera un poco.',
  datos_obligatorios: 'Puede que falte un dato requerido.',
  sin_internet: 'Si el sistema está lento o no carga, revisa esto primero.',
  ayuda_bot: 'Aquí estoy para ayudarte con el sistema.',
  primeros_pasos: 'Si estás empezando, este orden te puede ayudar.',
};

const FRIENDLY_CLOSINGS = {
  eliminar_registro: 'Mi consejo: si solo fue un dato mal escrito, usa Editar antes de eliminar.',
  privacidad_datos: 'La idea es cuidar la información de las pacientes con la misma seriedad con la que se cuida el expediente físico.',
  olvido_contrasena: 'Cuando te restablezcan el acceso, entra con tu usuario y cambia la clave si te lo solicitan.',
  sin_internet: 'Si después de eso sigue igual, conviene reportarlo con la hora y la pantalla donde falló.',
};

const DEFAULT_OPENING = 'Claro, te ayudo.';
const DEFAULT_CLOSING = '';
const CLINICAL_DISCLAIMER = 'Te oriento sobre el sistema; lo clínico siempre se confirma con criterio profesional y protocolo local.';

const SPECIAL_RESPONSES = {
  emptyMessage: 'Estoy aquí. Escríbeme qué necesitas hacer, por ejemplo: "quiero registrar una paciente" o "no me deja guardar".',
  greeting: '¡Hola! Aquí estoy 😊\nDime qué necesitas hacer en el sistema y te ayudo paso a paso.',
  thanks: '¡Con gusto! Si necesitas algo más del sistema, aquí estoy para ayudarte.',
  farewell: '¡Hasta luego! Cuando necesites ayuda con el sistema, aquí estaré.',
  clinicalData: 'No consulto ni revelo expedientes o resultados clínicos de pacientes. Revisa esa información dentro del expediente, con los permisos correspondientes.',
  vihPermission: ' El acceso a resultados de VIH depende del permiso controles.ver_vih; no puedo afirmar si tu cuenta lo tiene.',
  clinicalAdvice: 'Puedo orientarte sobre cómo usar el sistema, pero no puedo indicar medicamentos, dosis, diagnósticos o tratamientos ni clasificar la gravedad. Consulta al profesional responsable y los protocolos vigentes del MSPAS para decidir la conducta.',
  fallback: 'Eso no lo manejo bien todavía, y prefiero no inventarte algo. Puedes decirme en qué pantalla estás y qué campo o botón te dio duda. Si es algo de permisos o configuración, revísalo con el administrador del sistema.',
  operationalClarification: 'Entiendo que no quieres eliminar el registro. ¿Qué necesitas editar: los datos de la paciente, un control prenatal, una vacuna, una atención de puerperio, una morbilidad, la ficha de riesgo o el plan de parto?',
  laboratoryView: 'Para ver los laboratorios guardados:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Laboratorios".\n3. Selecciona el control que deseas revisar para ver sus resultados por grupo de estudio.\n\nLos resultados se capturan al crear o editar un control prenatal, pero se consultan desde esta pestaña del expediente. La visibilidad de VIH depende del permiso correspondiente de la cuenta.',
};

const SPECIAL_SUGGESTIONS = {
  emptyMessage: chatbotKnowledge.slice(0, 4).map((item) => item.title),
  greeting: [
    'Registrar una paciente',
    'Agregar un control prenatal',
    'Revisar una ficha de riesgo',
    'Generar un reporte',
  ],
  fallback: chatbotKnowledge.slice(0, 6).map((item) => item.title),
};

const STEP_CONNECTORS = [
  'Primero',
  'Luego',
  'Despues',
  'Cuando ya estes ahi',
  'Al final',
  'Si aplica',
  'Para cerrar',
  'Tambien puedes',
];

Object.freeze(FRIENDLY_OPENINGS);
Object.freeze(FRIENDLY_CLOSINGS);
Object.freeze(SPECIAL_RESPONSES);
Object.freeze(SPECIAL_SUGGESTIONS.emptyMessage);
Object.freeze(SPECIAL_SUGGESTIONS.greeting);
Object.freeze(SPECIAL_SUGGESTIONS.fallback);
Object.freeze(SPECIAL_SUGGESTIONS);
Object.freeze(STEP_CONNECTORS);

module.exports = {
  CLINICAL_DISCLAIMER,
  DEFAULT_CLOSING,
  DEFAULT_OPENING,
  FRIENDLY_CLOSINGS,
  FRIENDLY_OPENINGS,
  SPECIAL_RESPONSES,
  SPECIAL_SUGGESTIONS,
  STEP_CONNECTORS,
};
