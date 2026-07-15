const {
  chatbotKnowledge,
  laboratoryViewPatterns,
  operationalPriorityRules,
} = require('../config/chatbotKnowledge');
const {
  CLINICAL_DISCLAIMER,
  DEFAULT_CLOSING,
  DEFAULT_OPENING,
  FRIENDLY_CLOSINGS,
  FRIENDLY_OPENINGS,
  SPECIAL_RESPONSES,
  SPECIAL_SUGGESTIONS,
  STEP_CONNECTORS,
} = require('../config/chatbotSpecialResponses');

const DAY_MS = 24 * 60 * 60 * 1000;

// Export legado: conserva la forma pública previa sin duplicar el catálogo canónico.
const knowledgeBase = chatbotKnowledge.map(({ id, suggestions, ...item }) => ({
  intent: id,
  ...item,
}));

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9/\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter((word) => word.length > 2);
}

function scoreIntent(message, item) {
  const normalizedMessage = normalizeText(message);
  const messageTokens = new Set(tokenize(normalizedMessage));

  return item.keywords.reduce((bestScore, keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    const keywordTokens = tokenize(normalizedKeyword);

    const containsWholePhrase = (` ${normalizedMessage} `).includes(` ${normalizedKeyword} `);
    if (containsWholePhrase) {
      return Math.max(bestScore, 6 + keywordTokens.length);
    }

    const matches = keywordTokens.filter((token) => messageTokens.has(token)).length;
    if (!matches) return bestScore;

    const tokenScore = (matches / Math.max(keywordTokens.length, 1)) * 3;
    return Math.max(bestScore, tokenScore);
  }, 0);
}

