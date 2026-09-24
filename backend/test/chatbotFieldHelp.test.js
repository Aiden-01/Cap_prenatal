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
  assert.deepEqual(chatbotFieldHelp.map(({ id }) => id), [
    'numero_control', 'cita_siguiente', 'acompanante', 'semanas_gestacion', 'hematologia', 'vih',
  ]);
  assert.match(chatbotFieldHelp.find(({ id }) => id === 'hematologia').operationalNote, /no identifica.*hemoglobina/i);
});

test('formulario instrumenta únicamente IDs piloto desde atributos explícitos', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/NuevoControl.jsx'), 'utf8');
  assert.match(source, /onFocusCapture=\{\(event\) => \{/);
  assert.match(source, /captureControlField\(event\.target\.dataset\.chatbotField, tab, location\.key\)/);
  for (const id of chatbotFieldHelp.map((field) => field.id)) {
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
