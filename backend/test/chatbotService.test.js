const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  chatbotKnowledge,
  laboratoryViewPatterns,
  operationalPriorityRules,
} = require('../src/config/chatbotKnowledge');

const {
  answerQuestion,
  calculateFpp,
  normalizeText,
  parseFurDate,
  scoreIntent,
  tokenize,
} = require('../src/services/chatbotService');

const FALLBACK_ANSWER =
  'Eso no lo manejo bien todavía, y prefiero no inventarte algo. Puedes decirme en qué pantalla estás y qué campo o botón te dio duda. Si es algo de permisos o configuración, revísalo con el administrador del sistema.';

const GREETING_ANSWER =
  '¡Hola! Aquí estoy 😊\nDime qué necesitas hacer en el sistema y te ayudo paso a paso.';

const EXPECTED_INTENTS = [
  'calcular_fpp',
  'registrar_paciente',
  'buscar_paciente',
  'editar_paciente',
  'embarazo_activo',
  'cerrar_embarazo',
  'control_prenatal',
  'impresion_no_disponible',
  'editar_control_prenatal',
  'eliminar_registro',
  'ficha_riesgo',
  'interpretar_riesgo',
  'mapa_riesgo',
  'vacunas',
  'editar_vacuna',
  'morbilidad',
  'puerperio',
  'laboratorio',
  'referencias',
  'citas_seguimiento',
  'reportes',
  'filtrar_reportes',
  'usuarios',
  'cambiar_password',
  'olvido_contrasena',
  'permisos_usuario',
  'sesion',
  'modo_oscuro',
  'dashboard',
  'errores_guardado',
  'datos_obligatorios',
  'privacidad_datos',
  'sin_internet',
  'ayuda_bot',
  'imprimir_plan_parto',
  'plan_parto',
  'imprimir_riesgo',
  'secciones_expediente',
  'primeros_pasos',
];

const EXPECTED_KEYWORD_COUNTS = [
  9, 12, 7, 10, 7, 7, 13, 9, 6, 7,
  8, 6, 13, 9, 8, 7, 7, 10, 7, 7,
  10, 7, 9, 18, 11, 7, 7, 6, 6, 6,
  6, 6, 7, 7, 12, 8, 8, 7, 6,
];

function getIntent(intent) {
  const item = chatbotKnowledge.find((candidate) => candidate.id === intent);
  assert.ok(item, `No existe la intención ${intent}`);
  return item;
}

function maxScore(message) {
  return Math.max(...chatbotKnowledge.map((item) => scoreIntent(message, item)));
}

function isFallback(result) {
  return result.intent === 'no_reconocida';
}

function assertCurrentClassification({
  input,
  intent,
  fallback,
  score,
  confidence,
  answerIncludes,
}) {
  const result = answerQuestion(input);

  assert.equal(result.intent, intent);
  assert.equal(isFallback(result), fallback);
  assert.equal(maxScore(input), score);
  assert.equal(result.confidence, confidence);
  assert.equal(typeof result.answer, 'string');
  assert.ok(result.answer.length > 0);

  if (fallback) {
    assert.equal(result.recognized, false);
    assert.equal(result.answer, FALLBACK_ANSWER);
    assert.ok(Array.isArray(result.suggestions));
    assert.ok(result.suggestions.length > 0);
  } else {
    assert.equal(result.recognized, true);
    assert.match(result.answer, answerIncludes);
  }

  return result;
}

test('normalización convierte mayúsculas a minúsculas', () => {
  assert.equal(normalizeText('PACIENTE Nueva'), 'paciente nueva');
});

test('normalización elimina acentos', () => {
  assert.equal(normalizeText('ÁÉÍÓÚ Ü Ñ presión'), 'aeiou u n presion');
});

test('normalización elimina puntuación no admitida', () => {
  assert.equal(normalizeText('¿Hola, Lia? ¡Ayúdame!'), 'hola lia ayudame');
});

test('normalización colapsa espacios repetidos y recorta extremos', () => {
  assert.equal(normalizeText('   control    prenatal   '), 'control prenatal');
});

test('normalización conserva el texto vacío como vacío', () => {
  assert.equal(normalizeText(''), '');
  assert.equal(normalizeText(), '');
});

test('tokenización descarta tokens de dos caracteres o menos', () => {
  assert.deepEqual(tokenize('a de el la no sí y FUR VIH'), ['fur', 'vih']);
});

