export const APPOINTMENT_STATUS = Object.freeze({
  programada: Object.freeze({ label: "Programada", accessible: "cita programada", className: "is-programada" }),
  atendida: Object.freeze({ label: "Atendida", accessible: "cita atendida", className: "is-atendida" }),
  reprogramada: Object.freeze({ label: "Reprogramada", accessible: "cita reprogramada", className: "is-reprogramada" }),
  cancelada: Object.freeze({ label: "Cancelada", accessible: "cita cancelada", className: "is-cancelada" }),
  inasistente: Object.freeze({ label: "No asistió", accessible: "cita a la que no asistió", className: "is-inasistente" }),
});

export function getAppointmentStatus(status) {
  return APPOINTMENT_STATUS[status] || {
    label: "Estado no disponible",
    accessible: "cita con estado no disponible",
    className: "is-unknown",
  };
}
