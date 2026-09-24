const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { chatbotFieldHelp } = require('../src/config/chatbotFieldHelp');
const { chatbotGuides } = require('../src/config/chatbotGuides');
const { answerQuestion } = require('../src/services/chatbotService');
const { chatbotContextSchema } = require('../src/validations/chatbot.schemas');

const morbidity = {
  route: '/pacientes/:id/morbilidad/nuevo', module: 'expediente',
  hasPatientContext: true, hasPregnancyContext: true, pregnancyStatus: 'activo',
  permissions: [], section: 'morbilidad', tab: null,
  form: 'nueva_morbilidad', focusedField: 'morbilidad_motivo_consulta',
};
const birthPlan = {
  ...morbidity, route: '/pacientes/:id/plan-parto', section: 'plan_parto',
  form: 'plan_parto', focusedField: 'plan_parto_lugar_atencion_parto',
};
const frontend = (name) => import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils', name)).href);

test('catálogo cubre campos reales y distingue datos precargados de calculados', () => {
  const ids = chatbotFieldHelp.filter(({ section }) => ['morbilidad', 'plan_parto'].includes(section)).map(({ id }) => id);
  for (const id of [
    'morbilidad_motivo_consulta', 'morbilidad_historia_enfermedad_actual',
    'morbilidad_revision_por_sistemas', 'morbilidad_examen_fisico',
    'morbilidad_impresion_clinica', 'morbilidad_tratamiento_referencia',
    'morbilidad_nombre_cargo_atiende', 'plan_parto_no_registro',
    'plan_parto_fur', 'plan_parto_fecha_probable_parto',
    'plan_parto_edad_gestacional_semanas', 'plan_parto_lugar_atencion_parto',
    'plan_parto_como_trasladara', 'plan_parto_acompana_parto',
    'plan_parto_responsable_activar', 'plan_parto_peligro_hemorragia_vaginal',
  ]) assert.ok(ids.includes(id), id);
  assert.match(chatbotFieldHelp.find(({ id }) => id === 'plan_parto_edad_gestacional_semanas').expected, /solo lectura.*calcula/);
  assert.match(chatbotFieldHelp.find(({ id }) => id === 'plan_parto_fecha_probable_parto').expected, /precargarse.*no la recalcula/);
  assert.equal(ids.some((id) => id === 'morbilidad_cargo'), false);
});

test('preguntas explícitas y aliases resuelven ayuda operativa sin consejo clínico', () => {
  assert.match(answerQuestion('¿Qué significa motivo de consulta?', morbidity).answer, /Documenta el motivo/);
  assert.match(answerQuestion('¿Qué va en historia de enfermedad actual?', morbidity).answer, /área de texto libre/);
  assert.match(answerQuestion('¿Qué significa historia actual?', morbidity).answer, /historia de la enfermedad actual/);
  const treatment = answerQuestion('¿Qué va en Tratamiento / Referencia?', morbidity);
  assert.equal(treatment.intent, 'ayuda_campo');
  assert.match(treatment.answer, /tratamiento indicado o la referencia realizada por el personal responsable/);
  assert.doesNotMatch(treatment.answer, /debes (?:indicar|recetar|referir)/i);
  const impression = answerQuestion('¿Qué significa impresión clínica?', morbidity);
  assert.equal(impression.intent, 'ayuda_campo');
  assert.match(impression.answer, /Lía no formula diagnósticos/);
  assert.match(answerQuestion('¿Qué va en persona que acompaña?', birthPlan).answer, /Esposo, Comadrona o Familiar/);
});

test('pregunta genérica usa solo el campo compatible y explica el plan', () => {
  assert.equal(chatbotContextSchema.safeParse(morbidity).success, true);
  assert.equal(chatbotContextSchema.safeParse(birthPlan).success, true);
  assert.match(answerQuestion('¿Qué pongo aquí?', morbidity).answer, /Morbilidad → Motivo de consulta/);
  assert.match(answerQuestion('¿Qué significa este campo?', birthPlan).answer, /Plan de parto → Lugar de atención del parto/);
  const preload = answerQuestion('¿Qué datos vienen precargados?', birthPlan);
  assert.equal(preload.intent, 'ayuda_campo');
  assert.match(preload.answer, /expediente.*ficha de riesgo.*solo lectura/);
  assert.equal(answerQuestion('¿Qué datos vienen precargados?', morbidity).intent === 'ayuda_campo', false);
});