for (const greeting of ['Hola.', 'Buenos días.', 'Buenas tardes.', 'Hey.', 'Qué tal.']) {
  test(`saludo actual reconocido: ${greeting}`, () => {
    const result = answerQuestion(greeting);
    assert.equal(result.intent, 'saludo');
    assert.equal(result.recognized, true);
    assert.equal(result.answer, GREETING_ANSWER);
    assert.equal(result.confidence, undefined);
    assert.deepEqual(result.suggestions, [
      'Registrar una paciente',
      'Agregar un control prenatal',
      'Revisar una ficha de riesgo',
      'Generar un reporte',
    ]);
  });
}

test('Hola Lia se reconoce como saludo sin ejecutar fallback', () => {
  assertCurrentClassification({
    input: 'Hola Lia.',
    intent: 'saludo',
    fallback: false,
    score: 0,
    confidence: undefined,
    answerIncludes: /Aquí estoy/,
  });
});

for (const thanks of ['Gracias.', 'Muchas gracias.']) {
  test(`agradecimiento reconocido: ${thanks}`, () => {
    const result = answerQuestion(thanks);
    assert.equal(result.intent, 'agradecimiento');
    assert.equal(result.recognized, true);
    assert.match(result.answer, /Con gusto/);
    assert.equal(result.confidence, undefined);
    assert.equal(result.disclaimer, undefined);
  });
}

for (const farewell of ['Adiós.', 'Hasta luego.']) {
  test(`despedida reconocida: ${farewell}`, () => {
    const result = answerQuestion(farewell);
    assert.equal(result.intent, 'despedida');
    assert.equal(result.recognized, true);
    assert.match(result.answer, /Hasta luego/);
    assert.equal(result.confidence, undefined);
    assert.equal(result.suggestions, undefined);
  });
}

const SOCIAL_GUARD_CASES = [
  ['Hola, Lia.', 'saludo'],
  ['Buenos días Lia.', 'saludo'],
  ['Hey Lia.', 'saludo'],
  ['Holi.', 'saludo'],
  ['Cómo estás.', 'saludo'],
  ['Hola Lia necesito ayuda.', 'saludo'],
  ['Gracias Lia.', 'agradecimiento'],
  ['Te lo agradezco.', 'agradecimiento'],
  ['Perfecto, gracias.', 'agradecimiento'],
  ['Buena onda.', 'agradecimiento'],
  ['Listo, gracias.', 'agradecimiento'],
  ['Nos vemos.', 'despedida'],
  ['Chao.', 'despedida'],
  ['Hasta mañana.', 'despedida'],
  ['Eso es todo.', 'despedida'],
  ['Ya terminé.', 'despedida'],
];

for (const [input, intent] of SOCIAL_GUARD_CASES) {
  test(`guarda social determinista: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, intent);
    assert.equal(result.recognized, true);
    assert.equal(result.confidence, undefined);
  });
}

for (const [input, intent] of [
  ['Hola Lia, registrar paciente.', 'registrar_paciente'],
  ['Hola Lia, ¿cómo registro una paciente?', 'registrar_paciente'],
  ['Buenos días, necesito agregar un control prenatal.', 'control_prenatal'],
  ['Gracias, ¿cómo agrego un control?', 'control_prenatal'],
]) {
  test(`una apertura social no intercepta la solicitud operativa: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, intent);
    assert.equal(result.recognized, true);
    assert.equal(typeof result.confidence, 'number');
  });
}

const CLINICAL_DATA_CASES = [
  '¿Esta paciente tiene VIH?',
  'Quiero saber el resultado de VIH de esta paciente.',
  '¿Cuál es su diagnóstico?',
  'Dime los laboratorios de esta paciente.',
  '¿Qué enfermedad tiene?',
  '¿Cuál es su presión?',
  'Muéstrame sus datos clínicos.',
];

for (const input of CLINICAL_DATA_CASES) {
  test(`solicitud de dato clínico protegida: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'solicitud_dato_clinico');
    assert.equal(result.recognized, true);
    assert.match(result.answer, /No consulto ni revelo expedientes o resultados clínicos/);
    assert.equal(result.confidence, undefined);
  });
}

test('solicitud de VIH explica el permiso sin afirmar que el usuario lo posee', () => {
  const result = answerQuestion('¿Esta paciente tiene VIH?');
  assert.match(result.answer, /controles\.ver_vih/);
  assert.match(result.answer, /no puedo afirmar si tu cuenta lo tiene/i);
});

const CLINICAL_ADVICE_CASES = [
  '¿Qué medicamento debo darle?',
  '¿Qué tratamiento le pongo?',
  '¿Cuál es el diagnóstico?',
  '¿Qué dosis debo usar?',
  '¿Qué hago si tiene presión alta?',
  'Recomiéndame un medicamento.',
  '¿Es peligroso este resultado?',
  '¿Debe ser referida?',
];

for (const input of CLINICAL_ADVICE_CASES) {
  test(`solicitud de consejo clínico protegida: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'solicitud_consejo_clinico');
    assert.equal(result.recognized, true);
    assert.match(result.answer, /profesional responsable/);
    assert.match(result.answer, /protocolos vigentes del MSPAS/);
    assert.equal(result.confidence, undefined);
  });
}

