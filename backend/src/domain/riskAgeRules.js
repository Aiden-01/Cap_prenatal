const AUTOMATIC_AGE_FIELDS = Object.freeze(['menor_20_anos', 'mayor_35_anos']);
const RISK_FACTOR_FIELDS = Object.freeze([
  'muerte_fetal_neonatal_previa',
  'abortos_espontaneos_3mas',
  'gestas_3mas',
  'peso_ultimo_bebe_menor_2500g',
  'peso_ultimo_bebe_mayor_4500g',
  'antec_hipertension_preeclampsia',
  'cirugias_tracto_reproductivo',
  'embarazo_multiple',
  'menor_20_anos',
  'mayor_35_anos',
  'paciente_rh_negativo',
  'hemorragia_vaginal',
  'vih_positivo_sifilis',
  'presion_diastolica_90mas',
  'anemia',
  'desnutricion_obesidad',
  'dolor_abdominal',
  'sintomatologia_urinaria',
  'ictericia',
  'diabetes',
  'enfermedad_renal',
  'enfermedad_corazon',
  'hipertension_arterial',
  'consumo_drogas_alcohol_tabaco',
  'otra_enfermedad_severa',
]);

function canonicalFromParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeClinicalDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return canonicalFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value !== 'string') return null;

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const isoDateTime = value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
  const match = dateOnly || isoDateTime;
  if (!match || (isoDateTime && Number.isNaN(Date.parse(value)))) return null;
  return canonicalFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

function dateParts(value) {
  const normalized = normalizeClinicalDate(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return { year, month, day };
}

function calculateAgeOnDate(birthDate, referenceDate) {
  const birth = dateParts(birthDate);
  const reference = dateParts(referenceDate);
  if (!birth || !reference) return null;

  const birthKey = birth.year * 10000 + birth.month * 100 + birth.day;
  const referenceKey = reference.year * 10000 + reference.month * 100 + reference.day;
  if (birthKey > referenceKey) return null;

  let age = reference.year - birth.year;
  if (reference.month < birth.month || (reference.month === birth.month && reference.day < birth.day)) {
    age -= 1;
  }
  return age;
}

function deriveAgeRiskFactors(birthDate, referenceDate) {
  const age = calculateAgeOnDate(birthDate, referenceDate);
  if (age === null) {
    return {
      valid: false,
      age: null,
      menor_20_anos: false,
      mayor_35_anos: false,
    };
  }
  return {
    valid: true,
    age,
    menor_20_anos: age < 20,
    mayor_35_anos: age > 35,
  };
}

function applyAgeRiskFactors(risk = {}, birthDate, referenceDate = risk.fecha) {
  const derived = deriveAgeRiskFactors(birthDate, referenceDate);
  const canonical = {
    ...risk,
    menor_20_anos: derived.menor_20_anos,
    mayor_35_anos: derived.mayor_35_anos,
  };
  return {
    ...canonical,
    tiene_riesgo: RISK_FACTOR_FIELDS.some((field) => Boolean(canonical[field])),
  };
}

module.exports = {
  AUTOMATIC_AGE_FIELDS,
  RISK_FACTOR_FIELDS,
  applyAgeRiskFactors,
  calculateAgeOnDate,
  deriveAgeRiskFactors,
  normalizeClinicalDate,
};
