const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const {
  CHATBOT_QUICK_ACTIONS,
  CHATBOT_QUICK_ACTION_TARGETS,
} = require('../src/config/chatbotQuickActions');
const { chatbotGuides } = require('../src/config/chatbotGuides');
const { createChatbotController } = require('../src/controllers/chatbotController');
const { answerQuestion } = require('../src/services/chatbotService');
const {
  generateQuickActions,
} = require('../src/services/chatbotQuickActionsService');
const {
  chatbotQuickActionsSchema,
} = require('../src/validations/chatbotQuickActions.schemas');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPOSITORY_ROOT, 'frontend', 'src');
const ALL_PERMISSIONS = Object.freeze([
  'pacientes.crear',
  'pacientes.ver',
  'pacientes.editar',
  'controles.crear',
  'controles.editar',
  'reportes.ver',
  'mapa_riesgo.ver',
  'usuarios.gestionar',
]);

function context(overrides = {}) {
  return {
    route: '/pacientes/:id/expediente',
    module: 'expediente',
    hasPatientContext: true,
    hasPregnancyContext: true,
    pregnancyStatus: 'activo',
    permissions: [...ALL_PERMISSIONS],
    ...overrides,
  };
}

function conversation(guideId, currentStep) {
  return {
    lastIntent: guideId,
    activeGuide: guideId,
    currentStep,
    totalSteps: chatbotGuides[guideId].steps.length,
  };
}

async function invoke(handler, req) {
  let responseBody;
  let nextError;
  await handler(
    req,
    {
      json(payload) {
        responseBody = payload;
        return payload;
      },
    },
    (error) => {
      nextError = error;
    }
  );
  if (nextError) throw nextError;
  return responseBody;
}

test('contrato limita a cuatro acciones, exige campos exactos y evita duplicados', () => {
  const actions = generateQuickActions({
    intent: 'saludo',
    context: context({
      route: '/dashboard',
      module: 'dashboard',
      hasPatientContext: false,
      hasPregnancyContext: false,
      pregnancyStatus: null,
    }),
  });

  assert.ok(actions.length >= 2 && actions.length <= 4);
  assert.equal(chatbotQuickActionsSchema.safeParse(actions).success, true);
  assert.equal(new Set(actions.map((action) => action.id)).size, actions.length);
  assert.equal(new Set(actions.map((action) => action.label)).size, actions.length);
  for (const action of actions) {
    const expected = action.type === 'message'
      ? ['id', 'label', 'message', 'type']
      : ['id', 'label', 'target', 'type'];
    assert.deepEqual(Object.keys(action).sort(), expected);
  }

  const duplicate = [actions[0], { ...actions[0], id: 'another-id' }];
  assert.equal(chatbotQuickActionsSchema.safeParse(duplicate).success, false);
  assert.equal(chatbotQuickActionsSchema.safeParse([
    { ...actions[0], extra: 'prohibido' },
  ]).success, false);
});

test('generar acciones no muta intent, conversation ni context', () => {
  const input = {
    intent: 'control_prenatal',
    conversation: conversation('control_prenatal', 2),
    context: context(),
  };
  const snapshot = structuredClone(input);
  const first = generateQuickActions(input);
  const second = generateQuickActions(input);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(first, second);
});

test('saludo en dashboard prioriza acciones funcionales del modulo', () => {
  const actions = generateQuickActions({
    intent: 'saludo',
    context: context({
      route: '/dashboard',
      module: 'dashboard',
      hasPatientContext: false,
      hasPregnancyContext: false,
      pregnancyStatus: null,
    }),
  });
  assert.deepEqual(actions.map((action) => action.target), [
    'pacientes',
    'nueva_paciente',
    'reportes',
  ]);
});

test('saludo dentro del expediente usa embarazo y permisos actuales', () => {
  const actions = generateQuickActions({ intent: 'saludo', context: context() });
  assert.deepEqual(actions.map((action) => action.id), [
    'how-register-control',
    'how-register-vaccine',
    'how-risk-form',
  ]);
});