for (const [input, intent] of [
  ['¿Dónde ingreso VIH?', 'laboratorio'],
  ['¿Dónde ingreso el resultado de VIH?', 'laboratorio'],
  ['¿Dónde registro el medicamento indicado?', 'morbilidad'],
  ['¿Dónde registro el tratamiento?', 'morbilidad'],
  ['¿Dónde escribo el tratamiento?', 'morbilidad'],
  ['¿Cómo registro una referencia?', 'referencias'],
]) {
  test(`pregunta operativa clínica no es bloqueada: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, intent);
    assert.equal(result.recognized, true);
    assert.equal(typeof result.confidence, 'number');
  });
}

test('guardas clínicas no inventan resultados, diagnósticos, medicamentos ni dosis', () => {
  for (const input of [...CLINICAL_DATA_CASES, ...CLINICAL_ADVICE_CASES]) {
    const { answer } = answerQuestion(input);
    assert.doesNotMatch(answer, /\b(?:positivo|negativo|reactivo|paracetamol|aspirina|amoxicilina)\b/i);
    assert.doesNotMatch(answer, /\b\d+(?:\.\d+)?\s*(?:mg|ml)\b/i);
    assert.doesNotMatch(answer, /la paciente (?:tiene|presenta|padece)/i);
  }
});

const CURRENT_INTENT_CASES = [
  {
    input: 'Quiero registrar una paciente.',
    intent: 'registrar_paciente',
    score: 9,
    confidence: 1,
    answerIncludes: /Guardar paciente/,
  },
  {
    input: 'Necesito agregar una nueva paciente.',
    intent: 'registrar_paciente',
    score: 8,
    confidence: 1,
    answerIncludes: /Guardar paciente/,
  },
  {
    input: '¿Cómo ingreso a una embarazada?',
    intent: 'registrar_paciente',
    score: 2,
    confidence: 0.33,
    answerIncludes: /registrar una paciente nueva/,
  },
  {
    input: 'Quiero buscar un expediente.',
    intent: 'buscar_paciente',
    score: 7,
    confidence: 1,
    answerIncludes: /buscar una paciente/,
  },
  {
    input: '¿Cómo agrego un control prenatal?',
    intent: 'control_prenatal',
    score: 8,
    confidence: 1,
    answerIncludes: /control prenatal/,
  },
  {
    input: 'Necesito registrar una vacuna.',
    intent: 'vacunas',
    score: 7,
    confidence: 1,
    answerIncludes: /registrar una vacuna/,
  },
  {
    input: '¿Dónde veo los laboratorios?',
    intent: 'laboratorio',
    score: 7,
    confidence: 1,
    answerIncludes: /ver los laboratorios guardados/,
  },
  {
    input: 'Quiero imprimir la ficha MSPAS.',
    intent: 'impresion_no_disponible',
    score: 7,
    confidence: 1,
    answerIncludes: /PDF MSPAS/,
  },
  {
    input: '¿Cómo cierro un embarazo?',
    intent: 'cerrar_embarazo',
    score: 1.5,
    confidence: 1,
    answerIncludes: /Cerrar embarazo/,
  },
  {
    input: 'Ayúdame.',
    intent: 'ayuda_bot',
    score: 7,
    confidence: 1,
    answerIncludes: /ayudarte con el sistema/,
  },
  {
    input: '¿Cómo cambio mi contraseña?',
    intent: 'cambiar_password',
    score: 7,
    confidence: 1,
    answerIncludes: /cambiar tu contraseña/,
  },
  {
    input: '¿Cómo activo el modo oscuro?',
    intent: 'modo_oscuro',
    score: 8,
    confidence: 1,
    answerIncludes: /cambiar el tema/,
  },
  {
    input: '¿Cómo genero un reporte?',
    intent: 'reportes',
    score: 7,
    confidence: 1,
    answerIncludes: /generar reportes/,
  },
  {
    input: '¿Cómo registro puerperio?',
    intent: 'puerperio',
    score: 7,
    confidence: 1,
    answerIncludes: /registrar puerperio/,
  },
  {
    input: '¿Cómo registro un plan de parto?',
    intent: 'plan_parto',
    score: 8,
    confidence: 1,
    answerIncludes: /registrar o editar el plan de parto/,
  },
];

for (const currentCase of CURRENT_INTENT_CASES) {
  const marker = currentCase.knownToImprove ? 'KNOWN_TO_IMPROVE: ' : '';
  test(`${marker}clasificación actual: ${currentCase.input}`, () => {
    if (currentCase.knownToImprove) {
      assert.equal(typeof currentCase.knownToImprove, 'string');
      assert.ok(currentCase.knownToImprove.length > 0);
    }

    assertCurrentClassification({
      ...currentCase,
      fallback: currentCase.fallback || false,
    });
  });
}

const KNOWN_PROBLEM_CASES = [
  {
    input: 'Hola Lia.',
    intent: 'saludo',
    fallback: false,
    score: 0,
    confidence: undefined,
    answerIncludes: /Aquí estoy/,
    resolved: true,
    expectedCurrentResult: 'Ahora se reconoce como saludo.',
  },
  {
    input: 'Gracias.',
    intent: 'agradecimiento',
    fallback: false,
    score: 0,
    confidence: undefined,
    answerIncludes: /Con gusto/,
    resolved: true,
    expectedCurrentResult: 'Ahora responde como agradecimiento.',
  },
  {
    input: 'Adiós.',
    intent: 'despedida',
    fallback: false,
    score: 0,
    confidence: undefined,
    answerIncludes: /Hasta luego/,
    resolved: true,
    expectedCurrentResult: 'Ahora responde como despedida.',
  },
  {
    input: 'Quiero imprimir la ficha MSPAS.',
    intent: 'impresion_no_disponible',
    fallback: false,
    score: 7,
    confidence: 1,
    answerIncludes: /PDF MSPAS/,
    resolved: true,
    expectedCurrentResult: 'Ahora dirige a la impresión real del expediente MSPAS.',
  },
  {
    input: 'Estoy en el expediente y no sé qué hacer.',
    intent: 'secciones_expediente',
    fallback: false,
    score: 7,
    confidence: 1,
    answerIncludes: /se organiza por pestañas/,
    resolved: true,
    expectedCurrentResult: 'Ahora orienta sobre las secciones del expediente ya abierto.',
  },
  {
    input: 'No encuentro el botón para editar.',
    intent: 'no_reconocida',
    fallback: true,
    score: 1.5,
    confidence: undefined,
    resolved: true,
    expectedCurrentResult: 'Botón ya no coincide como subcadena con bot; solicita contexto útil.',
  },
  {
    input: 'Quiero saber si esta paciente tiene VIH.',
    intent: 'solicitud_dato_clinico',
    fallback: false,
    score: 7,
    confidence: undefined,
    answerIncludes: /controles\.ver_vih/,
    resolved: true,
    expectedCurrentResult: 'Ahora protege el dato clínico y explica el permiso VIH.',
  },
  {
    input: '¿Qué medicamento debo darle?',
    intent: 'solicitud_consejo_clinico',
    fallback: false,
    score: 1,
    confidence: undefined,
    answerIncludes: /protocolos vigentes del MSPAS/,
    resolved: true,
    expectedCurrentResult: 'Ahora aplica la guarda de consejo clínico.',
  },
  {
    input: 'asdfgh.',
    intent: 'no_reconocida',
    fallback: true,
    score: 0,
    confidence: undefined,
    expectedCurrentResult: 'Fallback estándar para texto sin sentido.',
  },
];

for (const problem of KNOWN_PROBLEM_CASES) {
  const marker = problem.resolved ? 'CORREGIDO' : 'KNOWN_TO_IMPROVE';
  test(`${marker}: ${problem.input} — ${problem.expectedCurrentResult}`, () => {
    assert.equal(typeof problem.expectedCurrentResult, 'string');
    assert.ok(problem.expectedCurrentResult.length > 0);
    assertCurrentClassification(problem);
  });
}

test('FPP extrae una fecha ISO válida y responde con 280 días', () => {
  const parsed = parseFurDate('Mi FUR fue 2026-01-10');
  assert.equal(parsed.toISOString(), '2026-01-10T00:00:00.000Z');

  const result = answerQuestion('Mi FUR fue 2026-01-10');
  assert.equal(result.intent, 'calcular_fpp');
  assert.match(result.answer, /Con FUR 2026-01-10, la FPP aproximada es 2026-10-17/);
  assert.match(result.answer, /FPP = FUR \+ 280 días/);
});

test('FPP extrae una fecha local válida', () => {
  const parsed = parseFurDate('Mi FUR fue 10/01/2026');
  assert.equal(parsed.toISOString(), '2026-01-10T00:00:00.000Z');

  const result = answerQuestion('Mi FUR fue 10/01/2026');
  assert.match(result.answer, /FPP aproximada es 2026-10-17/);
});

test('FPP devuelve null para texto sin fecha', () => {
  assert.equal(parseFurDate('Quiero calcular mi FPP'), null);
});

test('FPP rechaza una fecha de calendario inválida', () => {
  assert.equal(parseFurDate('Mi FUR fue 2026-02-30'), null);
});

test('cálculo de FPP suma exactamente 280 días en UTC', () => {
  const fur = new Date(Date.UTC(2026, 0, 10));
  const fpp = calculateFpp(fur);
  assert.equal(fpp.toISOString(), '2026-10-17T00:00:00.000Z');
  assert.equal(fpp.getTime() - fur.getTime(), 280 * 24 * 60 * 60 * 1000);
});

for (const input of ['Quiero calcular mi FPP', 'Mi FUR fue 2026-02-30']) {
  test(`FPP conserva la respuesta genérica cuando no puede extraer fecha: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'calcular_fpp');
    assert.match(result.answer, /suma 280 días a esa fecha/i);
    assert.doesNotMatch(result.answer, /la FPP aproximada es \d{4}-\d{2}-\d{2}/);
  });
}