function parseFurDate(message) {
  const normalized = normalizeText(message);
  const isoMatch = normalized.match(/\b(20\d{2}|19\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  const localMatch = normalized.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2}|19\d{2})\b/);

  let year;
  let month;
  let day;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (localMatch) {
    day = Number(localMatch[1]);
    month = Number(localMatch[2]);
    year = Number(localMatch[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isValid ? date : null;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function calculateFpp(furDate) {
  return new Date(furDate.getTime() + 280 * DAY_MS);
}

function buildFppResponse(message, baseAnswer) {
  const furDate = parseFurDate(message);
  if (!furDate) return baseAnswer;

  const fppDate = calculateFpp(furDate);
  return `Con FUR ${formatDate(furDate)}, la FPP aproximada es ${formatDate(fppDate)}.\n\nUsé la fórmula FPP = FUR + 280 días. Puedes registrarla en el campo FPP correspondiente y confirmar que coincida con el criterio del servicio.`;
}

function findBestIntent(message) {
  const ranked = chatbotKnowledge
    .map((item) => ({ ...item, score: scoreIntent(message, item) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 2 ? ranked[0] : null;
}

function isSimpleGreeting(message) {
  const normalized = normalizeText(message);
  return [
    /^hola(?: lia)?(?: necesito ayuda| ayudame| puedes ayudarme)?$/,
    /^buen(?:os)? dias?(?: lia)?$/,
    /^buenas(?: tardes| noches)?(?: lia)?$/,
    /^hey(?: lia)?$/,
    /^holi(?: lia)?$/,
    /^que tal(?: lia)?$/,
    /^como estas(?: lia)?$/,
  ].some((pattern) => pattern.test(normalized));
}

function isSimpleThanks(message) {
  const normalized = normalizeText(message);
  return [
    /^(?:muchas )?gracias(?: lia)?$/,
    /^te lo agradezco(?: lia)?$/,
    /^(?:perfecto|listo) gracias(?: lia)?$/,
    /^buena onda(?: gracias)?$/,
  ].some((pattern) => pattern.test(normalized));
}

function isSimpleFarewell(message) {
  const normalized = normalizeText(message);
  return /^(?:adios|hasta luego|nos vemos|chao|hasta manana|eso es todo|ya termine)(?: lia)?$/.test(normalized);
}

function withoutSocialLeadIn(message) {
  return normalizeText(message).replace(
    /^(?:(?:hola|hey|holi)(?: lia)?|buen(?:os)? dias?(?: lia)?|buenas(?: tardes| noches)?(?: lia)?|(?:muchas )?gracias(?: lia)?)\s+/,
    ''
  );
}

function findOperationalSafetyException(message) {
  const normalized = withoutSocialLeadIn(message);
  const treatmentRegistration = /^(?:donde|en donde|como) (?:registro|registrar|escribo|ingreso|anoto|documento) (?:el |un )?(?:medicamento|tratamiento)(?: indicado)?(?: en el sistema)?$/;

  if (treatmentRegistration.test(normalized)) return 'morbilidad';
  return null;
}

function findNegatedOperationalRequest(message) {
  const normalized = withoutSocialLeadIn(message);
  const limitedNegation = '(?:no quiero|no deseo|no necesito|no voy a)';

  const editControl = new RegExp(
    `^${limitedNegation} (?:eliminar|borrar) (?:el )?control(?: prenatal)? (?:pero )?(?:solo )?(?:quiero |deseo |necesito )?(?:editarlo|corregirlo|editar(?: el control)?|corregir(?: el control)?)$`
  );
  if (editControl.test(normalized)) return { intent: 'editar_control_prenatal' };

  const searchPatient = new RegExp(
    `^${limitedNegation} (?:crear|registrar) (?:otra )?paciente (?:pero )?(?:solo )?(?:quiero |deseo |necesito )?(?:buscarla|encontrarla|buscar(?: la paciente)?)$`
  );
  if (searchPatient.test(normalized)) return { intent: 'buscar_paciente' };

  const ambiguousEdit = new RegExp(
    `^${limitedNegation} (?:eliminar|borrar)(?: (?:el |la |un |una )?[a-z0-9]+)? (?:pero )?(?:solo )?(?:quiero |deseo |necesito )?(?:editar|corregir)(?:lo|la)?$`
  );
  if (ambiguousEdit.test(normalized)) return { clarification: true };

  return null;
}

function findOperationalPriority(message) {
  const normalized = withoutSocialLeadIn(message);

  const negatedRequest = findNegatedOperationalRequest(normalized);
  if (negatedRequest) return negatedRequest;

  for (const rule of operationalPriorityRules) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return { intent: rule.id };
    }
  }

  return null;
}

function getClinicalDataRequest(message) {
  const normalized = withoutSocialLeadIn(message);
  const patterns = [
    /^(?:esta|la) paciente tiene vih$/,
    /^quiero saber si (?:esta|la) paciente tiene vih$/,
    /^quiero saber (?:el )?resultado (?:de )?vih de (?:esta|la) paciente$/,
    /^(?:cual|que) es (?:el )?resultado (?:de )?vih(?: de (?:esta|la) paciente)?$/,
    /^(?:cual|que) es su diagnostico$/,
    /^dime (?:los|sus) laboratorios de (?:esta|la) paciente$/,
    /^que enfermedad tiene(?: (?:esta|la) paciente)?$/,
    /^cual es su presion$/,
    /^muestrame (?:sus|los) datos clinicos(?: de (?:esta|la) paciente)?$/,
  ];

  if (!patterns.some((pattern) => pattern.test(normalized))) return null;
  return { mentionsVih: /\bvih\b/.test(normalized) };
}

function isClinicalAdviceRequest(message) {
  const normalized = withoutSocialLeadIn(message);
  return [
    /^que medicamento (?:debo darle|le doy|puedo darle|debo usar|recomiendas)$/,
    /^recomiendame (?:un )?medicamento$/,
    /^que tratamiento (?:le pongo|le doy|debo darle|debo usar|puedo darle|recomiendas)$/,
    /^(?:cual|que) es el diagnostico$/,
    /^que dosis (?:debo|puedo) (?:usar|dar|darle|indicar)$/,
    /^que hago si (?:la paciente )?tiene presion alta$/,
    /^es peligroso (?:este|ese) resultado$/,
    /^(?:debe|deberia) ser referida(?: la paciente)?$/,
  ].some((pattern) => pattern.test(normalized));
}

function buildOperationalGuardResponse(intent, message) {
  const item = chatbotKnowledge.find((candidate) => candidate.id === intent);
  if (!item) return null;

  const answer = item.id === 'calcular_fpp'
    ? buildFppResponse(message, item.answer)
    : item.answer;

  return {
    recognized: true,
    intent: item.id,
    title: item.title,
    answer: humanizeAnswer(item.id, answer),
    confidence: 1,
    disclaimer: CLINICAL_DISCLAIMER,
  };
}

function buildOperationalClarificationResponse() {
  return {
    recognized: false,
    intent: 'no_reconocida',
    answer: SPECIAL_RESPONSES.operationalClarification,
  };
}

function isLaboratoryViewRequest(message) {
  const normalized = withoutSocialLeadIn(message);
  return laboratoryViewPatterns.some((pattern) => pattern.test(normalized));
}

function conversationalizeSteps(answer) {
  let stepIndex = 0;

  return answer
    .replace(/^Para ([^:\n]+):\n/i, (_, topic) => `Para ${topic}, hazlo asi:\n`)
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*\d+\.\s+(.+)$/);
      if (!match) return line;

      const connector = STEP_CONNECTORS[Math.min(stepIndex, STEP_CONNECTORS.length - 1)];
      stepIndex += 1;
      const text = match[1].charAt(0).toLowerCase() + match[1].slice(1);
      return `${connector}, ${text}`;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function humanizeAnswer(intent, answer) {
  const opening = FRIENDLY_OPENINGS[intent] || DEFAULT_OPENING;
  const closing = FRIENDLY_CLOSINGS[intent] || DEFAULT_CLOSING;
  const body = conversationalizeSteps(answer);

  return [opening, body, closing].filter(Boolean).join('\n\n');
}

function answerQuestion(message) {
  const text = String(message || '').trim();
  if (!text) {
    return {
      recognized: false,
      intent: 'mensaje_vacio',
      answer: SPECIAL_RESPONSES.emptyMessage,
      suggestions: [...SPECIAL_SUGGESTIONS.emptyMessage],
    };
  }

  if (isSimpleGreeting(text)) {
    return {
      recognized: true,
      intent: 'saludo',
      answer: SPECIAL_RESPONSES.greeting,
      suggestions: [...SPECIAL_SUGGESTIONS.greeting],
    };
  }

  if (isSimpleThanks(text)) {
    return {
      recognized: true,
      intent: 'agradecimiento',
      answer: SPECIAL_RESPONSES.thanks,
    };
  }

  if (isSimpleFarewell(text)) {
    return {
      recognized: true,
      intent: 'despedida',
      answer: SPECIAL_RESPONSES.farewell,
    };
  }

  const operationalException = findOperationalSafetyException(text);
  if (operationalException) {
    return buildOperationalGuardResponse(operationalException, text);
  }

  const clinicalDataRequest = getClinicalDataRequest(text);
  if (clinicalDataRequest) {
    const permissionGuidance = clinicalDataRequest.mentionsVih
      ? SPECIAL_RESPONSES.vihPermission
      : '';

    return {
      recognized: true,
      intent: 'solicitud_dato_clinico',
      answer: `${SPECIAL_RESPONSES.clinicalData}${permissionGuidance}`,
    };
  }

  if (isClinicalAdviceRequest(text)) {
    return {
      recognized: true,
      intent: 'solicitud_consejo_clinico',
      answer: SPECIAL_RESPONSES.clinicalAdvice,
    };
  }

  const operationalPriority = findOperationalPriority(text);
  if (operationalPriority?.clarification) {
    return buildOperationalClarificationResponse();
  }
  if (operationalPriority?.intent) {
    return buildOperationalGuardResponse(operationalPriority.intent, text);
  }

  const bestIntent = findBestIntent(text);
  if (!bestIntent) {
    return {
      recognized: false,
      intent: 'no_reconocida',
      answer: SPECIAL_RESPONSES.fallback,
      suggestions: [...SPECIAL_SUGGESTIONS.fallback],
    };
  }

  let answer = bestIntent.answer;
  let humanizedIntent = bestIntent.id;
  if (bestIntent.id === 'calcular_fpp') {
    answer = buildFppResponse(text, bestIntent.answer);
  } else if (bestIntent.id === 'laboratorio' && isLaboratoryViewRequest(text)) {
    answer = SPECIAL_RESPONSES.laboratoryView;
    humanizedIntent = 'laboratorio_visualizacion';
  }

  return {
    recognized: true,
    intent: bestIntent.id,
    title: bestIntent.title,
    answer: humanizeAnswer(humanizedIntent, answer),
    confidence: Number(Math.min(bestIntent.score / 6, 1).toFixed(2)),
    disclaimer: CLINICAL_DISCLAIMER,
  };
}

module.exports = {
  answerQuestion,
  calculateFpp,
  knowledgeBase,
  normalizeText,
  parseFurDate,
  scoreIntent,
  tokenize,
};
