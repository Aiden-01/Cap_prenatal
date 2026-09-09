export function getMissingAppointmentTabState(items) {
  const count = Array.isArray(items) ? items.length : 0;
  return {
    label: `Sin próxima cita (${count})`,
    alert: count > 0,
  };
}
