const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { chatbotFieldHelp } = require('../src/config/chatbotFieldHelp');
const { answerQuestion } = require('../src/services/chatbotService');
const { chatbotContextSchema } = require('../src/validations/chatbot.schemas');

const vaccine = {
  route: '/pacientes/:id/vacunas/nuevo', module: 'expediente',
  hasPatientContext: true, hasPregnancyContext: true, pregnancyStatus: 'activo',
  permissions: ['controles.crear'], section: 'vacunas', tab: null,
  form: 'nueva_vacuna', focusedField: 'vacuna_momento',
};
const puerperium = {
  ...vaccine, route: '/pacientes/:id/puerperio/nuevo',
  section: 'puerperio', form: 'nuevo_puerperio', focusedField: 'puerperio_numero_atencion',
};
const frontend = (name) => import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils', name)).href);

test('catálogo añade cuatro campos reales de Vacunas y diez de Puerperio', () => {
  const vaccineIds = chatbotFieldHelp.filter(({ section }) => section === 'vacunas').map(({ id }) => id);
  const puerperiumIds = chatbotFieldHelp.filter(({ section }) => section === 'puerperio').map(({ id }) => id);
  assert.deepEqual(vaccineIds, ['vacuna_tipo_vacuna', 'vacuna_numero_dosis', 'vacuna_momento', 'vacuna_fecha_dosis']);
  assert.deepEqual(puerperiumIds, [
    'puerperio_numero_atencion', 'puerperio_fecha', 'puerperio_dias_despues_parto',
    'puerperio_lugar_atencion_parto', 'puerperio_quien_atendio_parto', 'puerperio_tipo_parto',
    'puerperio_recien_nacido_vivo', 'puerperio_tuvo_apego_inmediato',
    'puerperio_lactancia_materna_exclusiva', 'puerperio_nombre_cargo_atiende',
  ]);
  assert.match(chatbotFieldHelp.find(({ id }) => id === 'vacuna_tipo_vacuna').operationalNote, /3 dosis y 2 refuerzos.*una aplicación por embarazo.*temporada.*2 dosis/);
  assert.match(chatbotFieldHelp.find(({ id }) => id === 'vacuna_numero_dosis').operationalNote, /No aparece para Influenza/);
});

test('ayuda explícita resuelve label y alias en ambos módulos', () => {
  assert.match(answerQuestion('¿Qué significa momento?', vaccine).answer, /Previo al embarazo.*Durante el embarazo.*Postparto/);
  assert.match(answerQuestion('¿Qué va en posición\/dosis?', vaccine).answer, /TD ofrece Dosis 1/);
  assert.match(answerQuestion('¿Qué significa número de atención?', puerperium).answer, /primera o segunda/);
  assert.match(answerQuestion('¿Qué va en días después del parto?', puerperium).answer, /0 y 60/);
  assert.match(answerQuestion('¿Qué significa RN vivo?', puerperium).answer, /recién nacido vivo/);
});

test('foco genérico usa el catálogo y no acepta campo de otro formulario', () => {
  assert.equal(chatbotContextSchema.safeParse(vaccine).success, true);
  assert.equal(chatbotContextSchema.safeParse(puerperium).success, true);
  assert.match(answerQuestion('¿Qué pongo aquí?', vaccine).answer, /Vacunas → Momento de aplicación/);
  assert.match(answerQuestion('¿Qué pongo aquí?', puerperium).answer, /Puerperio → No. atención/);
  for (const invalid of [
    { ...vaccine, focusedField: 'puerperio_numero_atencion' },
    { ...puerperium, focusedField: 'vacuna_momento' },
    { ...vaccine, form: 'editar_puerperio' },
  ]) {
    assert.equal(chatbotContextSchema.safeParse(invalid).success, false);
    assert.equal(answerQuestion('¿Qué pongo aquí?', invalid).intent, 'ayuda_campo_sin_foco');
  }
  assert.equal(answerQuestion('¿Qué pongo aquí?', { ...vaccine, focusedField: null }).intent, 'ayuda_campo_sin_foco');
});

test('foco se limpia al cambiar ruta, formulario o embarazo y no envía valores', async () => {
  const { captureFormField, currentFormField, vaccineFieldId, puerperiumFieldId } = await frontend('chatbotFocusedField.js');
  const { buildChatbotContext } = await frontend('chatbotContext.js');
  assert.equal(vaccineFieldId('momento'), 'vacuna_momento');
  assert.equal(puerperiumFieldId('dias_despues_parto'), 'puerperio_dias_despues_parto');
  const focus = captureFormField('vacuna_momento', 'nueva_vacuna', 'embarazo-1');
  assert.equal(currentFormField(focus, 'embarazo-1'), 'vacuna_momento');
  assert.equal(currentFormField(focus, 'embarazo-2'), null);
  assert.equal(captureFormField('puerperio_numero_atencion', 'nueva_vacuna', 'embarazo-1'), null);
  const sensitive = { nombres: 'Nombre Privado', cui: '1234567890101', resultado: 'Dato clínico' };
  const active = buildChatbotContext({ pathname: '/pacientes/77/vacunas/nuevo', search: '?embarazo_id=99', usuario: sensitive, focusedField: 'vacuna_momento' });
  const otherForm = buildChatbotContext({ pathname: '/pacientes/77/puerperio/nuevo', usuario: sensitive, focusedField: 'vacuna_momento' });
  const left = buildChatbotContext({ pathname: '/dashboard', usuario: sensitive, focusedField: 'vacuna_momento' });
  assert.deepEqual([active.focusedField, otherForm.focusedField, left.focusedField], ['vacuna_momento', null, null]);
  assert.equal(chatbotContextSchema.safeParse(active).success, true);
  for (const value of Object.values(sensitive)) assert.equal(JSON.stringify(active).includes(value), false);
});

test('formularios y selectores capturan solo IDs declarados', () => {
  for (const file of ['VacunaForm.jsx', 'PuerperioForm.jsx']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages', file), 'utf8');
    assert.match(source, /captureFormField\(event\.target\.dataset\.chatbotField/);
    assert.match(source, /setFocusedField\(null\)/);
  }
  const selectors = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/VaccineFlow.jsx'), 'utf8');
  assert.match(selectors, /data-chatbot-field=\{chatbotField\}/);
});

test('embarazo cerrado, guarda clínica y ayuda de fases anteriores permanecen', () => {
  assert.match(answerQuestion('¿Cómo registro una vacuna?', { ...vaccine, pregnancyStatus: 'cerrado' }).answer, /solo lectura/);
  assert.equal(answerQuestion('¿La paciente tiene VIH?', vaccine).intent, 'solicitud_dato_clinico');
  assert.equal(answerQuestion('¿Qué pongo aquí?', {
    route: '/pacientes/:id/controles/nuevo', section: 'control_prenatal',
    form: 'nuevo_control', tab: 'laboratorio', focusedField: 'vih',
  }).intent, 'ayuda_campo_contextual');
  assert.equal(answerQuestion('¿Qué significa FUR?').intent, 'ayuda_campo');
  assert.notEqual(answerQuestion('¿Debe aplicarse Tdap?', vaccine).intent, 'ayuda_campo');
});
