const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { chatbotFieldHelp } = require('../src/config/chatbotFieldHelp');
const { answerQuestion } = require('../src/services/chatbotService');
const { chatbotContextSchema } = require('../src/validations/chatbot.schemas');

const patientCreate = {
  route: '/nuevo', module: 'pacientes', hasPatientContext: false, hasPregnancyContext: false,
  pregnancyStatus: null, permissions: ['pacientes.crear'], section: null, tab: null,
  form: 'nueva_paciente', focusedField: 'paciente_fur',
};
const patientEdit = {
  ...patientCreate, route: '/pacientes/:id/editar', module: 'expediente',
  hasPatientContext: true, form: 'editar_paciente', section: 'expediente',
};
const risk = {
  ...patientEdit, route: '/pacientes/:id/riesgo', hasPregnancyContext: true,
  form: 'ficha_riesgo', section: 'ficha_riesgo', focusedField: 'riesgo_referida_a',
};
const frontend = (name) => import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils', name)).href);

test('catálogo añade solo campos existentes de Paciente y Ficha de riesgo con IDs únicos', () => {
  const ids = chatbotFieldHelp.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['paciente_no_expediente', 'paciente_cui', 'paciente_nombres',
    'paciente_apellidos', 'paciente_fecha_nacimiento', 'paciente_comunidad',
    'paciente_telefono', 'paciente_pueblo', 'paciente_estado_civil',
    'paciente_nivel_estudios', 'paciente_profesion_oficio', 'paciente_fur',
    'paciente_fpp', 'paciente_gestas_previas', 'paciente_partos',
    'paciente_abortos', 'paciente_cesareas', 'paciente_hijos_viven',
    'riesgo_fecha', 'riesgo_telefono', 'riesgo_pueblo', 'riesgo_estado_civil',
    'riesgo_escolaridad', 'riesgo_ocupacion', 'riesgo_fecha_ultima_regla',
    'riesgo_fecha_probable_parto', 'riesgo_tiempo_horas', 'riesgo_referida_a',
    'riesgo_nombre_personal_atendio', 'riesgo_no_embarazos', 'riesgo_distancia_servicio_km']) {
    assert.ok(ids.includes(id), id);
  }
  assert.match(chatbotFieldHelp.find(({ id }) => id === 'paciente_fpp').expected, /calcula.*permite editarla/);
  assert.match(chatbotFieldHelp.find(({ id }) => id === 'paciente_fecha_nacimiento').help, /calcula la edad/);
});

test('FUR y FPP explican significado y formulario antes del cálculo', () => {
  assert.match(answerQuestion('¿Qué significa FUR?').answer, /Fecha de Última Regla/);
  assert.match(answerQuestion('¿Qué es FPP?').answer, /Fecha Probable de Parto/);
  assert.equal(answerQuestion('¿Qué significa FUR?', patientCreate).intent, 'ayuda_campo');
  assert.match(answerQuestion('¿Qué significa FUR?', patientCreate).answer, /propone una FPP/);
  assert.match(answerQuestion('¿Qué significa FUR?', risk).answer, /Ficha de riesgo/);
  assert.equal(answerQuestion('¿Cómo calculo la FPP?').intent, 'calcular_fpp');
});

test('aliases resuelven gestas, expediente y referencia sin decidir factores clínicos', () => {
  assert.match(answerQuestion('¿Qué significa gestas?', patientCreate).answer, /gestas previas/);
  assert.match(answerQuestion('¿Qué significa embarazos anteriores?', patientCreate).answer, /gestas previas/);
  assert.match(answerQuestion('¿Qué significa número de expediente?', patientCreate).answer, /expediente/);
  assert.match(answerQuestion('¿Qué va en Referida a?', risk).answer, /destino de referencia/);
  assert.notEqual(answerQuestion('¿Debo marcar este factor?', risk).intent, 'ayuda_campo');
  assert.equal(answerQuestion('¿Debo marcar este factor?', risk).intent, 'solicitud_consejo_clinico');
});

test('focusedField acepta ambos formularios de paciente y riesgo, rechaza cruces', () => {
  for (const context of [patientCreate, patientEdit, risk]) {
    assert.equal(chatbotContextSchema.safeParse(context).success, true);
  }
  for (const context of [
    { ...patientCreate, focusedField: 'riesgo_referida_a' },
    { ...patientEdit, focusedField: 'riesgo_fecha' },
    { ...risk, focusedField: 'paciente_fur' },
    { ...risk, form: 'editar_paciente' },
  ]) assert.equal(chatbotContextSchema.safeParse(context).success, false);
});

