const {
  chatbotKnowledge,
  laboratoryViewPatterns,
  operationalPriorityRules,
} = require('../config/chatbotKnowledge');
const {
  CHATBOT_GUIDE_IDS,
  chatbotGuides,
} = require('../config/chatbotGuides');
const {
  CLINICAL_DISCLAIMER,
  CONTEXT_RESPONSES,
  DEFAULT_CLOSING,
  DEFAULT_OPENING,
  FRIENDLY_CLOSINGS,
  FRIENDLY_OPENINGS,
  SPECIAL_RESPONSES,
  SPECIAL_SUGGESTIONS,
  STEP_CONNECTORS,
} = require('../config/chatbotSpecialResponses');

const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_INTENT_IDS = new Set(chatbotKnowledge.map((item) => item.id));
const GUIDE_ID_SET = new Set(CHATBOT_GUIDE_IDS);
const GUIDE_RESUME_SUGGESTIONS = Object.freeze([
  'Continuar guía',
  'Repetir paso',
  'Cancelar',
]);

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

function hasContextPermission(context, permission) {
  return Array.isArray(context?.permissions) && context.permissions.includes(permission);
}

function adaptAnswerToContext(intent, baseAnswer, context) {
  if (!context) return baseAnswer;

  if (intent === 'secciones_expediente' && context.module === 'expediente') {
    return CONTEXT_RESPONSES.expedienteOverview;
  }

  if (intent === 'control_prenatal') {
    if (!context.hasPatientContext || !context.hasPregnancyContext) {
      return CONTEXT_RESPONSES.controlMissingContext;
    }
    if (context.pregnancyStatus === 'cerrado') return CONTEXT_RESPONSES.controlReadOnly;
    if (context.pregnancyStatus === 'puerperio') return CONTEXT_RESPONSES.controlNotActive;
    if (context.pregnancyStatus === null) return CONTEXT_RESPONSES.controlUnknownStatus;
    if (!hasContextPermission(context, 'controles.crear')) {
      return CONTEXT_RESPONSES.controlMissingPermission;
    }
  }

  if (intent === 'vacunas') {
    if (!context.hasPatientContext || !context.hasPregnancyContext) {
      return CONTEXT_RESPONSES.vaccineMissingContext;
    }
    if (context.pregnancyStatus === 'cerrado') return CONTEXT_RESPONSES.vaccineReadOnly;
    if (!hasContextPermission(context, 'controles.crear')) {
      return CONTEXT_RESPONSES.vaccineMissingPermission;
    }
  }

  if (intent === 'cerrar_embarazo') {
    if (!context.hasPregnancyContext) return CONTEXT_RESPONSES.closeMissingPregnancy;
    if (context.pregnancyStatus === 'cerrado') return CONTEXT_RESPONSES.closeAlreadyClosed;
    if (!hasContextPermission(context, 'pacientes.editar')) {
      return CONTEXT_RESPONSES.closeMissingPermission;
    }
  }

  if (intent === 'usuarios') {
    return hasContextPermission(context, 'usuarios.gestionar')
      ? CONTEXT_RESPONSES.usersAllowed
      : CONTEXT_RESPONSES.usersRestricted;
  }

  return baseAnswer;
}

function buildContextualEditResponse(message, context) {
  if (!context) return null;
  const normalized = withoutSocialLeadIn(message);
  const isEditButtonQuestion = [
    /^no encuentro el boton para editar$/,
    /^el boton de editar no aparece$/,
    /^donde esta el boton para editar$/,
  ].some((pattern) => pattern.test(normalized));

  if (!isEditButtonQuestion) return null;

  let answer = CONTEXT_RESPONSES.editClarification;
  if (context.pregnancyStatus === 'cerrado') {
    answer = CONTEXT_RESPONSES.editReadOnly;
  } else if (!hasContextPermission(context, 'pacientes.editar')) {
    answer = CONTEXT_RESPONSES.editMissingPermission;
  }

  return {
    recognized: true,
    intent: 'secciones_expediente',
    title: 'Edición en el expediente',
    answer,
    confidence: 1,
    disclaimer: CLINICAL_DISCLAIMER,
  };
}