test('accion de referencias dirige a Riesgo o Morbilidad sin ruta independiente', () => {
  const action = CHATBOT_QUICK_ACTIONS.howReference;
  assert.match(action.label, /Riesgo obstétrico o Morbilidad/);
  assert.match(action.message, /Riesgo obstétrico o Morbilidad/);
  assert.equal(action.type, 'message');
  assert.equal(Object.hasOwn(action, 'target'), false);
  assert.equal(
    Object.values(CHATBOT_QUICK_ACTION_TARGETS).some((target) => /referencias/i.test(target)),
    false
  );
});

test('lista de pacientes y puerperio usan acciones propias sin control prenatal nuevo', () => {
  const patientList = generateQuickActions({
    intent: 'saludo',
    context: context({
      route: '/pacientes',
      module: 'pacientes',
      hasPatientContext: false,
      hasPregnancyContext: false,
      pregnancyStatus: null,
    }),
  });
  assert.deepEqual(patientList.map((action) => action.id), [
    'open-patients',
    'open-new-patient',
    'how-open-record',
  ]);

  const puerperium = generateQuickActions({
    intent: 'saludo',
    context: context({ pregnancyStatus: 'puerperio' }),
  });
  assert.equal(puerperium.some((action) => action.id === 'how-register-control'), false);
  assert.deepEqual(puerperium.map((action) => action.id), [
    'how-register-puerperium',
    'how-previous-controls',
    'how-view-vaccines',
  ]);
});

test('guia activa genera controles exactos para primer, intermedio y ultimo paso', () => {
  const guideId = 'control_prenatal';
  const total = chatbotGuides[guideId].steps.length;
  const first = generateQuickActions({
    intent: guideId,
    conversation: conversation(guideId, 1),
    context: context(),
  });
  const intermediate = generateQuickActions({
    intent: 'guia_siguiente',
    conversation: conversation(guideId, 3),
    context: context(),
  });
  const last = generateQuickActions({
    intent: 'guia_siguiente',
    conversation: conversation(guideId, total),
    context: context(),
  });

  assert.deepEqual(first.map((action) => action.label), ['Siguiente', 'Repetir', 'Cancelar']);
  assert.deepEqual(
    intermediate.map((action) => action.label),
    ['Siguiente', 'Anterior', 'Repetir', 'Cancelar']
  );
  assert.deepEqual(
    last.map((action) => action.label),
    ['Finalizar', 'Anterior', 'Repetir', 'Cancelar']
  );
  assert.equal(last[0].message, 'Siguiente');
});

test('guia finalizada ofrece acciones relacionadas sin reiniciar la misma guia', () => {
  const actions = generateQuickActions({
    intent: 'guia_finalizada',
    conversation: {
      lastIntent: 'control_prenatal',
      activeGuide: null,
      currentStep: null,
      totalSteps: null,
    },
    context: context(),
  });

  assert.ok(actions.length >= 2 && actions.length <= 4);
  assert.equal(actions.some((action) => action.id === 'start-control-guide'), false);
  assert.equal(actions.some((action) => action.id === 'guide-next'), false);
});

test('agradecimiento conserva guia activa y despedida no satura con opciones', () => {
  const activeGuide = generateQuickActions({
    intent: 'agradecimiento',
    conversation: conversation('vacunas', 2),
    context: context(),
  });
  assert.deepEqual(
    activeGuide.map((action) => action.label),
    ['Siguiente', 'Anterior', 'Repetir', 'Cancelar']
  );

  const farewell = generateQuickActions({ intent: 'despedida', context: context() });
  assert.deepEqual(farewell.map((action) => action.id), ['new-question']);
});

test('embarazo cerrado no ofrece escritura ni cierre repetido', () => {
  const forbidden = /start-|register-|edit-|close-pregnancy/;
  for (const intent of ['control_prenatal', 'vacunas', 'editar_vacuna', 'plan_parto', 'cerrar_embarazo']) {
    const actions = generateQuickActions({
      intent,
      context: context({ pregnancyStatus: 'cerrado' }),
    });
    assert.equal(actions.some((action) => forbidden.test(action.id)), false, intent);
  }
});