test('frontend conserva solo ID permitido y limpia foco al cambiar ruta o formulario', async () => {
  const { buildChatbotContext } = await frontend('chatbotContext.js');
  const { captureFormField, currentFormField, patientFieldId, riskFieldId } = await frontend('chatbotFocusedField.js');
  assert.equal(patientFieldId('fur'), 'paciente_fur');
  assert.equal(riskFieldId('referida_a'), 'riesgo_referida_a');
  const focus = captureFormField('paciente_fur', 'nueva_paciente', 'ruta-1');
  assert.equal(currentFormField(focus, 'ruta-1'), 'paciente_fur');
  assert.equal(currentFormField(focus, 'ruta-2'), null);
  assert.equal(captureFormField('riesgo_referida_a', 'nueva_paciente', 'ruta-1'), null);
  const sensitive = { cui: '1234567890101', no_expediente: 'EXP-77', nombres: 'Nombre Privado', fur: '2026-01-01' };
  const created = buildChatbotContext({ pathname: '/nuevo', usuario: { ...sensitive, permisos: [] }, focusedField: 'paciente_fur' });
  const edited = buildChatbotContext({ pathname: '/pacientes/77/editar', usuario: sensitive, focusedField: 'paciente_fur' });
  const left = buildChatbotContext({ pathname: '/dashboard', usuario: sensitive, focusedField: 'paciente_fur' });
  const riskScreen = buildChatbotContext({ pathname: '/pacientes/77/riesgo', usuario: sensitive, focusedField: 'paciente_fur' });
  const riskFocus = captureFormField('riesgo_referida_a', 'ficha_riesgo', 'embarazo-1');
  assert.equal(currentFormField(riskFocus, 'embarazo-2'), null);
  const activeRisk = buildChatbotContext({ pathname: '/pacientes/77/riesgo', usuario: sensitive, focusedField: currentFormField(riskFocus, 'embarazo-1') });
  const leftRisk = buildChatbotContext({ pathname: '/pacientes/77', usuario: sensitive, focusedField: currentFormField(riskFocus, 'embarazo-2') });
  assert.deepEqual([created.focusedField, edited.focusedField, left.focusedField, riskScreen.focusedField],
    ['paciente_fur', 'paciente_fur', null, null]);
  assert.equal(chatbotContextSchema.safeParse(created).success, true);
  assert.equal(chatbotContextSchema.safeParse(edited).success, true);
  assert.equal(activeRisk.focusedField, 'riesgo_referida_a');
  assert.equal(leftRisk.focusedField, null);
  assert.equal(chatbotContextSchema.safeParse(activeRisk).success, true);
  for (const value of Object.values(sensitive)) assert.equal(JSON.stringify(created).includes(value), false);
  assert.equal(answerQuestion('¿Qué pongo aquí?', created).intent, 'ayuda_campo_contextual');
  assert.equal(answerQuestion('¿Qué pongo aquí?', left).intent, 'ayuda_campo_sin_foco');
});

test('instrumentación lee solo data-chatbot-field y no valores ni texto del DOM', () => {
  for (const file of ['NuevaPaciente.jsx', 'FichaRiesgo.jsx']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages', file), 'utf8');
    assert.match(source, /captureFormField\(event\.target\.dataset\.chatbotField/);
    assert.doesNotMatch(source.match(/onFocusCapture=\{\(event\) => \{[\s\S]*?\}\}/)?.[0] || '', /\.value|innerText|textContent|querySelector/);
  }
});

test('saludo no desplaza solicitud clínica; guías y ayuda previa permanecen', () => {
  assert.equal(answerQuestion('Hola, ¿la paciente tiene VIH?').intent, 'solicitud_dato_clinico');
  assert.equal(answerQuestion('¿La paciente tiene VIH?').intent, 'solicitud_dato_clinico');
  assert.equal(answerQuestion('¿Dónde registro VIH?').intent, 'laboratorio');
  assert.equal(answerQuestion('¿Qué pongo aquí?', {
    route: '/pacientes/:id/controles/nuevo', section: 'control_prenatal', form: 'nuevo_control',
    tab: 'laboratorio', focusedField: 'vih',
  }).intent, 'ayuda_campo_contextual');
  const guide = { lastIntent: 'registrar_paciente', activeGuide: 'registrar_paciente', currentStep: 1, totalSteps: 6 };
  const response = answerQuestion('¿Qué pongo aquí?', patientCreate, guide);
  assert.equal(response.conversation.activeGuide, 'registrar_paciente');
});
