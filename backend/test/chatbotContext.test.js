const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const { CONTEXT_RESPONSES } = require('../src/config/chatbotSpecialResponses');
const { answerQuestion } = require('../src/services/chatbotService');
const {
  chatbotContextSchema,
  chatbotMessageSchema,
} = require('../src/validations/chatbot.schemas');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPOSITORY_ROOT, 'frontend', 'src');

const BASE_CONTEXT = Object.freeze({
  route: '/pacientes/:id/expediente',
  module: 'expediente',
  hasPatientContext: true,
  hasPregnancyContext: true,
  pregnancyStatus: 'activo',
  permissions: Object.freeze(['pacientes.editar', 'controles.crear']),
});

function context(overrides = {}) {
  return {
    ...BASE_CONTEXT,
    permissions: [...BASE_CONTEXT.permissions],
    ...overrides,
  };
}

async function loadFrontendContext() {
  const modulePath = path.join(FRONTEND_ROOT, 'utils', 'chatbotContext.js');
  return import(pathToFileURL(modulePath).href);
}

test('mensaje sin contexto conserva exactamente el comportamiento anterior', () => {
  const messages = [
    '¿Cómo agrego un control?',
    '¿Cómo registro una vacuna?',
    '¿Cómo cierro un embarazo?',
    '¿Esta paciente tiene VIH?',
    '¿Qué medicamento debo darle?',
  ];

  for (const message of messages) {
    assert.deepEqual(answerQuestion(message, undefined), answerQuestion(message));
  }
});