function buildContextualCloseResponse(message, context) {
  if (!context) return null;
  const normalized = withoutSocialLeadIn(message);
  if (!/^como (?:cierro|cerrar) el embarazo$/.test(normalized)) return null;

  return buildOperationalGuardResponse('cerrar_embarazo', message, context);
}

function buildOperationalGuardResponse(intent, message, context) {
  const item = chatbotKnowledge.find((candidate) => candidate.id === intent);
  if (!item) return null;

  const baseAnswer = item.id === 'calcular_fpp'
    ? buildFppResponse(message, item.answer)
    : item.answer;
  const answer = adaptAnswerToContext(item.id, baseAnswer, context);

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

function answerQuestionWithoutConversation(message, context) {
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
    return buildOperationalGuardResponse(operationalException, text, context);
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

  const contextualEditResponse = buildContextualEditResponse(text, context);
  if (contextualEditResponse) return contextualEditResponse;

  const contextualCloseResponse = buildContextualCloseResponse(text, context);
  if (contextualCloseResponse) return contextualCloseResponse;

  const operationalPriority = findOperationalPriority(text);
  if (operationalPriority?.clarification) {
    return buildOperationalClarificationResponse();
  }
  if (operationalPriority?.intent) {
    return buildOperationalGuardResponse(operationalPriority.intent, text, context);
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
  answer = adaptAnswerToContext(bestIntent.id, answer, context);

  return {
    recognized: true,
    intent: bestIntent.id,
    title: bestIntent.title,
    answer: humanizeAnswer(humanizedIntent, answer),
    confidence: Number(Math.min(bestIntent.score / 6, 1).toFixed(2)),
    disclaimer: CLINICAL_DISCLAIMER,
  };
}

function createConversationState(lastIntent = null, activeGuide = null, currentStep = null) {
  return {
    lastIntent,
    activeGuide,
    currentStep,
    totalSteps: activeGuide ? chatbotGuides[activeGuide].steps.length : null,
  };
}

function getGuideAction(message) {
  const normalized = normalizeText(message);
  if (/^(?:siguiente|continuar(?: guia)?|ya lo hice|y despues)$/.test(normalized)) {
    return 'next';
  }
  if (/^(?:anterior|volver|volver al paso anterior)$/.test(normalized)) {
    return 'previous';
  }
  if (/^(?:repite|repetir|repetir paso|no entendi)$/.test(normalized)) {
    return 'repeat';
  }
  if (/^(?:cancelar|dejemoslo|empecemos de nuevo)$/.test(normalized)) {
    return 'cancel';
  }
  return null;
}

function isGuideStartRequest(message) {
  const normalized = normalizeText(message);
  return /\b(?:guiame|acompaname)\b/.test(normalized)
    || /\bpaso a paso\b/.test(normalized);
}

function isEditFollowup(message) {
  return /^(?:y )?(?:como |para )?editarlo$/.test(normalizeText(message));
}

function guideStepSuggestions(step) {
  return step > 1
    ? ['Siguiente', 'Anterior', 'Repetir', 'Cancelar']
    : ['Siguiente', 'Repetir', 'Cancelar'];
}

function buildGuideBlocker(guide, context) {
  const requirements = guide.requirements;
  if (!context) {
    return 'No puedo iniciar o continuar esta guía sin el contexto seguro de pantalla y permisos. Abre la pantalla correspondiente e inténtalo de nuevo.';
  }

  if (requirements.hasPatientContext && !context.hasPatientContext) {
    return 'Primero abre el expediente de una paciente. Lia no ejecutará cambios ni buscará datos clínicos por su cuenta.';
  }
  if (requirements.hasPregnancyContext && !context.hasPregnancyContext) {
    return 'Primero selecciona un embarazo dentro del expediente para usar esta guía.';
  }

  if (
    requirements.allowedStatuses
    && !requirements.allowedStatuses.includes(context.pregnancyStatus)
  ) {
    if (context.pregnancyStatus === 'cerrado') {
      return 'El embarazo seleccionado está cerrado y permanece en solo lectura; esta guía no puede continuar.';
    }
    if (context.pregnancyStatus === 'puerperio') {
      return 'Esta guía requiere un embarazo activo; el embarazo seleccionado está en puerperio.';
    }
    return 'Confirma en el expediente el estado del embarazo antes de continuar esta guía.';
  }

  if (requirements.blockedStatuses?.includes(context.pregnancyStatus)) {
    return 'El embarazo seleccionado está cerrado y permanece en solo lectura; esta guía no puede continuar.';
  }

  const permissions = Array.isArray(context.permissions) ? context.permissions : [];
  const missingAll = requirements.permissionsAll?.filter(
    (permission) => !permissions.includes(permission)
  ) || [];
  if (missingAll.length) {
    return `Según el contexto informativo de tu sesión, no aparece ${missingAll.length === 1 ? 'el permiso' : 'alguno de los permisos'} ${missingAll.join(', ')}. La autorización real siempre la confirma el backend.`;
  }

  if (
    requirements.permissionsAny?.length
    && !requirements.permissionsAny.some((permission) => permissions.includes(permission))
  ) {
    return `Según el contexto informativo de tu sesión, no aparece ninguno de estos permisos: ${requirements.permissionsAny.join(', ')}. La autorización real siempre la confirma el backend.`;
  }

  return null;
}

function buildGuideStepResponse(guide, step, {
  intent,
  lead = '',
  prefix = '',
} = {}) {
  const totalSteps = guide.steps.length;
  const parts = [prefix, lead, `Paso ${step} de ${totalSteps}: ${guide.steps[step - 1]}`]
    .filter(Boolean);

  return {
    recognized: true,
    intent: intent || guide.id,
    title: `Guía: ${guide.title}`,
    answer: parts.join('\n\n'),
    confidence: 1,
    disclaimer: CLINICAL_DISCLAIMER,
    suggestions: guideStepSuggestions(step),
    conversation: createConversationState(guide.id, guide.id, step),
  };
}

function startGuide(guideId, context, prefix = '') {
  const guide = chatbotGuides[guideId];
  const blocker = buildGuideBlocker(guide, context);
  if (blocker) {
    return {
      recognized: true,
      intent: guide.id,
      title: `Guía: ${guide.title}`,
      answer: [prefix, blocker].filter(Boolean).join('\n\n'),
      confidence: 1,
      disclaimer: CLINICAL_DISCLAIMER,
      suggestions: [...guide.completionSuggestions],
      conversation: createConversationState(guide.id),
    };
  }

  return buildGuideStepResponse(guide, 1, {
    lead: guide.intro,
    prefix,
  });
}

function handleGuideAction(action, conversation, context) {
  const guide = chatbotGuides[conversation.activeGuide];
  const step = conversation.currentStep;

  if (action === 'cancel') {
    return {
      recognized: true,
      intent: 'guia_cancelada',
      answer: `Cancelé la guía de ${guide.title}. El historial visible permanece en este chat.`,
      suggestions: [...guide.completionSuggestions],
      conversation: createConversationState(guide.id),
    };
  }

  const blocker = buildGuideBlocker(guide, context);
  if (blocker) {
    return {
      recognized: true,
      intent: 'guia_bloqueada',
      answer: `Detuve la guía de ${guide.title}. ${blocker}`,
      suggestions: [...guide.completionSuggestions],
      conversation: createConversationState(guide.id),
    };
  }

  if (action === 'next' && step === guide.steps.length) {
    return {
      recognized: true,
      intent: 'guia_finalizada',
      title: `Guía completada: ${guide.title}`,
      answer: `Terminaste los ${guide.steps.length} pasos. ${guide.completionMessage}`,
      suggestions: [...guide.completionSuggestions],
      conversation: createConversationState(guide.id),
    };
  }

  if (action === 'next') {
    return buildGuideStepResponse(guide, step + 1, { intent: 'guia_siguiente' });
  }

  if (action === 'previous') {
    const previousStep = Math.max(1, step - 1);
    const lead = step === 1 ? 'Ya estás en el primer paso.' : 'Volvemos un paso.';
    return buildGuideStepResponse(guide, previousStep, {
      intent: 'guia_anterior',
      lead,
    });
  }

  return buildGuideStepResponse(guide, step, {
    intent: 'guia_repetir',
    lead: 'Repetimos el paso actual.',
  });
}

function buildEditFollowupResponse(sourceIntent, message, context) {
  const editFollowup = chatbotGuides[sourceIntent]?.editFollowup;
  if (!editFollowup) {
    return {
      recognized: false,
      intent: 'no_reconocida',
      answer: 'Indícame qué registro deseas editar para orientarte sin asumir un módulo.',
    };
  }

  if (context?.pregnancyStatus === 'cerrado' && chatbotGuides[sourceIntent].module === 'expediente') {
    return {
      recognized: true,
      intent: editFollowup.intent,
      answer: 'El embarazo seleccionado está cerrado y permanece en solo lectura; no se pueden editar sus registros.',
    };
  }

  if (!hasContextPermission(context, editFollowup.permission)) {
    return {
      recognized: true,
      intent: editFollowup.intent,
      answer: `Según el contexto informativo de tu sesión, no aparece el permiso ${editFollowup.permission} para editar ${editFollowup.label}. La autorización real la confirma el backend.`,
    };
  }

  return buildOperationalGuardResponse(editFollowup.intent, message, context);
}

function preserveActiveGuide(result, conversation) {
  return {
    ...result,
    suggestions: [...GUIDE_RESUME_SUGGESTIONS],
    conversation: createConversationState(
      conversation.activeGuide,
      conversation.activeGuide,
      conversation.currentStep
    ),
  };
}

function answerQuestion(message, context, conversation) {
  const text = String(message || '').trim();
  const wantsGuide = isGuideStartRequest(text);

  // Compatibilidad estricta: clientes que no usan memoria conservan la forma
  // previa, salvo cuando solicitan explicitamente una guia nueva.
  if (conversation === undefined && !wantsGuide) {
    return answerQuestionWithoutConversation(text, context);
  }

  const state = conversation || createConversationState();
  const action = getGuideAction(text);

  if (state.activeGuide && action) {
    return handleGuideAction(action, state, context);
  }

  if (!state.activeGuide && action) {
    return {
      recognized: true,
      intent: 'guia_sin_activa',
      answer: 'No hay una guía activa. Dime qué proceso deseas hacer paso a paso.',
      conversation: createConversationState(state.lastIntent),
    };
  }

  if (isEditFollowup(text) && (state.activeGuide || GUIDE_ID_SET.has(state.lastIntent))) {
    const sourceIntent = state.activeGuide || state.lastIntent;
    const result = buildEditFollowupResponse(sourceIntent, text, context);
    if (state.activeGuide) return preserveActiveGuide(result, state);

    const nextIntent = KNOWN_INTENT_IDS.has(result.intent) ? result.intent : state.lastIntent;
    return {
      ...result,
      conversation: createConversationState(nextIntent),
    };
  }

  const result = answerQuestionWithoutConversation(text, context);

  if (wantsGuide && GUIDE_ID_SET.has(result.intent)) {
    const prefix = state.activeGuide
      ? state.activeGuide === result.intent
        ? `Reiniciamos la guía de ${chatbotGuides[result.intent].title}.`
        : `Cambiamos de tema y cierro la guía de ${chatbotGuides[state.activeGuide].title}.`
      : '';
    return startGuide(result.intent, context, prefix);
  }

  if (state.activeGuide) {
    const guide = chatbotGuides[state.activeGuide];
    const preservesGuide = !result.recognized
      || guide.relatedIntents.includes(result.intent)
      || ['saludo', 'agradecimiento', 'despedida', 'solicitud_dato_clinico', 'solicitud_consejo_clinico']
        .includes(result.intent);

    if (preservesGuide) return preserveActiveGuide(result, state);

    const nextIntent = KNOWN_INTENT_IDS.has(result.intent) ? result.intent : guide.id;
    return {
      ...result,
      answer: `Cambiamos de tema y cierro la guía de ${guide.title}.\n\n${result.answer}`,
      conversation: createConversationState(nextIntent),
    };
  }

  const nextIntent = KNOWN_INTENT_IDS.has(result.intent) ? result.intent : state.lastIntent;
  return {
    ...result,
    conversation: createConversationState(nextIntent),
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
