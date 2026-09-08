import { isValidPregnancyId } from "./pregnancyState.js";

function isValidEntityId(value) {
  if (value === null || value === undefined) return false;
  return /^[1-9]\d*$/.test(String(value).trim());
}

export function canConsultPrenatalControl({
  canRead = false,
  pacienteId,
  embarazoId,
  controlId,
}) {
  return Boolean(
    canRead
    && isValidEntityId(pacienteId)
    && isValidPregnancyId(embarazoId)
    && isValidEntityId(controlId)
  );
}

export function canEditPrenatalControl({
  canConsult = false,
  canWrite = false,
  isReadOnly = true,
  pregnancyState,
}) {
  return Boolean(
    canConsult
    && canWrite
    && !isReadOnly
    && String(pregnancyState || "").trim().toLowerCase() === "activo"
  );
}

export function canCreatePrenatalControl({
  canWrite = false,
  pregnancyState,
  pregnancyId,
}) {
  return Boolean(
    canWrite
    && isValidPregnancyId(pregnancyId)
    && String(pregnancyState || "").trim().toLowerCase() === "activo"
  );
}

export function preparePrenatalControlUpdatePayload(payload, structuredAppointment) {
  const nextPayload = { ...payload };
  if (structuredAppointment?.id) delete nextPayload.cita_siguiente;
  return nextPayload;
}

export function prenatalControlDetailPath({ pacienteId, embarazoId, controlId }) {
  if (!isValidEntityId(pacienteId) || !isValidPregnancyId(embarazoId) || !isValidEntityId(controlId)) {
    return null;
  }

  return `/pacientes/${pacienteId}/controles/${controlId}/editar?embarazo_id=${encodeURIComponent(embarazoId)}`;
}