test('falta de controles.crear oculta registrar control', () => {
  const actions = generateQuickActions({
    intent: 'control_prenatal',
    context: context({ permissions: ['pacientes.ver'] }),
  });
  assert.equal(actions.some((action) => (
    action.id === 'start-control-guide' || action.id === 'how-register-control'
  )), false);
});

test('sin contexto de embarazo ofrece busqueda, expediente y seleccion segura', () => {
  const actions = generateQuickActions({
    intent: 'vacunas',
    context: context({
      route: '/dashboard',
      module: 'dashboard',
      hasPatientContext: false,
      hasPregnancyContext: false,
      pregnancyStatus: null,
    }),
  });
  assert.equal(actions.some((action) => action.target === 'pacientes'), true);
  assert.equal(actions.some((action) => action.id === 'how-open-record'), true);
  assert.equal(actions.some((action) => action.id === 'how-select-pregnancy'), true);
});

test('guarda de consejo clinico solo ofrece flujos de sistema no prescriptivos', () => {
  const actions = generateQuickActions({
    intent: 'solicitud_consejo_clinico',
    context: context(),
  });
  const serialized = JSON.stringify(actions);
  assert.match(serialized, /referencia/);
  assert.match(serialized, /morbilidad/);
  assert.doesNotMatch(serialized, /medicamento|dosis|diagnostico|diagnóstico|tratamiento/);
});

