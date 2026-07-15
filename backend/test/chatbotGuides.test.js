const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const {
  CHATBOT_GUIDE_IDS,
  CHATBOT_MAX_GUIDE_STEPS,
  chatbotGuides,
  extractNumberedSteps,
} = require('../src/config/chatbotGuides');
const { chatbotKnowledge } = require('../src/config/chatbotKnowledge');
const { answerQuestion } = require('../src/services/chatbotService');
const {
  chatbotConversationSchema,
  chatbotMessageSchema,
} = require('../src/validations/chatbot.schemas');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPOSITORY_ROOT, 'frontend', 'src');

const EMPTY_CONVERSATION = Object.freeze({
  lastIntent: null,
  activeGuide: null,
  currentStep: null,
  totalSteps: null,
});

const FULL_CONTEXT = Object.freeze({
  route: '/pacientes/:id/expediente',
  module: 'expediente',
  hasPatientContext: true,
  hasPregnancyContext: true,
  pregnancyStatus: 'activo',
  permissions: Object.freeze([
    'pacientes.crear',
    'pacientes.editar',
    'controles.crear',
    'controles.editar',
  ]),
});

const GUIDE_STARTS = [
  ['registrar_paciente', 'Guíame para registrar una paciente'],
  ['control_prenatal', 'Guíame paso a paso para agregar un control prenatal'],
  ['ficha_riesgo', 'Guíame para llenar la ficha de riesgo'],
  ['vacunas', 'Guíame para registrar una vacuna'],
  ['plan_parto', 'Guíame para registrar el plan de parto'],
  ['cerrar_embarazo', 'Guíame para cerrar el embarazo'],
];

function activeConversation(guideId, currentStep = 1) {
  return {
    lastIntent: guideId,
    activeGuide: guideId,
    currentStep,
    totalSteps: chatbotGuides[guideId].steps.length,
  };
}

function context(overrides = {}) {
  return {
    ...FULL_CONTEXT,
    permissions: [...FULL_CONTEXT.permissions],
    ...overrides,
  };
}

test('catalogo declara exactamente las seis guias iniciales con estructura segura', () => {
  assert.deepEqual(CHATBOT_GUIDE_IDS, [
    'registrar_paciente',
    'control_prenatal',
    'ficha_riesgo',
    'vacunas',
    'plan_parto',
    'cerrar_embarazo',
  ]);
  assert.deepEqual(
    CHATBOT_GUIDE_IDS.map((id) => chatbotGuides[id].steps.length),
    [5, 7, 7, 7, 7, 5]
  );

  for (const id of CHATBOT_GUIDE_IDS) {
    const guide = chatbotGuides[id];
    const knowledge = chatbotKnowledge.find((item) => item.id === id);
    assert.ok(guide.title);
    assert.ok(guide.module);
    assert.ok(guide.completionMessage);
    assert.ok(guide.steps.length <= CHATBOT_MAX_GUIDE_STEPS);
    assert.deepEqual(guide.steps, extractNumberedSteps(knowledge.answer));
    assert.deepEqual(guide.allowedSuggestions, ['Siguiente', 'Anterior', 'Repetir', 'Cancelar']);
    assert.ok(guide.completionSuggestions.length >= 2);
    assert.ok(guide.completionSuggestions.length <= 4);
    assert.equal(Object.isFrozen(guide), true);
    assert.equal(Object.isFrozen(guide.steps), true);
  }
});

for (const [guideId, message] of GUIDE_STARTS) {
  test(`inicia la guia ${guideId} mostrando solo el primer paso`, () => {
    const guide = chatbotGuides[guideId];
    const result = answerQuestion(message, context(), { ...EMPTY_CONVERSATION });

    assert.equal(result.intent, guideId);
    assert.match(result.answer, new RegExp(`Paso 1 de ${guide.steps.length}`));
    assert.ok(result.answer.includes(guide.steps[0]));
    assert.equal(result.answer.includes(guide.steps[1]), false);
    assert.deepEqual(result.suggestions, ['Siguiente', 'Repetir', 'Cancelar']);
    assert.deepEqual(result.conversation, activeConversation(guideId));
  });
}

for (const phrase of ['Siguiente', 'Continuar', 'Ya lo hice', '¿Y después?']) {
  test(`accion ${phrase} avanza exactamente un paso`, () => {
    const result = answerQuestion(
      phrase,
      context(),
      activeConversation('control_prenatal', 2)
    );

    assert.equal(result.intent, 'guia_siguiente');
    assert.equal(result.conversation.currentStep, 3);
    assert.match(result.answer, /Paso 3 de 7/);
  });
}

test('anterior y volver retroceden un paso', () => {
  for (const phrase of ['Anterior', 'Volver', 'Volver al paso anterior']) {
    const result = answerQuestion(
      phrase,
      context(),
      activeConversation('ficha_riesgo', 3)
    );
    assert.equal(result.intent, 'guia_anterior');
    assert.equal(result.conversation.currentStep, 2);
  }
});

