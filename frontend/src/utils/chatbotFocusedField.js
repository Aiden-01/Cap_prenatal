const CONTROL_FIELD_TABS = Object.freeze({
  numero_control: "general",
  cita_siguiente: "general",
  acompanante: "general",
  semanas_gestacion: "general",
  hematologia: "laboratorio",
  vih: "laboratorio",
});

export function captureControlField(fieldId, tab, navigationKey) {
  if (typeof fieldId !== "string" || CONTROL_FIELD_TABS[fieldId] !== tab) return null;
  return { id: fieldId, tab, navigationKey };
}

export function currentControlField(snapshot, tab, navigationKey) {
  if (snapshot?.tab !== tab || snapshot?.navigationKey !== navigationKey) return null;
  return CONTROL_FIELD_TABS[snapshot.id] === tab ? snapshot.id : null;
}