test('una fecha no agrega cálculo FPP cuando gana otra intención', () => {
  const result = answerQuestion('Quiero registrar una paciente el 2026-01-10');
  assert.equal(result.intent, 'registrar_paciente');
  assert.doesNotMatch(result.answer, /la FPP aproximada es/);
  assert.equal(Object.hasOwn(result, 'fur'), false);
  assert.equal(Object.hasOwn(result, 'fpp'), false);
});

test('editar vacuna supera a vacunas sin depender de un empate por orden', () => {
  const input = 'Editar vacuna';
  assert.equal(scoreIntent(input, getIntent('vacunas')), 7);
  assert.equal(scoreIntent(input, getIntent('editar_vacuna')), 8);
  assert.equal(answerQuestion(input).intent, 'editar_vacuna');
});

test('guarda de datos clínicos precede la coincidencia operativa de VIH', () => {
  const input = 'Quiero saber si esta paciente tiene VIH.';
  assert.equal(scoreIntent(input, getIntent('laboratorio')), 7);
  assert.equal(answerQuestion(input).intent, 'solicitud_dato_clinico');
});

test('prioridad exacta de impresión MSPAS supera la keyword general de reportes', () => {
  const input = 'Quiero imprimir la ficha MSPAS.';
  assert.equal(scoreIntent(input, getIntent('reportes')), 7);
  assert.equal(scoreIntent(input, getIntent('impresion_no_disponible')), 3);
  assert.equal(answerQuestion(input).intent, 'impresion_no_disponible');
});

