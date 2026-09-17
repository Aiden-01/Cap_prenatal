function dateParts(value) {
  if (!value) return null;
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function calculateAgeOnDate(birthDate, referenceDate) {
  const birth = dateParts(birthDate);
  const reference = dateParts(referenceDate);
  if (!birth || !reference) return null;
  const birthKey = birth.year * 10000 + birth.month * 100 + birth.day;
  const referenceKey = reference.year * 10000 + reference.month * 100 + reference.day;
  if (birthKey > referenceKey) return null;
  let age = reference.year - birth.year;
  if (reference.month < birth.month || (reference.month === birth.month && reference.day < birth.day)) age -= 1;
  return age;
}

export function deriveAgeRiskFactors(birthDate, referenceDate) {
  const age = calculateAgeOnDate(birthDate, referenceDate);
  return {
    valid: age !== null,
    age,
    menor_20_anos: age !== null && age < 20,
    mayor_35_anos: age !== null && age > 35,
  };
}