test('contexto rechaza campo de otro formulario y elimina foco obsoleto', async () => {
  const { captureFormField, currentFormField, morbidityFieldId, birthPlanFieldId } = await frontend('chatbotFocusedField.js');
  const { buildChatbotContext } = await frontend('chatbotContext.js');
  assert.equal(morbidityFieldId('tratamiento_referencia'), 'morbilidad_tratamiento_referencia');
  assert.equal(birthPlanFieldId('acompana_parto'), 'plan_parto_acompana_parto');
  assert.equal(captureFormField('morbilidad_motivo_consulta', 'plan_parto', 'route-1'), null);
  const snapshot = captureFormField('morbilidad_motivo_consulta', 'nueva_morbilidad', 'route-1');
  assert.equal(currentFormField(snapshot, 'route-1'), snapshot.id);
  assert.equal(currentFormField(snapshot, 'route-2'), null);
  for (const context of [
    { ...morbidity, focusedField: 'plan_parto_lugar_atencion_parto' },
    { ...birthPlan, focusedField: 'morbilidad_motivo_consulta' },
    { ...morbidity, form: 'editar_morbilidad', focusedField: 'plan_parto_fur' },
  ]) {
    assert.equal(chatbotContextSchema.safeParse(context).success, false);
    assert.equal(answerQuestion('¿Qué pongo aquí?', context).intent, 'ayuda_campo_sin_foco');
  }
  const sensitive = { nombres: 'Nombre Privado', cui: '1234567890101', observacion: 'Texto clínico secreto' };
  const active = buildChatbotContext({ pathname: '/pacientes/7/morbilidad/nuevo', search: '?embarazo_id=2', usuario: sensitive, focusedField: snapshot.id });
  const otherModule = buildChatbotContext({ pathname: '/pacientes/7/plan-parto', search: '?embarazo_id=2', usuario: sensitive, focusedField: snapshot.id });
  const dashboard = buildChatbotContext({ pathname: '/dashboard', usuario: sensitive, focusedField: snapshot.id });
  assert.deepEqual([active.focusedField, otherModule.focusedField, dashboard.focusedField], [snapshot.id, null, null]);
  assert.equal(chatbotContextSchema.safeParse(active).success, true);
  for (const value of Object.values(sensitive)) assert.equal(JSON.stringify(active).includes(value), false);
});

test('formularios capturan solo IDs y limpian foco al cambiar ruta o embarazo', () => {
  for (const file of ['MorbilidadForm.jsx', 'PlanPartoForm.jsx']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages', file), 'utf8');
    assert.match(source, /captureFormField\(event\.target\.dataset\.chatbotField/);
    assert.match(source, /setFocusedField\(null\)/);
    assert.match(source, /location\.key/);
    assert.doesNotMatch(source, /event\.target\.(?:value|innerText)/);
  }
});

test('impresión centralizada, guarda clínica, ayuda anterior y seis guías siguen vigentes', () => {
  const print = answerQuestion('¿Cómo imprimo el plan de parto?', birthPlan);
  assert.equal(print.intent, 'imprimir_plan_parto');
  assert.match(print.answer, /Documentos individuales.*Todo en un solo PDF/);
  assert.match(answerQuestion('¿Cómo imprimo todo junto?').answer, /Expediente → Plan de parto → Ficha de riesgo/);
  assert.equal(answerQuestion('¿La paciente tiene VIH?', morbidity).intent, 'solicitud_dato_clinico');
  assert.equal(answerQuestion('¿Qué pongo aquí?', {
    route: '/pacientes/:id/controles/nuevo', section: 'control_prenatal',
    form: 'nuevo_control', tab: 'laboratorio', focusedField: 'vih',
  }).intent, 'ayuda_campo_contextual');
  assert.equal(answerQuestion('¿Qué significa momento?', {
    route: '/pacientes/:id/vacunas/nuevo', section: 'vacunas', form: 'nueva_vacuna',
  }).intent, 'ayuda_campo');
  for (const [id, guide] of Object.entries(chatbotGuides)) {
    const conversation = { lastIntent: id, activeGuide: id, currentStep: 1, totalSteps: guide.steps.length };
    const response = answerQuestion('¿Qué pongo aquí?', morbidity, conversation);
    assert.equal(response.conversation.activeGuide, id);
  }
});
