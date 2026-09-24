const assert = require('node:assert/strict');
const test = require('node:test');
const { answerQuestion } = require('../src/services/chatbotService');
const { chatbotGuides } = require('../src/config/chatbotGuides');

const plan = {
  route: '/pacientes/:id/plan-parto', module: 'expediente',
  hasPatientContext: true, hasPregnancyContext: true, pregnancyStatus: 'activo',
  permissions: ['pacientes.ver'], section: 'plan_parto', tab: null,
  form: 'plan_parto', focusedField: 'plan_parto_fur',
};
const laboratory = {
  ...plan, route: '/pacientes/:id/controles/nuevo', section: 'control_prenatal',
  form: 'nuevo_control', tab: 'laboratorio', focusedField: 'vih',
};

test('decisiones clínicas explícitas reciben guarda sin desplazar orientación operacional', () => {
  for (const question of [
    '¿Debo aplicar esta vacuna?', '¿Qué diagnóstico pongo aquí?',
    '¿Debo marcar este factor de riesgo?', '¿Qué tratamiento debería poner?',
  ]) {
    const result = answerQuestion(question, plan);
    assert.equal(result.intent, 'solicitud_consejo_clinico', question);
    assert.match(result.answer, /no puedo decidir conductas clínicas.*diagnósticos.*tratamientos.*aplicación de vacunas.*factor de riesgo/i);
  }
  for (const [question, intent] of [
    ['¿Dónde registro una vacuna?', 'vacunas'],
    ['¿Dónde escribo la impresión clínica?', 'morbilidad'],
    ['¿Dónde documento el tratamiento?', 'morbilidad'],
    ['¿Dónde están los factores de riesgo?', 'ficha_riesgo'],
  ]) assert.equal(answerQuestion(question, plan).intent, intent, question);
});

test('buscar paciente tiene prioridad sobre registro para frases acotadas', () => {
  for (const question of [
    '¿Cómo busco una paciente?', '¿Dónde busco una paciente?',
    '¿Cómo encuentro una paciente?', 'Quiero buscar una paciente',
  ]) assert.equal(answerQuestion(question).intent, 'buscar_paciente', question);
  assert.equal(answerQuestion('¿Cómo registro una paciente?').intent, 'registrar_paciente');
});

test('FUR y FPP se resuelven en el Plan de parto confirmado, sin desplazar cálculo', () => {
  const fur = answerQuestion('¿Qué significa FUR?', plan);
  assert.equal(fur.intent, 'ayuda_campo');
  assert.match(fur.answer, /fecha editable.*ficha de riesgo o el embarazo/i);
  assert.doesNotMatch(fur.answer, /Dime si estás en el registro de paciente/);
  const fpp = answerQuestion('¿Qué significa FPP?', plan);
  assert.equal(fpp.intent, 'ayuda_campo');
  assert.match(fpp.answer, /este formulario no la recalcula al cambiar FUR/);
  assert.equal(answerQuestion('¿Cómo calculo la FPP?', plan).intent, 'calcular_fpp');
});

test('guarda VIH, ayuda por foco y seis guías permanecen', () => {
  assert.equal(answerQuestion('Hola Lía, ¿la paciente Ana tiene VIH?', laboratory).intent, 'solicitud_dato_clinico');
  assert.equal(answerQuestion('¿Dónde registro VIH?', laboratory).intent, 'laboratorio');
  assert.equal(answerQuestion('¿Qué pongo aquí?', laboratory).intent, 'ayuda_campo_contextual');
  for (const [id, guide] of Object.entries(chatbotGuides)) {
    const conversation = { lastIntent: id, activeGuide: id, currentStep: 1, totalSteps: guide.steps.length };
    const result = answerQuestion('¿Debo aplicar esta vacuna?', plan, conversation);
    assert.equal(result.intent, 'solicitud_consejo_clinico');
    assert.equal(result.conversation.activeGuide, id);
    assert.equal(result.conversation.currentStep, 1);
  }
});

test('consultas de si una paciente tiene VIH se protegen sin afectar dónde registrarlo', () => {
  for (const question of [
    'Quiero saber si la paciente Ana tiene VIH',
    'Quiero saber si Ana tiene VIH',
    'Necesito saber si esta paciente tiene VIH',
    'Me puedes decir si la paciente tiene VIH',
    'Dime si esta paciente tiene VIH',
  ]) {
    const result = answerQuestion(question, laboratory);
    assert.equal(result.intent, 'solicitud_dato_clinico', question);
    assert.match(result.answer, /No consulto ni revelo expedientes o resultados clínicos/);
  }
  assert.equal(answerQuestion('Quiero saber dónde registro VIH', laboratory).intent, 'laboratorio');
});