test('colisión usuarios vs contraseña olvidada favorece la frase específica', () => {
  const input = 'Olvidé mi contraseña';
  assert.equal(scoreIntent(input, getIntent('usuarios')), 7);
  assert.equal(scoreIntent(input, getIntent('olvido_contrasena')), 8);
  assert.equal(answerQuestion(input).intent, 'olvido_contrasena');
});

test('una clave que no funciona se trata como problema de acceso', () => {
  const input = 'Mi clave no funciona';
  assert.equal(scoreIntent(input, getIntent('usuarios')), 7);
  assert.equal(scoreIntent(input, getIntent('olvido_contrasena')), 1.5);
  assert.equal(answerQuestion(input).intent, 'olvido_contrasena');
});

test('estar dentro del expediente prioriza sus secciones sobre buscar paciente', () => {
  const input = 'Estoy en el expediente y no sé qué hacer.';
  assert.equal(scoreIntent(input, getIntent('buscar_paciente')), 7);
  assert.equal(scoreIntent(input, getIntent('secciones_expediente')), 2);
  assert.equal(answerQuestion(input).intent, 'secciones_expediente');
});

test('seguimiento postparto prioriza puerperio sobre citas prenatales', () => {
  const input = 'Seguimiento de la madre después de dar a luz';
  assert.equal(scoreIntent(input, getIntent('citas_seguimiento')), 7);
  assert.equal(scoreIntent(input, getIntent('puerperio')), 1);
  assert.equal(answerQuestion(input).intent, 'puerperio');
});