test('guarda de dato clinico no incorpora resultados ni identificadores', () => {
  const actions = generateQuickActions({
    intent: 'solicitud_dato_clinico',
    context: context(),
  });
  const serialized = JSON.stringify(actions);
  assert.equal(actions.some((action) => action.target === 'expediente_actual'), true);
  assert.match(serialized, /permiso de VIH/);
  assert.doesNotMatch(serialized, /resultado positivo|resultado negativo|pacienteId|embarazo_id|\/pacientes\//i);
});

test('contrasenas no navegan a usuarios y las intenciones operativas tienen acciones', () => {
  for (const intent of ['cambiar_password', 'olvido_contrasena']) {
    const actions = generateQuickActions({ intent, context: context() });
    assert.equal(actions.some((action) => action.target === 'usuarios'), false);
    if (intent === 'olvido_contrasena') {
      assert.equal(actions.some((action) => action.type === 'navigate'), false);
    }
  }

  const operationalIntents = [
    'registrar_paciente',
    'buscar_paciente',
    'control_prenatal',
    'ficha_riesgo',
    'vacunas',
    'editar_vacuna',
    'laboratorio',
    'plan_parto',
    'puerperio',
    'referencias',
    'reportes',
    'cambiar_password',
    'olvido_contrasena',
    'usuarios',
    'cerrar_embarazo',
    'secciones_expediente',
    'impresion_no_disponible',
  ];
  for (const intent of operationalIntents) {
    assert.ok(generateQuickActions({ intent, context: context() }).length > 0, intent);
  }
});

test('ficha MSPAS nunca navega a reportes', () => {
  const actions = generateQuickActions({
    intent: 'impresion_no_disponible',
    context: context({
      route: '/dashboard',
      module: 'dashboard',
      hasPatientContext: false,
      hasPregnancyContext: false,
      pregnancyStatus: null,
    }),
  });
  assert.equal(actions.some((action) => action.target === 'reportes'), false);
  assert.equal(actions.some((action) => action.id === 'how-mspas-form'), true);
});

test('expediente_actual solo se emite con contexto de paciente', () => {
  const withPatient = generateQuickActions({ intent: 'laboratorio', context: context() });
  const withoutPatient = generateQuickActions({
    intent: 'laboratorio',
    context: context({
      route: '/dashboard',
      module: 'dashboard',
      hasPatientContext: false,
      hasPregnancyContext: false,
      pregnancyStatus: null,
    }),
  });
  assert.equal(withPatient.some((action) => action.target === 'expediente_actual'), true);
  assert.equal(withoutPatient.some((action) => action.target === 'expediente_actual'), false);
});

test('todos los targets pertenecen a la lista cerrada y no son URLs', () => {
  const targetSet = new Set(CHATBOT_QUICK_ACTION_TARGETS);
  const intents = [
    'saludo', 'registrar_paciente', 'reportes', 'usuarios', 'mapa_riesgo',
    'secciones_expediente', 'impresion_no_disponible',
  ];
  for (const intent of intents) {
    const actions = generateQuickActions({ intent, context: context() });
    for (const action of actions.filter((item) => item.type === 'navigate')) {
      assert.equal(targetSet.has(action.target), true);
      assert.doesNotMatch(action.target, /:\/\/|^\//);
    }
  }
});

test('mensajes de acciones operativas son reconocidos por el motor actual', () => {
  const expectedIntents = {
    'how-edit-vaccine': 'editar_vacuna',
    'how-mspas-form': 'impresion_no_disponible',
    'how-print-birth-plan': 'imprimir_plan_parto',
    'how-print-risk': 'imprimir_riesgo',
    'how-select-pregnancy': 'embarazo_activo',
    'password-access-help': 'olvido_contrasena',
    'vih-permission-help': 'permisos_usuario',
  };
  const messageActions = Object.values(CHATBOT_QUICK_ACTIONS).filter((action) => (
    action.type === 'message' && !action.id.startsWith('guide-')
  ));
  for (const action of messageActions) {
    const result = answerQuestion(action.message, context());
    assert.equal(result.recognized, true, `${action.id}: ${action.message}`);
    if (expectedIntents[action.id]) assert.equal(result.intent, expectedIntents[action.id]);
  }

  for (const action of [
    CHATBOT_QUICK_ACTIONS.guideNext,
    CHATBOT_QUICK_ACTIONS.guidePrevious,
    CHATBOT_QUICK_ACTIONS.guideRepeat,
    CHATBOT_QUICK_ACTIONS.guideCancel,
  ]) {
    const result = answerQuestion(
      action.message,
      context(),
      conversation('control_prenatal', 2)
    );
    assert.notEqual(result.intent, 'no_reconocida', action.id);
  }
});

test('controller conserva suggestions, agrega quickActions y no las entrega al logging', async () => {
  let loggedMetadata;
  const { preguntar } = createChatbotController({
    answerQuestionFn: () => ({
      recognized: false,
      intent: 'saludo',
      answer: 'Respuesta compatible',
      suggestions: ['Sugerencia heredada'],
    }),
    logger: {
      async logUnrecognized(metadata) {
        loggedMetadata = metadata;
      },
      async logFeedback() {},
    },
  });
  const response = await invoke(preguntar, {
    body: {
      mensaje: 'Hola',
      context: context({
        route: '/dashboard',
        module: 'dashboard',
        hasPatientContext: false,
        hasPregnancyContext: false,
        pregnancyStatus: null,
      }),
    },
  });

  assert.deepEqual(response.suggestions, ['Sugerencia heredada']);
  assert.ok(response.quickActions.length > 0);
  assert.equal(Object.hasOwn(loggedMetadata, 'quickActions'), false);
  assert.equal(JSON.stringify(loggedMetadata).includes('open-patients'), false);
});

test('feedback conserva contrato minimo y nunca recibe quickActions', async () => {
  let loggedMetadata;
  const { registrarFeedback } = createChatbotController({
    logger: {
      async logUnrecognized() {},
      async logFeedback(metadata) {
        loggedMetadata = metadata;
      },
    },
  });
  const response = await invoke(registrarFeedback, {
    body: {
      helpful: true,
      intent: 'control_prenatal',
      quickActions: [{ id: 'dato-no-admitido' }],
    },
  });
  assert.deepEqual(response, { ok: true });
  assert.deepEqual(loggedMetadata, { helpful: true, intent: 'control_prenatal' });
});

test('utilidad frontend valida, limita y resuelve solo targets conocidos', async () => {
  const modulePath = path.join(FRONTEND_ROOT, 'utils', 'chatbotQuickActions.js');
  const {
    normalizeQuickActions,
    resolveQuickActionTarget,
  } = await import(pathToFileURL(modulePath).href);
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    id: `action-${index}`,
    label: `Acción ${index}`,
    type: 'message',
    message: `Mensaje ${index}`,
  }));
  candidates.splice(1, 0, {
    id: 'external',
    label: 'Sitio externo',
    type: 'navigate',
    target: 'https://example.test',
  });
  assert.equal(normalizeQuickActions(candidates).length, 4);
  assert.equal(normalizeQuickActions(candidates).some((action) => action.id === 'external'), false);
  assert.equal(
    resolveQuickActionTarget(
      { type: 'navigate', target: 'reportes' },
      { pathname: '/dashboard', search: '' },
      {}
    ),
    '/reportes'
  );
  assert.equal(
    resolveQuickActionTarget(
      { type: 'navigate', target: 'expediente_actual' },
      { pathname: '/pacientes/42', search: '?embarazo_id=9' },
      { hasPatientContext: true }
    ),
    '/pacientes/42?embarazo_id=9'
  );
  assert.equal(
    resolveQuickActionTarget(
      { type: 'navigate', target: 'expediente_actual' },
      { pathname: '/dashboard', search: '' },
      { hasPatientContext: false }
    ),
    null
  );
});

