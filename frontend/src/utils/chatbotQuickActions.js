export const QUICK_ACTION_ROUTES = Object.freeze({
  dashboard: "/dashboard",
  pacientes: "/pacientes",
  nueva_paciente: "/nuevo",
  reportes: "/reportes",
  usuarios: "/usuarios",
  mapa_riesgo: "/mapa-riesgo",
  comunidades: "/comunidades",
});

const TARGETS = new Set([...Object.keys(QUICK_ACTION_ROUTES), "expediente_actual"]);

function exactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
}

function validText(value, maxLength) {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && value.length <= maxLength;
}

export function normalizeQuickActions(value) {
  if (!Array.isArray(value)) return [];
  const seen = {
    id: new Set(),
    label: new Set(),
    message: new Set(),
    target: new Set(),
  };
  const actions = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const isMessage = candidate.type === "message"
      && exactKeys(candidate, ["id", "label", "type", "message"])
      && validText(candidate.message, 160);
    const isNavigate = candidate.type === "navigate"
      && exactKeys(candidate, ["id", "label", "type", "target"])
      && TARGETS.has(candidate.target);
    if (
      (!isMessage && !isNavigate)
      || !validText(candidate.id, 80)
      || !/^[a-z][a-z0-9-]*$/.test(candidate.id)
      || !validText(candidate.label, 60)
      || seen.id.has(candidate.id)
      || seen.label.has(candidate.label)
      || (isMessage && seen.message.has(candidate.message))
      || (isNavigate && seen.target.has(candidate.target))
    ) continue;

    seen.id.add(candidate.id);
    seen.label.add(candidate.label);
    if (isMessage) seen.message.add(candidate.message);
    if (isNavigate) seen.target.add(candidate.target);
    actions.push({ ...candidate });
    if (actions.length === 4) break;
  }

  return actions;
}

export function chatbotContextKey(context) {
  return [
    context?.module || "otro",
    Boolean(context?.hasPatientContext),
    Boolean(context?.hasPregnancyContext),
    context?.pregnancyStatus || "ninguno",
  ].join("|");
}

export function visibleQuickActions(message, currentContextKey, activeGuide) {
  const actions = normalizeQuickActions(message?.quickActions);
  if (message?.quickActionsContextKey === currentContextKey) return actions;
  if (!message?.quickActionsGuide || message.quickActionsGuide !== activeGuide) return [];
  return actions.filter((action) => action.type === "message");
}

export function resolveQuickActionTarget(action, location, context) {
  if (action?.type !== "navigate") return null;
  if (action.target === "expediente_actual") {
    if (!context?.hasPatientContext) return null;
    return `${location?.pathname || ""}${location?.search || ""}` || null;
  }
  return QUICK_ACTION_ROUTES[action.target] || null;
}