test('una acción negada no domina y la edición ambigua pide el módulo', () => {
  const input = 'No quiero eliminar, quiero editar.';
  assert.equal(scoreIntent(input, getIntent('eliminar_registro')), 7);
  assert.equal(scoreIntent(input, getIntent('editar_paciente')), 1.5);
  const result = answerQuestion(input);
  assert.equal(result.intent, 'no_reconocida');
  assert.equal(result.recognized, false);
  assert.match(result.answer, /Qué necesitas editar/);
});

for (const input of [
  'Quiero imprimir la ficha MSPAS.',
  'Necesito descargar la ficha MSPAS.',
  'Quiero sacar el PDF del expediente.',
  '¿Dónde genero la ficha prenatal MSPAS?',
]) {
  test(`impresión MSPAS usa la función del expediente: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'impresion_no_disponible');
    assert.match(result.answer, /botón "Expediente"/);
    assert.doesNotMatch(result.answer, /Generar censo mensual/);
  });
}

for (const input of [
  '¿Cómo cierro un embarazo?',
  'Quiero cerrar el embarazo actual.',
  'Finalizar embarazo.',
  'Pasar el embarazo a puerperio.',
  'Registrar que terminó el embarazo.',
]) {
  test(`cierre de embarazo describe las transiciones reales: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'cerrar_embarazo');
    assert.match(result.answer, /Registrar puerperio/);
    assert.match(result.answer, /Cerrar embarazo/);
    assert.doesNotMatch(result.answer, /no lo manejo bien todavía/);
  });
}

for (const input of ['¿Cómo cambio mi contraseña?', 'Quiero cambiar mi clave.']) {
  test(`cambio voluntario de contraseña no cae en usuarios: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'cambiar_password');
    assert.match(result.answer, /contraseña actual/);
  });
}

for (const input of [
  'Mi clave no funciona.',
  'No puedo entrar con mi contraseña.',
  'Olvidé mi contraseña.',
]) {
  test(`problema de acceso usa recuperación de contraseña: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'olvido_contrasena');
    assert.doesNotMatch(result.answer, /gestionar usuarios/);
  });
}

for (const input of [
  'No encuentro el botón para editar.',
  'El botón de guardar no aparece.',
  '¿Dónde está el botón de imprimir?',
]) {
  test(`botón no activa ayuda_bot por subcadena: ${input}`, () => {
    assert.notEqual(answerQuestion(input).intent, 'ayuda_bot');
  });
}

for (const input of ['bot', 'chatbot']) {
  test(`${input} conserva la intención ayuda_bot`, () => {
    assert.equal(answerQuestion(input).intent, 'ayuda_bot');
  });
}

for (const input of [
  'Estoy en el expediente y no sé qué hacer.',
  'Ya abrí el expediente, ¿qué sigue?',
  '¿Qué secciones tiene el expediente?',
  '¿Dónde están las pestañas del expediente?',
]) {
  test(`expediente ya abierto orienta a sus secciones: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'secciones_expediente');
    assert.match(result.answer, /se organiza por pestañas/);
    assert.doesNotMatch(result.answer, /Para buscar una paciente/);
  });
}

for (const input of [
  'Seguimiento después de dar a luz.',
  'Control después del parto.',
  'Atención postparto.',
  'Registrar seguimiento de la madre después del parto.',
]) {
  test(`seguimiento posterior al parto usa puerperio: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'puerperio');
    assert.match(result.answer, /registrar puerperio/);
    assert.doesNotMatch(result.answer, /Cita siguiente/);
  });
}

