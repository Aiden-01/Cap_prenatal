// Captured text and selected cargo are declarations, not verified authorship.
// Never derive a name/cargo from the legacy combined field or the current catalog.
function controlAttendantName(control = {}) {
  return typeof control.nombre_atiende === 'string' ? control.nombre_atiende.trim() : '';
}
function controlAttendantRole(control = {}) {
  return typeof control.cargo_atiende_snapshot?.nombre === 'string'
    ? control.cargo_atiende_snapshot.nombre.trim() : '';
}
function formatControlAttendant(control = {}) {
  const parts = [controlAttendantName(control), controlAttendantRole(control)].filter(Boolean);
  return parts.length ? parts.join(' · ') : String(control.nombre_cargo_atiende || '');
}
module.exports = { controlAttendantName, controlAttendantRole, formatControlAttendant };
