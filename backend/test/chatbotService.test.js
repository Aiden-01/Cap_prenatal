const assert = require('node:assert/strict');
const test = require('node:test');

const {
  answerQuestion,
  calculateFpp,
  knowledgeBase,
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

function getIntent(intent) {
  const item = knowledgeBase.find((candidate) => candidate.intent === intent);
  assert.ok(item, `No existe la intención ${intent}`);
  return item;
}

function maxScore(message) {
  return Math.max(...knowledgeBase.map((item) => scoreIntent(message, item)));
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

test('KNOWN_TO_IMPROVE: Hola Lia conserva el fallback actual', () => {
  assertCurrentClassification({
    input: 'Hola Lia.',
    intent: 'no_reconocida',
    fallback: true,
    score: 0,
    confidence: undefined,
  });
});

for (const courtesy of ['Gracias.', 'Muchas gracias.', 'Adiós.', 'Hasta luego.']) {
  test(`KNOWN_TO_IMPROVE: cortesía conserva fallback actual: ${courtesy}`, () => {
    assertCurrentClassification({
      input: courtesy,
      intent: 'no_reconocida',
      fallback: true,
      score: 0,
      confidence: undefined,
    });
  });
}

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
    answerIncludes: /registrar laboratorios/,
  },
  {
    input: 'Quiero imprimir la ficha MSPAS.',
    intent: 'reportes',
    score: 7,
    confidence: 1,
    answerIncludes: /Generar censo mensual/,
    knownToImprove: 'MSPAS domina la coincidencia parcial de imprimir ficha.',
  },
  {
    input: '¿Cómo cierro un embarazo?',
    intent: 'no_reconocida',
    score: 1.5,
    confidence: undefined,
    fallback: true,
    knownToImprove: 'Cerrar embarazo es una función real sin regla actual.',
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
    intent: 'usuarios',
    score: 7,
    confidence: 1,
    answerIncludes: /gestionar usuarios/,
    knownToImprove: 'La conjugación cambio no coincide con cambiar_password.',
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
    intent: 'no_reconocida',
    fallback: true,
    score: 0,
    confidence: undefined,
    expectedCurrentResult: 'Fallback estándar en vez de saludo.',
  },
  {
    input: 'Gracias.',
    intent: 'no_reconocida',
    fallback: true,
    score: 0,
    confidence: undefined,
    expectedCurrentResult: 'Fallback estándar en vez de cortesía.',
  },
  {
    input: 'Adiós.',
    intent: 'no_reconocida',
    fallback: true,
    score: 0,
    confidence: undefined,
    expectedCurrentResult: 'Fallback estándar en vez de despedida.',
  },
  {
    input: 'Quiero imprimir la ficha MSPAS.',
    intent: 'reportes',
    fallback: false,
    score: 7,
    confidence: 1,
    answerIncludes: /Generar censo mensual/,
    expectedCurrentResult: 'Guía de reportes en vez de impresión de expediente.',
  },
  {
    input: 'Estoy en el expediente y no sé qué hacer.',
    intent: 'buscar_paciente',
    fallback: false,
    score: 7,
    confidence: 1,
    answerIncludes: /buscar una paciente/,
    expectedCurrentResult: 'Guía para buscar aunque el usuario ya está dentro.',
  },
  {
    input: 'No encuentro el botón para editar.',
    intent: 'ayuda_bot',
    fallback: false,
    score: 7,
    confidence: 1,
    answerIncludes: /ayudarte con el sistema/,
    expectedCurrentResult: 'bot coincide como subcadena dentro de botón.',
  },
  {
    input: 'Quiero saber si esta paciente tiene VIH.',
    intent: 'laboratorio',
    fallback: false,
    score: 7,
    confidence: 1,
    answerIncludes: /registrar laboratorios/,
    expectedCurrentResult: 'Guía de laboratorio ante una solicitud sensible.',
  },
  {
    input: '¿Qué medicamento debo darle?',
    intent: 'no_reconocida',
    fallback: true,
    score: 1,
    confidence: undefined,
    expectedCurrentResult: 'Fallback genérico sin rechazo clínico específico.',
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
  test(`KNOWN_TO_IMPROVE: ${problem.input} — ${problem.expectedCurrentResult}`, () => {
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

test('colisión vacunas vs editar_vacuna conserva el empate resuelto por orden', () => {
  const input = 'Editar vacuna';
  assert.equal(scoreIntent(input, getIntent('vacunas')), 8);
  assert.equal(scoreIntent(input, getIntent('editar_vacuna')), 8);
  assert.equal(answerQuestion(input).intent, 'vacunas');
});

test('colisión laboratorio vs solicitud sensible de VIH conserva laboratorio', () => {
  const input = 'Quiero saber si esta paciente tiene VIH.';
  assert.equal(scoreIntent(input, getIntent('laboratorio')), 7);
  assert.equal(answerQuestion(input).intent, 'laboratorio');
});

test('colisión reportes vs impresión MSPAS conserva reportes', () => {
  const input = 'Quiero imprimir la ficha MSPAS.';
  assert.equal(scoreIntent(input, getIntent('reportes')), 7);
  assert.equal(scoreIntent(input, getIntent('impresion_no_disponible')), 3);
  assert.equal(answerQuestion(input).intent, 'reportes');
});

test('colisión usuarios vs contraseña olvidada favorece la frase específica', () => {
  const input = 'Olvidé mi contraseña';
  assert.equal(scoreIntent(input, getIntent('usuarios')), 7);
  assert.equal(scoreIntent(input, getIntent('olvido_contrasena')), 8);
  assert.equal(answerQuestion(input).intent, 'olvido_contrasena');
});

test('KNOWN_TO_IMPROVE: una clave que no funciona cae en usuarios', () => {
  const input = 'Mi clave no funciona';
  assert.equal(scoreIntent(input, getIntent('usuarios')), 7);
  assert.equal(scoreIntent(input, getIntent('olvido_contrasena')), 1.5);
  assert.equal(answerQuestion(input).intent, 'usuarios');
});

test('colisión buscar_paciente vs estar dentro del expediente conserva búsqueda', () => {
  const input = 'Estoy en el expediente y no sé qué hacer.';
  assert.equal(scoreIntent(input, getIntent('buscar_paciente')), 7);
  assert.equal(scoreIntent(input, getIntent('secciones_expediente')), 2);
  assert.equal(answerQuestion(input).intent, 'buscar_paciente');
});

test('KNOWN_TO_IMPROVE: seguimiento postparto cae en citas_seguimiento', () => {
  const input = 'Seguimiento de la madre después de dar a luz';
  assert.equal(scoreIntent(input, getIntent('citas_seguimiento')), 7);
  assert.equal(scoreIntent(input, getIntent('puerperio')), 1);
  assert.equal(answerQuestion(input).intent, 'citas_seguimiento');
});

test('KNOWN_TO_IMPROVE: eliminar domina a editar aunque esté negado', () => {
  const input = 'No quiero eliminar, quiero editar.';
  assert.equal(scoreIntent(input, getIntent('eliminar_registro')), 7);
  assert.equal(scoreIntent(input, getIntent('editar_paciente')), 1.5);
  assert.equal(answerQuestion(input).intent, 'eliminar_registro');
});

test('catálogo conserva exactamente las 38 intenciones actuales y su orden', () => {
  assert.equal(knowledgeBase.length, 38);
  assert.deepEqual(knowledgeBase.map((item) => item.intent), EXPECTED_INTENTS);
});

test('IDs de intención del catálogo son únicos', () => {
  const ids = knowledgeBase.map((item) => item.intent);
  assert.equal(new Set(ids).size, ids.length);
});

test('cada intención tiene título, respuesta y al menos una keyword no vacía', () => {
  for (const item of knowledgeBase) {
    assert.equal(typeof item.intent, 'string');
    assert.ok(item.intent.trim().length > 0, 'ID de intención vacío');
    assert.equal(typeof item.title, 'string');
    assert.ok(item.title.trim().length > 0, `Título vacío en ${item.intent}`);
    assert.equal(typeof item.answer, 'string');
    assert.ok(item.answer.trim().length > 0, `Respuesta vacía en ${item.intent}`);
    assert.ok(Array.isArray(item.keywords), `Keywords inválidas en ${item.intent}`);
    assert.ok(item.keywords.length > 0, `Sin keywords en ${item.intent}`);

    for (const keyword of item.keywords) {
      assert.equal(typeof keyword, 'string');
      assert.ok(keyword.trim().length > 0, `Keyword vacía en ${item.intent}`);
    }
  }
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
    knowledgeBase.slice(0, 6).map((item) => item.title)
  );
});

test('mensaje vacío devuelve las cuatro sugerencias actuales', () => {
  const result = answerQuestion('   ');
  assert.equal(result.intent, 'mensaje_vacio');
  assert.equal(result.recognized, false);
  assert.deepEqual(
    result.suggestions,
    knowledgeBase.slice(0, 4).map((item) => item.title)
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
