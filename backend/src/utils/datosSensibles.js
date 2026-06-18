const VIH_FIELDS = new Set([
  'vih_realizado',
  'vih_resultado',
  'vih_resultado_valor',
  'antec_vih_positivo',
  'vih_positivo_sifilis',
]);

function puedeVerVih(permisos = []) {
  return permisos.includes('controles.ver_vih');
}

function ocultarDatosVih(value, permisos = []) {
  if (puedeVerVih(permisos)) return value;
  if (Array.isArray(value)) return value.map((item) => ocultarDatosVih(item, permisos));
  if (!value || typeof value !== 'object') return value;

  const copy = {};
  for (const [key, child] of Object.entries(value)) {
    if (VIH_FIELDS.has(key)) continue;
    copy[key] = ocultarDatosVih(child, permisos);
  }
  return copy;
}

function filtrarCamposVih(data, permisos = []) {
  if (puedeVerVih(permisos)) return data;
  const copy = { ...data };
  for (const field of VIH_FIELDS) {
    delete copy[field];
  }
  return copy;
}

module.exports = {
  VIH_FIELDS,
  filtrarCamposVih,
  ocultarDatosVih,
  puedeVerVih,
};