test('frontend invalida navegacion obsoleta y solo conserva mensajes de guia activa', async () => {
  const modulePath = path.join(FRONTEND_ROOT, 'utils', 'chatbotQuickActions.js');
  const { visibleQuickActions } = await import(pathToFileURL(modulePath).href);
  const message = {
    quickActionsContextKey: 'expediente|true|true|activo',
    quickActionsGuide: 'control_prenatal',
    quickActions: [
      { id: 'guide-next', label: 'Siguiente', type: 'message', message: 'Siguiente' },
      { id: 'open-record', label: 'Ir al expediente', type: 'navigate', target: 'expediente_actual' },
    ],
  };
  assert.equal(
    visibleQuickActions(message, message.quickActionsContextKey, 'control_prenatal').length,
    2
  );
  assert.deepEqual(
    visibleQuickActions(message, 'expediente|true|true|cerrado', 'control_prenatal')
      .map((action) => action.id),
    ['guide-next']
  );
  assert.deepEqual(
    visibleQuickActions(message, 'dashboard|false|false|ninguno', null),
    []
  );
});

test('revision frontend confirma despacho accesible, fallback unico y limpieza por usuario', () => {
  const widget = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'components', 'ChatbotWidget.jsx'),
    'utf8'
  );
  const layout = fs.readFileSync(path.join(FRONTEND_ROOT, 'components', 'Layout.jsx'), 'utf8');
  const styles = fs.readFileSync(path.join(FRONTEND_ROOT, 'index.css'), 'utf8');
  const handler = widget.match(/const handleQuickAction = [\s\S]+?const sendFeedback/)?.[0] || '';

  assert.match(widget, /usesQuickActions/);
  assert.match(widget, /legacySuggestions = message\.usesQuickActions/);
  assert.match(widget, /type="button"[\s\S]{0,140}disabled=\{loading\}/);
  assert.match(widget, /aria-label=\{action\.label\}/);
  assert.match(widget, /visibleQuickActions\(/);
  assert.match(handler, /sendMessage\(action\.message\)/);
  assert.match(handler, /navigate\(destination\)/);
  assert.match(handler, /lastNavigationRef\.current === navigationKey/);
  assert.doesNotMatch(handler, /api\.post|window\.location/);
  assert.match(widget, /requestInFlightRef\.current/);
  assert.doesNotMatch(widget, /QUICK_PROMPTS/);
  assert.match(layout, /<ChatbotWidget key=\{String\(usuario\?\.id/);
  assert.match(styles, /\.chatbot-suggestions button:focus-visible/);
  assert.match(styles, /white-space:\s*normal/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
});