test('schema acepta el contrato minimo de contexto', () => {
  const result = chatbotMessageSchema.safeParse({
    mensaje: '¿Cómo agrego un control?',
    context: context(),
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data.context, context());
});

test('schema de contexto rechaza campos clinicos o identificadores adicionales', () => {
  for (const forbiddenField of [
    'patientName',
    'cui',
    'numeroExpediente',
    'telefono',
    'diagnostico',
    'laboratorios',
    'vih',
    'formText',
  ]) {
    const result = chatbotContextSchema.safeParse({
      ...context(),
      [forbiddenField]: 'dato-que-no-debe-entrar',
    });
    assert.equal(result.success, false, `Se acepto el campo prohibido ${forbiddenField}`);
  }
});

test('schema rechaza permisos invalidos, repetidos o con espacios', () => {
  const invalidPermissionLists = [
    ['PACIENTES.EDITAR'],
    ['pacientes'],
    ['pacientes editar'],
    [' pacientes.editar '],
    ['pacientes.editar', 'pacientes.editar'],
  ];

  for (const permissions of invalidPermissionLists) {
    const result = chatbotContextSchema.safeParse(context({ permissions }));
    assert.equal(result.success, false, `Se aceptaron permisos invalidos: ${permissions}`);
  }
});

test('schema rechaza mas de 50 permisos', () => {
  const permissions = Array.from({ length: 51 }, (_, index) => `modulo.permiso_${index}`);
  assert.equal(chatbotContextSchema.safeParse(context({ permissions })).success, false);
});

test('schema exige rutas normalizadas sin IDs ni query y contexto coherente', () => {
  const invalidContexts = [
    context({ route: '/pacientes/123/expediente' }),
    context({ route: '/pacientes/:id/expediente?embarazo_id=99' }),
    context({ module: 'reportes' }),
    context({ hasPatientContext: false }),
    context({ hasPatientContext: false, hasPregnancyContext: true }),
    context({ hasPregnancyContext: false, pregnancyStatus: 'activo' }),
  ];

  for (const candidate of invalidContexts) {
    assert.equal(chatbotContextSchema.safeParse(candidate).success, false);
  }
});

test('embarazo cerrado adapta controles, vacunas, cierre y edicion a solo lectura', () => {
  const closed = context({ pregnancyStatus: 'cerrado' });

  assert.match(answerQuestion('¿Cómo agrego un control?', closed).answer, /solo lectura/);
  assert.match(answerQuestion('¿Cómo registro una vacuna?', closed).answer, /solo lectura/);
  assert.match(answerQuestion('¿Cómo cierro el embarazo?', closed).answer, /ya est. cerrado/);
  assert.equal(answerQuestion('No encuentro el botón para editar', closed).answer, CONTEXT_RESPONSES.editReadOnly);
});

test('falta de permisos adapta respuestas sin afirmar autorizacion real', () => {
  const noPermissions = context({ permissions: [] });

  const control = answerQuestion('¿Cómo agrego un control?', noPermissions);
  const vaccine = answerQuestion('¿Cómo registro una vacuna?', noPermissions);
  const edit = answerQuestion('No encuentro el botón para editar', noPermissions);

  assert.match(control.answer, /controles\.crear/);
  assert.match(vaccine.answer, /controles\.crear/);
  assert.equal(edit.answer, CONTEXT_RESPONSES.editMissingPermission);
  assert.match(`${control.answer} ${vaccine.answer} ${edit.answer}`, /backend|autorizacion real/i);
});

test('contexto completo conserva las guias operativas de control, vacuna y cierre', () => {
  for (const message of [
    '¿Cómo agrego un control?',
    '¿Cómo registro una vacuna?',
    '¿Cómo cierro un embarazo?',
  ]) {
    assert.deepEqual(answerQuestion(message, context()), answerQuestion(message));
  }
});

test('contexto faltante de paciente o embarazo orienta antes de crear registros', () => {
  const dashboard = {
    route: '/dashboard',
    module: 'dashboard',
    hasPatientContext: false,
    hasPregnancyContext: false,
    pregnancyStatus: null,
    permissions: ['controles.crear'],
  };

  assert.match(answerQuestion('¿Cómo agrego un control?', dashboard).answer, /Primero abre el expediente/);
  assert.match(answerQuestion('¿Cómo registro una vacuna?', dashboard).answer, /Primero abre el expediente/);
  assert.match(answerQuestion('¿Cómo cierro el embarazo?', dashboard).answer, /Primero abre el expediente/);
});

test('expediente abierto resume secciones sin indicar buscar paciente', () => {
  const result = answerQuestion('Estoy en el expediente y no sé qué hacer', context());

  assert.equal(result.intent, 'secciones_expediente');
  assert.match(result.answer, /Ya estas dentro del expediente|Ya estás dentro del expediente/);
  assert.doesNotMatch(result.answer, /buscar una paciente/i);
});

test('edicion con permiso y embarazo editable pide identificar la seccion', () => {
  const result = answerQuestion('No encuentro el botón para editar', context());

  assert.equal(result.intent, 'secciones_expediente');
  assert.equal(result.answer, CONTEXT_RESPONSES.editClarification);
  assert.match(result.answer, /qu. secci.n/i);
});

test('usuarios distingue acceso funcional de admin o director sin usarlo como autorizacion', () => {
  const restricted = answerQuestion('¿Cómo creo un usuario?', {
    route: '/usuarios',
    module: 'usuarios',
    hasPatientContext: false,
    hasPregnancyContext: false,
    pregnancyStatus: null,
    permissions: [],
  });
  const allowed = answerQuestion('¿Cómo creo un usuario?', {
    route: '/usuarios',
    module: 'usuarios',
    hasPatientContext: false,
    hasPregnancyContext: false,
    pregnancyStatus: null,
    permissions: ['usuarios.gestionar'],
  });

  assert.match(restricted.answer, /restringida/);
  assert.match(allowed.answer, /administrador o director/);
  assert.match(allowed.answer, /administrador o director/);
  assert.match(allowed.answer, /backend/);
});

test('contexto no modifica guardas de VIH ni consejo de medicamentos', () => {
  for (const message of ['¿Esta paciente tiene VIH?', '¿Qué medicamento debo darle?']) {
    assert.deepEqual(answerQuestion(message, context()), answerQuestion(message));
  }
});

test('clasificar no muta el objeto de contexto recibido', () => {
  const input = context();
  const snapshot = structuredClone(input);

  answerQuestion('¿Cómo agrego un control?', input);
  answerQuestion('¿Cómo registro una vacuna?', input);

  assert.deepEqual(input, snapshot);
});

test('frontend mapea rutas a modulos y normaliza identificadores', async () => {
  const { normalizeChatbotLocation } = await loadFrontendContext();
  const cases = [
    ['/dashboard', '/dashboard', 'dashboard'],
    ['/pacientes', '/pacientes', 'pacientes'],
    ['/pacientes/8472', '/pacientes/:id/expediente', 'expediente'],
    ['/pacientes/8472/controles/91/editar', '/pacientes/:id/controles/:id/editar', 'expediente'],
    ['/reportes', '/reportes', 'reportes'],
    ['/usuarios', '/usuarios', 'usuarios'],
  ];

  for (const [pathname, route, module] of cases) {
    assert.deepEqual(normalizeChatbotLocation(pathname), { route, module });
  }
});

test('frontend construye solo contexto seguro con datos ya disponibles', async () => {
  const { buildChatbotContext } = await loadFrontendContext();
  const safeContext = buildChatbotContext({
    pathname: '/pacientes/987654',
    search: '?embarazo_id=456789&tab=laboratorios&cui=1234567890101',
    pregnancyStatus: 'activo',
    usuario: {
      id: 44,
      nombres: 'Paciente Privada',
      cui: '1234567890101',
      telefono: '55551234',
      diagnostico: 'dato clinico',
      permisos: ['pacientes.editar', 'controles.crear', 'CODIGO INVALIDO'],
      rol: 'personal',
    },
  });

  assert.deepEqual(Object.keys(safeContext), [
    'route',
    'module',
    'hasPatientContext',
    'hasPregnancyContext',
    'pregnancyStatus',
    'permissions',
  ]);
  assert.deepEqual(safeContext, context());

  const serialized = JSON.stringify(safeContext);
  for (const forbiddenValue of [
    '987654',
    '456789',
    '1234567890101',
    'Paciente Privada',
    '55551234',
    'dato clinico',
    'laboratorios',
  ]) {
    assert.equal(serialized.includes(forbiddenValue), false);
  }
});

test('frontend reconoce admin y director para guia de usuarios, no otros roles', async () => {
  const { buildChatbotContext } = await loadFrontendContext();
  const buildForRole = (rol) => buildChatbotContext({
    pathname: '/usuarios',
    usuario: { rol, permisos: [] },
  }).permissions;

  assert.deepEqual(buildForRole('admin'), ['usuarios.gestionar']);
  assert.deepEqual(buildForRole('director'), ['usuarios.gestionar']);
  assert.deepEqual(buildForRole('personal'), []);
});

test('integracion frontend no agrega consultas ni lee contenido de formularios', () => {
  const widget = fs.readFileSync(path.join(FRONTEND_ROOT, 'components', 'ChatbotWidget.jsx'), 'utf8');
  const builder = fs.readFileSync(path.join(FRONTEND_ROOT, 'utils', 'chatbotContext.js'), 'utf8');
  const provider = fs.readFileSync(path.join(FRONTEND_ROOT, 'context', 'ChatbotScreenContext.jsx'), 'utf8');
  const expediente = fs.readFileSync(path.join(FRONTEND_ROOT, 'pages', 'ExpedientePaciente.jsx'), 'utf8');

  assert.doesNotMatch(`${widget}\n${builder}\n${provider}`, /api\.get\s*\(/);
  assert.equal((widget.match(/api\.post\s*\(/g) || []).length, 2);
  assert.match(widget, /mensaje:\s*cleanText[\s\S]*context:\s*safeContext[\s\S]*conversation:\s*safeConversation/);
  assert.match(expediente, /setPregnancyStatus\(estadoEmbarazo\)/);
  assert.doesNotMatch(builder, /querySelector|FormData|innerText|textContent/);
});