for (const input of [
  'No quiero eliminar, quiero editar.',
  'No necesito eliminar, quiero editar.',
]) {
  test(`edición sin módulo tras negación pide aclaración: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'no_reconocida');
    assert.equal(result.recognized, false);
    assert.match(result.answer, /Qué necesitas editar/);
    assert.notEqual(result.intent, 'eliminar_registro');
  });
}

for (const input of [
  'No deseo borrar el control, solo corregirlo.',
  'No voy a borrar el control, solo corregirlo.',
]) {
  test(`negación limitada conserva la acción positiva sobre control: ${input}`, () => {
    assert.equal(answerQuestion(input).intent, 'editar_control_prenatal');
  });
}

test('negación de crear paciente conserva la acción positiva de buscarla', () => {
  assert.equal(
    answerQuestion('No quiero crear otra paciente, quiero buscarla.').intent,
    'buscar_paciente'
  );
});

test('sin negación, eliminar registro continúa funcionando', () => {
  assert.equal(answerQuestion('Quiero eliminar un control.').intent, 'eliminar_registro');
});

for (const [input, intent] of [
  ['Quiero registrar una vacuna.', 'vacunas'],
  ['Quiero editar una vacuna.', 'editar_vacuna'],
  ['Corregir la dosis de una vacuna.', 'editar_vacuna'],
  ['La vacuna quedó incorrecta.', 'editar_vacuna'],
]) {
  test(`vacunas diferencia registro y edición: ${input}`, () => {
    assert.equal(answerQuestion(input).intent, intent);
  });
}

for (const input of [
  '¿Dónde veo los laboratorios?',
  '¿Dónde están los resultados de laboratorio?',
]) {
  test(`laboratorio adapta la respuesta para visualización: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'laboratorio');
    assert.match(result.answer, /ver los laboratorios guardados/);
    assert.match(result.answer, /pestaña "Laboratorios"/);
  });
}

for (const input of [
  'Quiero registrar un laboratorio.',
  '¿Dónde ingreso el resultado de VIH?',
]) {
  test(`laboratorio conserva la respuesta de registro: ${input}`, () => {
    const result = answerQuestion(input);
    assert.equal(result.intent, 'laboratorio');
    assert.match(result.answer, /registrar laboratorios/);
    assert.match(result.answer, /formulario del control/);
  });
}

test('catálogo conserva las 38 intenciones previas y añade cerrar_embarazo', () => {
  assert.equal(chatbotKnowledge.length, 39);
  assert.deepEqual(chatbotKnowledge.map((item) => item.id), EXPECTED_INTENTS);
  assert.equal(EXPECTED_INTENTS.filter((intent) => intent !== 'cerrar_embarazo').length, 38);
});

test('IDs de intención del catálogo son únicos', () => {
  const ids = chatbotKnowledge.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('snapshot estructural conserva orden e inventario de keywords del catálogo extraído', () => {
  const expectedStructure = EXPECTED_INTENTS.map((id, index) => ({
    id,
    keywordCount: EXPECTED_KEYWORD_COUNTS[index],
  }));
  const actualStructure = chatbotKnowledge.map(({ id, keywords }) => ({
    id,
    keywordCount: keywords.length,
  }));

  assert.deepEqual(actualStructure, expectedStructure);
});

test('cada intención tiene estructura, respuesta, keywords y sugerencias válidas', () => {
  for (const item of chatbotKnowledge) {
    assert.deepEqual(Object.keys(item), ['id', 'title', 'keywords', 'answer', 'suggestions']);
    assert.equal(typeof item.id, 'string');
    assert.ok(item.id.trim().length > 0, 'ID de intención vacío');
    assert.equal(typeof item.title, 'string');
    assert.ok(item.title.trim().length > 0, `Título vacío en ${item.id}`);
    assert.equal(typeof item.answer, 'string');
    assert.ok(item.answer.trim().length > 0, `Respuesta vacía en ${item.id}`);
    assert.ok(Array.isArray(item.keywords), `Keywords inválidas en ${item.id}`);
    assert.ok(item.keywords.length > 0, `Sin keywords en ${item.id}`);
    assert.ok(Array.isArray(item.suggestions), `Sugerencias inválidas en ${item.id}`);

    for (const keyword of item.keywords) {
      assert.equal(typeof keyword, 'string');
      assert.ok(keyword.trim().length > 0, `Keyword vacía en ${item.id}`);
    }

    for (const suggestion of item.suggestions) {
      assert.equal(typeof suggestion, 'string');
      assert.ok(suggestion.trim().length > 0, `Sugerencia vacía en ${item.id}`);
    }
  }
});

test('prioridades exactas tienen orden, IDs y patterns válidos', () => {
  const catalogIds = new Set(chatbotKnowledge.map(({ id }) => id));
  assert.deepEqual(
    operationalPriorityRules.map(({ priority }) => priority),
    [1, 2, 3, 4, 5, 6, 7, 8]
  );

  for (const rule of operationalPriorityRules) {
    assert.ok(catalogIds.has(rule.id), `Prioridad para ID desconocido: ${rule.id}`);
    assert.ok(Number.isInteger(rule.priority) && rule.priority > 0);
    assert.ok(Array.isArray(rule.patterns) && rule.patterns.length > 0);
    assert.ok(rule.patterns.every((pattern) => pattern instanceof RegExp));
  }

  assert.ok(laboratoryViewPatterns.length > 0);
  assert.ok(laboratoryViewPatterns.every((pattern) => pattern instanceof RegExp));
});

test('clasificar repetidamente no modifica catálogo, keywords, respuestas ni sugerencias', () => {
  const catalogBefore = structuredClone(chatbotKnowledge);
  const inputs = [
    'Quiero registrar una paciente.',
    'Quiero imprimir la ficha MSPAS.',
    'No deseo borrar el control, solo corregirlo.',
    '¿Dónde veo los laboratorios?',
    '¿Esta paciente tiene VIH?',
    'asdfgh.',
  ];
  const resultsBefore = inputs.map((input) => answerQuestion(input));

  for (let repetition = 0; repetition < 10; repetition += 1) {
    inputs.forEach((input) => answerQuestion(input));
  }

  assert.deepEqual(chatbotKnowledge, catalogBefore);
  assert.deepEqual(inputs.map((input) => answerQuestion(input)), resultsBefore);
  assert.ok(Object.isFrozen(chatbotKnowledge));
  for (const item of chatbotKnowledge) {
    assert.ok(Object.isFrozen(item));
    assert.ok(Object.isFrozen(item.keywords));
    assert.ok(Object.isFrozen(item.suggestions));
  }
});

test('consumidores productivos no importan el catálogo desde chatbotService', () => {
  const srcRoot = path.resolve(__dirname, '../src');
  const pending = [srcRoot];
  const invalidConsumers = [];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.name.endsWith('.js') && entry.name !== 'chatbotService.js') {
        const source = fs.readFileSync(fullPath, 'utf8');
        if (source.includes('chatbotService') && source.includes('knowledgeBase')) {
          invalidConsumers.push(path.relative(srcRoot, fullPath));
        }
      }
    }
  }

  assert.deepEqual(invalidConsumers, []);
});