test('anterior nunca retrocede antes del primer paso', () => {
  const result = answerQuestion(
    'Anterior',
    context(),
    activeConversation('vacunas', 1)
  );

  assert.equal(result.conversation.currentStep, 1);
  assert.match(result.answer, /primer paso/);
});

test('repite y no entendi conservan el paso actual', () => {
  for (const phrase of ['Repite', 'No entendí']) {
    const result = answerQuestion(
      phrase,
      context(),
      activeConversation('plan_parto', 4)
    );
    assert.equal(result.intent, 'guia_repetir');
    assert.equal(result.conversation.currentStep, 4);
    assert.ok(result.answer.includes(chatbotGuides.plan_parto.steps[3]));
  }
});

test('cancelar limpia guia y paso sin borrar lastIntent', () => {
  const result = answerQuestion(
    'Cancelar',
    context(),
    activeConversation('control_prenatal', 3)
  );

  assert.equal(result.intent, 'guia_cancelada');
  assert.deepEqual(result.conversation, {
    lastIntent: 'control_prenatal',
    activeGuide: null,
    currentStep: null,
    totalSteps: null,
  });
  assert.match(result.answer, /historial visible permanece/);
});

test('empecemos de nuevo cancela la guia activa', () => {
  const result = answerQuestion(
    'Empecemos de nuevo',
    context(),
    activeConversation('vacunas', 2)
  );
  assert.equal(result.intent, 'guia_cancelada');
  assert.equal(result.conversation.activeGuide, null);
});

test('siguiente en el ultimo paso finaliza y ofrece acciones relacionadas', () => {
  const guide = chatbotGuides.cerrar_embarazo;
  const result = answerQuestion(
    'Siguiente',
    context(),
    activeConversation(guide.id, guide.steps.length)
  );

  assert.equal(result.intent, 'guia_finalizada');
  assert.equal(result.conversation.lastIntent, guide.id);
  assert.equal(result.conversation.activeGuide, null);
  assert.equal(result.conversation.currentStep, null);
  assert.equal(result.suggestions.length, 2);
  assert.match(result.answer, /Terminaste los 5 pasos/);
});

test('conversation acepta estado vacio y estado activo coherente', () => {
  assert.equal(chatbotConversationSchema.safeParse(EMPTY_CONVERSATION).success, true);
  assert.equal(
    chatbotConversationSchema.safeParse(activeConversation('control_prenatal', 3)).success,
    true
  );
});

test('conversation rechaza guia inexistente, texto arbitrario y propiedades adicionales', () => {
  const invalidStates = [
    { ...EMPTY_CONVERSATION, activeGuide: 'guia_inventada', currentStep: 1 },
    { ...EMPTY_CONVERSATION, lastIntent: 'texto libre con datos' },
    { ...EMPTY_CONVERSATION, patientName: 'Dato privado' },
  ];

  for (const candidate of invalidStates) {
    assert.equal(chatbotConversationSchema.safeParse(candidate).success, false);
  }
});

test('conversation rechaza pasos y totales incoherentes', () => {
  const invalidStates = [
    { lastIntent: 'control_prenatal', activeGuide: null, currentStep: 1, totalSteps: null },
    activeConversation('control_prenatal', 8),
    { ...activeConversation('control_prenatal', 2), totalSteps: 6 },
    { ...activeConversation('control_prenatal', 2), lastIntent: 'vacunas' },
  ];

  for (const candidate of invalidStates) {
    assert.equal(chatbotConversationSchema.safeParse(candidate).success, false);
  }
});

test('conversation no permite que el cliente invente totalSteps', () => {
  const result = chatbotMessageSchema.safeParse({
    mensaje: 'Siguiente',
    conversation: {
      ...activeConversation('vacunas', 2),
      totalSteps: 8,
    },
  });
  assert.equal(result.success, false);
});

test('pregunta relacionada responde y conserva la guia activa', () => {
  const state = activeConversation('control_prenatal', 4);
  const result = answerQuestion('¿Y dónde ingreso los laboratorios?', context(), state);

  assert.equal(result.intent, 'laboratorio');
  assert.deepEqual(result.conversation, state);
  assert.deepEqual(result.suggestions, ['Continuar guía', 'Repetir paso', 'Cancelar']);
});

test('pregunta para editarlo usa lastIntent sin almacenar texto anterior', () => {
  const result = answerQuestion(
    '¿Y para editarlo?',
    context(),
    activeConversation('vacunas', 2)
  );

  assert.equal(result.intent, 'editar_vacuna');
  assert.match(result.answer, /editar una vacuna/i);
  assert.equal(result.conversation.currentStep, 2);
});

test('falta de permiso de edicion bloquea la orientacion contextual', () => {
  const result = answerQuestion(
    '¿Y para editarlo?',
    context({ permissions: ['controles.crear'] }),
    activeConversation('control_prenatal', 2)
  );

  assert.equal(result.intent, 'editar_control_prenatal');
  assert.match(result.answer, /controles\.editar/);
  assert.equal(result.conversation.activeGuide, 'control_prenatal');
});

