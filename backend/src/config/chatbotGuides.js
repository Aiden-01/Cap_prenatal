const { chatbotKnowledge } = require('./chatbotKnowledge');

const CHATBOT_MAX_GUIDE_STEPS = 8;
const GUIDE_ALLOWED_ACTIONS = Object.freeze([
  'Siguiente',
  'Anterior',
  'Repetir',
  'Cancelar',
]);

function extractNumberedSteps(answer) {
  return String(answer)
    .split('\n')
    .map((line) => line.match(/^\s*\d+\.\s+(.+)$/)?.[1])
    .filter(Boolean);
}

const guideDefinitions = [
  {
    id: 'registrar_paciente',
    module: 'pacientes',
    intro: 'Te acompaño a crear el registro inicial de una paciente en el sistema.',
    requirements: {
      permissionsAll: ['pacientes.crear'],
    },
    relatedIntents: [
      'registrar_paciente',
      'buscar_paciente',
      'editar_paciente',
      'datos_obligatorios',
      'errores_guardado',
    ],
    editFollowup: {
      intent: 'editar_paciente',
      permission: 'pacientes.editar',
      label: 'la paciente',
    },
    completionMessage: 'La paciente debería quedar guardada y su expediente abierto.',
    completionSuggestions: ['Buscar una paciente', 'Agregar un control prenatal'],
  },
  {
    id: 'control_prenatal',
    module: 'expediente',
    intro: 'Te acompaño a registrar un control prenatal dentro del embarazo activo.',
    requirements: {
      hasPatientContext: true,
      hasPregnancyContext: true,
      allowedStatuses: ['activo'],
      permissionsAll: ['controles.crear'],
    },
    relatedIntents: [
      'control_prenatal',
      'editar_control_prenatal',
      'laboratorio',
      'referencias',
      'citas_seguimiento',
      'errores_guardado',
    ],
    editFollowup: {
      intent: 'editar_control_prenatal',
      permission: 'controles.editar',
      label: 'el control prenatal',
    },
    completionMessage: 'El control debería quedar guardado dentro del embarazo seleccionado.',
    completionSuggestions: ['Ver laboratorios', 'Registrar una vacuna', 'Ficha de riesgo'],
  },
  {
    id: 'ficha_riesgo',
    module: 'expediente',
    intro: 'Te acompaño a registrar o actualizar la ficha de riesgo obstétrico.',
    requirements: {
      hasPatientContext: true,
      hasPregnancyContext: true,
      blockedStatuses: ['cerrado'],
      permissionsAll: ['controles.crear', 'controles.editar'],
    },
    relatedIntents: ['ficha_riesgo', 'interpretar_riesgo', 'imprimir_riesgo'],
    editFollowup: {
      intent: 'ficha_riesgo',
      permission: 'controles.editar',
      label: 'la ficha de riesgo',
    },
    completionMessage: 'La ficha debería quedar guardada para el embarazo seleccionado.',
    completionSuggestions: ['Imprimir riesgo', 'Plan de parto'],
  },
  {
    id: 'vacunas',
    module: 'expediente',
    intro: 'Te acompaño a registrar una vacuna en el embarazo seleccionado.',
    requirements: {
      hasPatientContext: true,
      hasPregnancyContext: true,
      blockedStatuses: ['cerrado'],
      permissionsAll: ['controles.crear'],
    },
    relatedIntents: ['vacunas', 'editar_vacuna'],
    editFollowup: {
      intent: 'editar_vacuna',
      permission: 'controles.editar',
      label: 'la vacuna',
    },
    completionMessage: 'La vacuna debería quedar guardada en la sección correspondiente.',
    completionSuggestions: ['Editar una vacuna', 'Agregar un control prenatal'],
  },
  {
    id: 'plan_parto',
    module: 'expediente',
    intro: 'Te acompaño a registrar o actualizar el plan de parto.',
    requirements: {
      hasPatientContext: true,
      hasPregnancyContext: true,
      blockedStatuses: ['cerrado'],
      permissionsAll: ['controles.crear', 'controles.editar'],
    },
    relatedIntents: ['plan_parto', 'imprimir_plan_parto'],
    editFollowup: {
      intent: 'plan_parto',
      permission: 'controles.editar',
      label: 'el plan de parto',
    },
    completionMessage: 'El plan debería quedar guardado y disponible para impresión.',
    completionSuggestions: ['Imprimir plan de parto', 'Ficha de riesgo'],
  },
  {
    id: 'cerrar_embarazo',
    module: 'expediente',
    intro: 'Te acompaño a revisar el flujo para pasar a puerperio o cerrar el seguimiento.',
    requirements: {
      hasPatientContext: true,
      hasPregnancyContext: true,
      allowedStatuses: ['activo', 'puerperio'],
      permissionsAll: ['pacientes.editar'],
    },
    relatedIntents: ['cerrar_embarazo', 'embarazo_activo', 'puerperio'],
    completionMessage: 'La guía terminó; el sistema solo cambia el estado cuando confirmas la acción en el expediente.',
    completionSuggestions: ['Ver historial de embarazos', 'Registrar puerperio'],
  },
];

const chatbotGuides = Object.freeze(Object.fromEntries(guideDefinitions.map((definition) => {
  const knowledge = chatbotKnowledge.find((item) => item.id === definition.id);
  if (!knowledge) throw new Error(`Intencion de guia inexistente: ${definition.id}`);

  const steps = extractNumberedSteps(knowledge.answer);
  if (!steps.length || steps.length > CHATBOT_MAX_GUIDE_STEPS) {
    throw new Error(`Cantidad de pasos invalida para la guia ${definition.id}`);
  }

  const guide = {
    ...definition,
    title: knowledge.title,
    steps: Object.freeze(steps),
    allowedSuggestions: GUIDE_ALLOWED_ACTIONS,
    requirements: Object.freeze({
      ...definition.requirements,
      allowedStatuses: definition.requirements.allowedStatuses
        ? Object.freeze([...definition.requirements.allowedStatuses])
        : undefined,
      blockedStatuses: definition.requirements.blockedStatuses
        ? Object.freeze([...definition.requirements.blockedStatuses])
        : undefined,
      permissionsAll: definition.requirements.permissionsAll
        ? Object.freeze([...definition.requirements.permissionsAll])
        : undefined,
      permissionsAny: definition.requirements.permissionsAny
        ? Object.freeze([...definition.requirements.permissionsAny])
        : undefined,
    }),
    relatedIntents: Object.freeze([...definition.relatedIntents]),
    editFollowup: definition.editFollowup
      ? Object.freeze({ ...definition.editFollowup })
      : undefined,
    completionSuggestions: Object.freeze([...definition.completionSuggestions]),
  };

  return [guide.id, Object.freeze(guide)];
})));

const CHATBOT_GUIDE_IDS = Object.freeze(Object.keys(chatbotGuides));

module.exports = {
  CHATBOT_GUIDE_IDS,
  CHATBOT_MAX_GUIDE_STEPS,
  GUIDE_ALLOWED_ACTIONS,
  chatbotGuides,
  extractNumberedSteps,
};
