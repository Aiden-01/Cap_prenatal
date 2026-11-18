// Application options for the free-text fetal fields on the MSPAS form.
// The source form does not print an official enumeration.
export const FETAL_SITUATION_OPTIONS = ['Longitudinal', 'Transversa', 'Oblicua', 'No determinada'];
export const FETAL_PRESENTATION_OPTIONS = ['Cefálica', 'Pélvica/podálica', 'Hombro', 'Cara', 'Frente', 'Compuesta', 'No determinada'];

export function prepareControlClinicalPayload(payload, originalControl = null) {
  const next = { ...payload };
  // Catalog snapshots and the legacy combined text are never client-authored.
  delete next.cargo_atiende_snapshot;
  delete next.nombre_cargo_atiende;
  if (originalControl) {
    for (const field of ['nombre_atiende', 'cargo_atiende_id', 'situacion_fetal', 'presentacion_fetal']) {
      if (String(next[field] ?? '') === String(originalControl[field] ?? '')) delete next[field];
    }
  }
  return next;
}