test('cambio claro de tema cierra la guia anterior', () => {
  const result = answerQuestion(
    '¿Cómo registro una vacuna?',
    context(),
    activeConversation('control_prenatal', 2)
  );

  assert.equal(result.intent, 'vacunas');
  assert.equal(result.conversation.activeGuide, null);
  assert.equal(result.conversation.lastIntent, 'vacunas');
  assert.match(result.answer, /Cambiamos de tema y cierro la guía/);
});

test('solicitar otra guia sustituye explicitamente la guia activa', () => {
  const result = answerQuestion(
    'Guíame para registrar una vacuna',
    context(),
    activeConversation('control_prenatal', 2)
  );

  assert.equal(result.intent, 'vacunas');
  assert.equal(result.conversation.activeGuide, 'vacunas');
  assert.equal(result.conversation.currentStep, 1);
  assert.match(result.answer, /Cambiamos de tema/);
});

test('embarazo cerrado impide iniciar o continuar una guia clinica', () => {
  const closedContext = context({ pregnancyStatus: 'cerrado' });
  const start = answerQuestion(
    'Guíame para agregar un control prenatal',
    closedContext,
    { ...EMPTY_CONVERSATION }
  );
  const continuation = answerQuestion(
    'Siguiente',
    closedContext,
    activeConversation('vacunas', 2)
  );

  assert.equal(start.conversation.activeGuide, null);
  assert.match(start.answer, /cerrado|solo lectura/);
  assert.equal(continuation.intent, 'guia_bloqueada');
  assert.equal(continuation.conversation.activeGuide, null);
});

test('falta de permiso impide iniciar la guia', () => {
  const result = answerQuestion(
    'Guíame para agregar un control prenatal',
    context({ permissions: [] }),
    { ...EMPTY_CONVERSATION }
  );

  assert.equal(result.conversation.activeGuide, null);
  assert.match(result.answer, /controles\.crear/);
  assert.match(result.answer, /backend/);
});

test('cerrar embarazo requiere embarazo seleccionado', () => {
  const result = answerQuestion(
    'Guíame para cerrar el embarazo',
    context({ hasPregnancyContext: false, pregnancyStatus: null }),
    { ...EMPTY_CONVERSATION }
  );

  assert.equal(result.conversation.activeGuide, null);
  assert.match(result.answer, /selecciona un embarazo/);
});

test('guardas clinicas mantienen prioridad y no pierden la guia', () => {
  const state = activeConversation('control_prenatal', 3);
  const baseline = answerQuestion('¿Qué medicamento debo darle?', context());
  const result = answerQuestion('¿Qué medicamento debo darle?', context(), state);

  assert.equal(result.intent, 'solicitud_consejo_clinico');
  assert.equal(result.answer, baseline.answer);
  assert.deepEqual(result.conversation, state);
});

test('cliente sin conversation conserva contrato anterior', () => {
  const result = answerQuestion('¿Cómo agrego un control prenatal?', context());
  assert.equal(Object.hasOwn(result, 'conversation'), false);
  assert.equal(result.intent, 'control_prenatal');
});

test('estado conversacional solo contiene codigos y numeros seguros', () => {
  const result = answerQuestion(
    'Guíame para registrar una paciente',
    context(),
    { ...EMPTY_CONVERSATION }
  );

  assert.deepEqual(Object.keys(result.conversation), [
    'lastIntent',
    'activeGuide',
    'currentStep',
    'totalSteps',
  ]);
  const serialized = JSON.stringify(result.conversation);
  assert.equal(serialized.includes('Guíame'), false);
  assert.equal(serialized.includes(result.answer), false);
});

test('frontend limpia memoria al cambiar identityKey y normaliza respuestas', async () => {
  const modulePath = path.join(FRONTEND_ROOT, 'utils', 'chatbotConversation.js');
  const {
    conversationForIdentity,
    createConversationMemory,
  } = await import(pathToFileURL(modulePath).href);
  const state = activeConversation('control_prenatal', 2);
  const memory = createConversationMemory('usuario-a', state);

  assert.deepEqual(conversationForIdentity(memory, 'usuario-a'), state);
  assert.deepEqual(conversationForIdentity(memory, 'usuario-b'), EMPTY_CONVERSATION);
});

test('frontend muestra progreso, evita doble envio y no persiste memoria', () => {
  const widget = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'components', 'ChatbotWidget.jsx'),
    'utf8'
  );
  const utility = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'utils', 'chatbotConversation.js'),
    'utf8'
  );

  assert.match(widget, /Paso \{message\.guideProgress\.currentStep\} de \{message\.guideProgress\.totalSteps\}/);
  assert.match(widget, /requestInFlightRef\.current/);
  assert.match(widget, /disabled=\{loading\}/);
  assert.match(widget, /conversation:\s*safeConversation/);
  assert.match(widget, /activeRequestRef\.current\?\.controller\.abort\(\)/);
  assert.doesNotMatch(`${widget}\n${utility}`, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(widget, /conversation:\s*messages|conversation:\s*chatHistory/);
  assert.doesNotMatch(widget, /intent:\s*lastBotMessage\.intent,[\s\S]{0,80}mensaje:/);
});