test('contrato siempre devuelve intención y respuesta no vacías', () => {
  const inputs = [
    undefined,
    null,
    '',
    'Hola.',
    'asdfgh.',
    ...CURRENT_INTENT_CASES.map(({ input }) => input),
  ];

  for (const input of inputs) {
    const result = answerQuestion(input);
    assert.equal(typeof result.intent, 'string');
    assert.ok(result.intent.length > 0);
    assert.equal(typeof result.answer, 'string');
    assert.ok(result.answer.length > 0);
  }
});

test('confidence es numérica, acotada y de hasta dos decimales cuando existe', () => {
  const inputs = [
    ...CURRENT_INTENT_CASES.filter(({ fallback }) => !fallback).map(({ input }) => input),
    'Editar vacuna',
    'Olvidé mi contraseña',
  ];

  for (const input of inputs) {
    const { confidence } = answerQuestion(input);
    assert.equal(typeof confidence, 'number', `confidence ausente para ${input}`);
    assert.ok(confidence >= 0 && confidence <= 1);
    assert.equal(Number(confidence.toFixed(2)), confidence);
  }

  for (const input of ['', 'Hola.', 'asdfgh.']) {
    assert.equal(answerQuestion(input).confidence, undefined);
  }
});

test('fallback devuelve las seis sugerencias actuales en orden', () => {
  const result = answerQuestion('asdfgh');
  assert.equal(result.intent, 'no_reconocida');
  assert.deepEqual(
    result.suggestions,
    chatbotKnowledge.slice(0, 6).map((item) => item.title)
  );
});

test('mensaje vacío devuelve las cuatro sugerencias actuales', () => {
  const result = answerQuestion('   ');
  assert.equal(result.intent, 'mensaje_vacio');
  assert.equal(result.recognized, false);
  assert.deepEqual(
    result.suggestions,
    chatbotKnowledge.slice(0, 4).map((item) => item.title)
  );
});

test('respuesta FPP solo incorpora fechas calculadas cuando puede extraerlas', () => {
  const withDate = answerQuestion('Mi FUR fue 2026-01-10');
  const withoutDate = answerQuestion('Quiero calcular la FPP');

  assert.match(withDate.answer, /FUR 2026-01-10/);
  assert.match(withDate.answer, /FPP aproximada es 2026-10-17/);
  assert.doesNotMatch(withoutDate.answer, /FUR \d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(withoutDate.answer, /FPP aproximada es \d{4}-\d{2}-\d{2}/);

  for (const result of [withDate, withoutDate]) {
    assert.equal(Object.hasOwn(result, 'fur'), false);
    assert.equal(Object.hasOwn(result, 'fpp'), false);
  }
});
