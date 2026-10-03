const assert = require('node:assert/strict');
const test = require('node:test');
const { answerQuestion } = require('../src/services/chatbotService');
const { chatbotContextSchema } = require('../src/validations/chatbot.schemas');
const { generateQuickActions } = require('../src/services/chatbotQuickActionsService');
const { CHATBOT_ROUTE_OPERATIONAL_CONTEXT } = require('../src/config/chatbotContext');

function context(route, extra = {}) {
  return {
    route, module: 'expediente', hasPatientContext: true, hasPregnancyContext: true,
    pregnancyStatus: 'activo', permissions: ['pacientes.ver', 'controles.crear', 'controles.editar'],
    ...CHATBOT_ROUTE_OPERATIONAL_CONTEXT[route], tab: null, focusedField: null, ...extra,
  };
}
const vaccine = context('/pacientes/:id/vacunas/nuevo', { vaccineType: 'tdap' });

test('Tdap + pregunta original usa contexto sin fallback ni recomendaciones', () => {
  const response = answerQuestion('¿Qué debo colocar acá?', vaccine);
  assert.equal(response.recognized, true);
  assert.match(response.answer, /registro de Tdap.*Dosis única del embarazo.*fecha oficial/);
  assert.match(response.answer, /carné o antecedente documentado.*sin inventar fechas/);
  assert.doesNotMatch(response.answer, /Eso no lo manejo|en qué pantalla|20 semanas|debes aplicar/i);
});

test('variantes deícticas usan ayuda funcional y nunca solicitan pantalla conocida', () => {
  for (const question of ['qué pongo aquí', 'qué coloco acá', 'qué va acá', 'para qué sirve esto', 'qué selecciono', 'qué selecciono aquí', 'qué significa este campo', 'qué hago acá', 'qué significa esto']) {
    const response = answerQuestion(question, vaccine);
    assert.match(response.answer, /Tdap/, question);
    assert.doesNotMatch(response.answer, /en qué pantalla|Eso no lo manejo/i, question);
  }
});

test('fecha de aplicación explica uso sin inventar un valor y foco tiene prioridad', () => {
  for (const question of ['qué pongo en fecha de aplicación', 'qué significa fecha de aplicación', 'para qué sirve fecha de aplicación']) {
    const response = answerQuestion(question, vaccine);
    assert.equal(response.intent, 'ayuda_campo');
    assert.match(response.answer, /fecha/i);
    assert.doesNotMatch(response.answer, /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/);
  }
  const focused = answerQuestion('qué debo colocar acá', { ...vaccine, focusedField: 'vacuna_fecha_dosis' });
  assert.equal(focused.intent, 'ayuda_campo_contextual');
  assert.match(focused.answer, /Fecha/);
});

for (const [route, question, expected] of [
  ['/pacientes/:id/riesgo', 'qué hago aquí', /Ficha de riesgo.*edad clínica.*automáticamente/s],
  ['/pacientes/:id/plan-parto', 'para qué sirve esto', /Plan de parto.*precargados.*impresión/s],
  ['/pacientes/:id/controles/nuevo', 'qué pongo acá', /control prenatal.*fecha.*obligatorios.*semanas.*pestañas|control prenatal.*General.*Laboratorio/is],
  ['/pacientes/:id/puerperio/nuevo', 'qué debo colocar acá', /Puerperio.*guardar.*expediente/s],
  ['/pacientes/:id/morbilidad/nuevo', 'qué debo colocar acá', /Morbilidad.*profesional responsable/s],
  ['/pacientes/:id/editar', 'qué debo colocar acá', /editando los datos de una paciente/s],
]) {
  test(`ayuda de pantalla: ${route}`, () => {
    const response = answerQuestion(question, context(route));
    assert.equal(response.recognized, true);
    assert.match(response.answer, expected);
    assert.doesNotMatch(response.answer, /en qué pantalla|Eso no lo manejo/);
  });
}

test('pestaña Laboratorio aporta contexto sin interpretar VIH', () => {
  const response = answerQuestion('qué debo colocar acá', context('/pacientes/:id/controles/nuevo', { tab: 'laboratorio' }));
  assert.match(response.answer, /Control prenatal → Laboratorio.*controles.ver_vih.*sin interpretación/s);
});

test('guardas clínicas preceden a pantalla, vacuna y campo enfocado', () => {
  for (const question of ['qué diagnóstico debo poner', 'qué tratamiento debería poner aquí', 'qué medicamento debo darle', 'debo aplicar esta vacuna', 'debe aplicarse Tdap', 'debo aplicar Tdap', 'debo marcar este factor de riesgo']) {
    const result = answerQuestion(question, { ...vaccine, focusedField: 'vacuna_fecha_dosis' });
    assert.equal(result.intent, 'solicitud_consejo_clinico', question);
  }
  assert.equal(answerQuestion('la paciente tiene VIH', vaccine).intent, 'solicitud_dato_clinico');
});

test('sin contexto/ruta desconocida pide campo; sin inventar una pantalla', () => {
  for (const ctx of [undefined, { route: '/otro', module: 'otro' }]) {
    const deictic = answerQuestion('qué debo colocar acá', ctx);
    assert.match(deictic.answer, /Dime el nombre/);
    assert.doesNotMatch(deictic.answer, /Estás en|Veo que estás/);
    const unknown = answerQuestion('asdfgh', ctx);
    assert.equal(unknown.intent, 'no_reconocida');
    assert.match(unknown.answer, /nombre del campo o botón/);
    assert.doesNotMatch(unknown.answer, /Eso no lo manejo/);
  }
});

test('fallback final usa formulario conocido después de las intenciones existentes', () => {
  const unknown = answerQuestion('asdfgh', vaccine);
  assert.equal(unknown.intent, 'no_reconocida');
  assert.match(unknown.answer, /Tdap.*nombre del campo o botón/s);
  assert.equal(answerQuestion('cómo registro una vacuna', vaccine).intent, 'vacunas');
});

test('categoría es enum funcional cerrado y solo se admite en ruta de vacunas', () => {
  for (const vaccineType of ['td', 'tdap', 'influenza', 'spr_sr', null]) {
    assert.equal(chatbotContextSchema.safeParse({ ...vaccine, vaccineType }).success, true);
  }
  for (const vaccineType of ['Tdap', 'Nombre CANARIO', {}, { tipo_vacuna: 'tdap' }]) {
    assert.equal(chatbotContextSchema.safeParse({ ...vaccine, vaccineType }).success, false);
  }
  assert.equal(chatbotContextSchema.safeParse(context('/pacientes/:id/riesgo', { vaccineType: 'tdap' })).success, false);
  for (const key of ['pacienteId', 'embarazoId', 'cui', 'nombre', 'fecha', 'vih', 'diagnostico', 'formState', 'helpContext']) {
    assert.equal(chatbotContextSchema.safeParse({ ...vaccine, [key]: 'CANARIO_PRIVADO' }).success, false);
  }
});

test('acciones rápidas de control/vacuna/riesgo/plan conservan catálogos y permisos', () => {
  const actions = generateQuickActions({ intent: 'ayuda_campo_sin_foco', context: vaccine });
  assert.deepEqual(actions.map(({ id }) => id), ['how-register-control', 'how-register-vaccine', 'how-risk-form', 'how-birth-plan']);
  const closed = generateQuickActions({ intent: 'ayuda_campo_sin_foco', context: { ...vaccine, pregnancyStatus: 'cerrado' } });
  assert.equal(closed.some(({ id }) => actions.some((action) => action.id === id)), false);
});
