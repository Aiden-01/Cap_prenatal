const GUIDE_IDS = new Set([
  "registrar_paciente",
  "control_prenatal",
  "ficha_riesgo",
  "vacunas",
  "plan_parto",
  "cerrar_embarazo",
]);
const INTENT_CODE_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;

export function createEmptyConversation() {
  return {
    lastIntent: null,
    activeGuide: null,
    currentStep: null,
    totalSteps: null,
  };
}

export function normalizeConversationState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyConversation();
  }

  const lastIntent = typeof value.lastIntent === "string"
    && INTENT_CODE_PATTERN.test(value.lastIntent)
    ? value.lastIntent
    : null;
  const activeGuide = GUIDE_IDS.has(value.activeGuide) ? value.activeGuide : null;
  const currentStep = Number.isInteger(value.currentStep) && value.currentStep > 0
    ? value.currentStep
    : null;
  const totalSteps = Number.isInteger(value.totalSteps) && value.totalSteps > 0
    ? value.totalSteps
    : null;

  if (!activeGuide || !currentStep || !totalSteps || currentStep > totalSteps) {
    return {
      lastIntent,
      activeGuide: null,
      currentStep: null,
      totalSteps: null,
    };
  }

  return {
    lastIntent: activeGuide,
    activeGuide,
    currentStep,
    totalSteps,
  };
}

export function createConversationMemory(identityKey, value) {
  return {
    identityKey,
    state: normalizeConversationState(value),
  };
}

export function conversationForIdentity(memory, identityKey) {
  return memory?.identityKey === identityKey
    ? normalizeConversationState(memory.state)
    : createEmptyConversation();
}
