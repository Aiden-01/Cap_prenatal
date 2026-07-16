const PREGNANCY_STATES_BLOCKING_CREATION = new Set(["activo", "puerperio"]);

function pregnancyCandidates(expediente) {
  return [
    ...(Array.isArray(expediente?.embarazos) ? expediente.embarazos : []),
    expediente?.embarazo_actual,
    expediente?.embarazo_activo,
    expediente?.embarazo_seleccionado,
  ];
}

function normalizedPregnancyState(pregnancy) {
  return String(pregnancy?.estado || "").trim().toLowerCase();
}

export function isValidPregnancyId(value) {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim();
  return /^[1-9]\d*$/.test(normalized);
}

export function selectedPregnancy(expediente) {
  return expediente?.embarazo_seleccionado || expediente?.embarazo_activo || null;
}

export function hasSelectedPregnancy(expediente) {
  return isValidPregnancyId(selectedPregnancy(expediente)?.id);
}

export function hasPregnancyBlockingCreation(expediente) {
  return pregnancyCandidates(expediente).some((pregnancy) => (
    isValidPregnancyId(pregnancy?.id)
    && PREGNANCY_STATES_BLOCKING_CREATION.has(normalizedPregnancyState(pregnancy))
  ));
}

export function hasPuerperiumPregnancy(expediente) {
  return pregnancyCandidates(expediente).some((pregnancy) => (
    isValidPregnancyId(pregnancy?.id)
    && normalizedPregnancyState(pregnancy) === "puerperio"
  ));
}

export function canCreatePregnancy(expediente, canEditPatients) {
  return Boolean(canEditPatients) && !hasPregnancyBlockingCreation(expediente);
}

export function pregnancyActionLabel(expediente) {
  return Array.isArray(expediente?.embarazos) && expediente.embarazos.length > 0
    ? "Nuevo embarazo"
    : "Iniciar embarazo";
}

export function pregnancyActionConfirmation(expediente) {
  return pregnancyActionLabel(expediente) === "Iniciar embarazo"
    ? "Iniciar un embarazo para esta paciente?"
    : "Registrar un nuevo embarazo para esta paciente?";
}
