const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { chatbotFieldHelp } = require('../src/config/chatbotFieldHelp');
const { answerQuestion } = require('../src/services/chatbotService');
const { chatbotContextSchema } = require('../src/validations/chatbot.schemas');

const control = {
  route: '/pacientes/:id/controles/nuevo', module: 'expediente',
  hasPatientContext: true, hasPregnancyContext: true, pregnancyStatus: 'activo',
  permissions: ['pacientes.ver', 'controles.crear'], section: 'control_prenatal',
  tab: 'laboratorio', form: 'nuevo_control', focusedField: 'vih',
};

const frontend = (name) => import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils', name)).href);

test('catálogo piloto tiene seis IDs únicos y no equipara hematología con hemoglobina', () => {
  assert.deepEqual(chatbotFieldHelp.slice(0, 6).map(({ id }) => id), [
    'numero_control', 'cita_siguiente', 'acompanante', 'semanas_gestacion', 'hematologia', 'vih',
  ]);
  assert.match(chatbotFieldHelp.find(({ id }) => id === 'hematologia').operationalNote, /no identifica.*hemoglobina/i);
});

test('formulario instrumenta únicamente IDs piloto desde atributos explícitos', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/NuevoControl.jsx'), 'utf8');
  assert.match(source, /onFocusCapture=\{\(event\) => \{/);
  assert.match(source, /captureControlField\(event\.target\.dataset\.chatbotField, tab, location\.key\)/);
  for (const id of chatbotFieldHelp.slice(0, 6).map((field) => field.id)) {
    assert.match(source, new RegExp(`(?:data-chatbot-field|chatbotField)="${id}"`));
  }
});

test('focusedField acepta solo ID conocido compatible con sección, pestaña y formulario', () => {
  assert.equal(chatbotContextSchema.safeParse(control).success, true);
  for (const candidate of [
    { focusedField: 'desconocido' },
    { focusedField: 'cita_siguiente' },
    { tab: 'general' },
    { section: 'reportes' },
    { form: 'editar_paciente' },
    { focusedField: 'texto libre' },
  ]) {
    assert.equal(chatbotContextSchema.safeParse({ ...control, ...candidate }).success, false);
  }
  for (const forbidden of ['value', 'patientName', 'CUI', 'expediente', 'resultado', 'observacion', 'inputText']) {
    assert.equal(chatbotContextSchema.safeParse({ ...control, [forbidden]: 'dato privado' }).success, false);
  }
  assert.equal(chatbotContextSchema.safeParse({ ...control, focusedField: null }).success, true);
});

test('foco conserva último campo al abrir Lía y se limpia al cambiar pestaña, ruta o embarazo', async () => {
  const { captureControlField, currentControlField } = await frontend('chatbotFocusedField.js');
  const { buildChatbotContext } = await frontend('chatbotContext.js');
  const focus = captureControlField('vih', 'laboratorio', 'navegacion-1');
  assert.equal(currentControlField(focus, 'laboratorio', 'navegacion-1'), 'vih');
  assert.equal(currentControlField(focus, 'general', 'navegacion-1'), null);
  assert.equal(currentControlField(focus, 'laboratorio', 'navegacion-2'), null);
  assert.equal(captureControlField('cita_siguiente', 'laboratorio', 'navegacion-1'), null);
  const base = { usuario: { permisos: ['controles.crear'] }, pregnancyStatus: 'activo' };
  const active = buildChatbotContext({ ...base, pathname: '/pacientes/123/controles/nuevo', screenTab: 'laboratorio', focusedField: 'vih' });
  assert.equal(active.focusedField, 'vih');
  assert.equal(chatbotContextSchema.safeParse(active).success, true);
  assert.equal(buildChatbotContext({ ...base, pathname: '/pacientes/123/controles/nuevo', screenTab: 'general', focusedField: 'vih' }).focusedField, null);
  assert.equal(buildChatbotContext({ ...base, pathname: '/dashboard', screenTab: 'laboratorio', focusedField: 'vih' }).focusedField, null);
  const serialized = JSON.stringify(active);
  for (const privateValue of ['123', 'value', 'patientName', 'CUI', 'resultado', 'observacion']) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test('ayuda explícita usa label y alias sin reemplazar orientación de VIH ni guarda clínica', () => {
  for (const question of ['¿Qué significa cita siguiente?', '¿Qué va en acompañante?', '¿Qué significa número de control?', '¿Dónde registro hematología?']) {
    assert.equal(answerQuestion(question).intent, 'ayuda_campo', question);
  }
  assert.equal(answerQuestion('¿Dónde registro VIH?').intent, 'laboratorio');
  assert.equal(answerQuestion('¿La paciente tiene VIH?').intent, 'solicitud_dato_clinico');
  assert.notEqual(answerQuestion('¿Qué pongo aquí?').intent, 'ayuda_campo');
  assert.notEqual(answerQuestion('¿Qué significa hemoglobina?').intent, 'ayuda_campo');
});

test('ayuda por campo conserva una guía activa', () => {
  const state = { lastIntent: 'control_prenatal', activeGuide: 'control_prenatal', currentStep: 1, totalSteps: 6 };
  const response = answerQuestion('¿Qué significa cita siguiente?', control, state);
  assert.equal(response.intent, 'ayuda_campo');
  assert.equal(response.conversation.activeGuide, 'control_prenatal');
});

test('preguntas genéricas resuelven varios campos solo desde focusedField compatible', () => {
  const cases = [
    ['¿Qué pongo aquí?', 'acompanante', 'general', /Nombre del acompañante/],
    ['¿Qué va aquí?', 'cita_siguiente', 'general', /Cita siguiente/],
    ['¿Qué significa este campo?', 'numero_control', 'general', /No\. Control/],
    ['No entiendo este recuadro', 'hematologia', 'laboratorio', /Hematología/],
    ['¿Para qué sirve este campo?', 'vih', 'laboratorio', /VIH/],
    ['No entiendo este campo', 'semanas_gestacion', 'general', /Semanas de gestación/],
    ['¿Qué debo escribir aquí?', 'acompanante', 'general', /acompañante/],
    ['¿Qué dato va aquí?', 'vih', 'laboratorio', /VIH/],
  ];
  for (const [question, focusedField, tab, expected] of cases) {
    const response = answerQuestion(question, { ...control, focusedField, tab });
    assert.equal(response.intent, 'ayuda_campo_contextual', question);
    assert.match(response.answer, expected);
  }
});

test('sin foco o con contexto parcial pide el nombre del campo sin inventar', () => {
  for (const context of [undefined, { ...control, focusedField: null }, { ...control, focusedField: undefined }]) {
    const response = answerQuestion('¿Qué pongo aquí?', context);
    assert.equal(response.intent, 'ayuda_campo_sin_foco');
    assert.match(response.answer, /Dime el nombre/);
    assert.doesNotMatch(response.answer, /resultado registrado para VIH/);
  }
  const partial = answerQuestion('¿Qué va aquí?', { ...control, tab: 'laboratorio', focusedField: null });
  assert.match(partial.answer, /Control prenatal → Laboratorio/);
});

test('campo incompatible o foco obsoleto nunca produce la respuesta del campo anterior', async () => {
  const { buildChatbotContext } = await frontend('chatbotContext.js');
  const { currentControlField, captureControlField } = await frontend('chatbotFocusedField.js');
  const focus = captureControlField('vih', 'laboratorio', 'embarazo-1');
  assert.equal(currentControlField(focus, 'general', 'embarazo-1'), null);
  assert.equal(currentControlField(focus, 'laboratorio', 'embarazo-2'), null);
  for (const stale of [
    { ...control, tab: 'general' },
    { ...control, section: 'expediente' },
    { ...control, route: '/pacientes/:id/expediente', form: null },
  ]) {
    const answer = answerQuestion('¿Qué pongo aquí?', stale);
    assert.equal(answer.intent, 'ayuda_campo_sin_foco');
    assert.doesNotMatch(answer.answer, /resultado registrado para VIH/);
  }
  const base = { usuario: { permisos: ['controles.crear'] }, pregnancyStatus: 'activo' };
  const general = buildChatbotContext({ ...base, pathname: '/pacientes/123/controles/nuevo', screenTab: 'general', focusedField: currentControlField(focus, 'general', 'embarazo-1') });
  const elsewhere = buildChatbotContext({ ...base, pathname: '/dashboard', screenTab: 'laboratorio', focusedField: currentControlField(focus, 'laboratorio', 'embarazo-2') });
  assert.equal(answerQuestion('¿Qué pongo aquí?', general).intent, 'ayuda_campo_sin_foco');
  assert.equal(answerQuestion('¿Qué pongo aquí?', elsewhere).intent, 'ayuda_campo_sin_foco');
});

test('guía activa conserva paso tras pregunta contextual con y sin campo', () => {
  const state = { lastIntent: 'control_prenatal', activeGuide: 'control_prenatal', currentStep: 1, totalSteps: 6 };
  for (const context of [control, { ...control, focusedField: null }]) {
    const response = answerQuestion('¿Qué pongo aquí?', context, state);
    assert.equal(response.conversation.activeGuide, 'control_prenatal');
    assert.equal(response.conversation.currentStep, 1);
    assert.doesNotMatch(response.answer, /cerramos? la guía/i);
  }
});

test('prioridades conservan guarda clínica, ayuda explícita y orientación operacional', () => {
  assert.equal(answerQuestion('¿La paciente tiene VIH?', control).intent, 'solicitud_dato_clinico');
  assert.equal(answerQuestion('¿Dónde registro VIH?', control).intent, 'laboratorio');
  assert.equal(answerQuestion('¿Qué significa cita siguiente?', control).intent, 'ayuda_campo');
  assert.equal(answerQuestion('Hola', control).intent, 'saludo');
  assert.equal(answerQuestion('Gracias', control).intent, 'agradecimiento');
});
