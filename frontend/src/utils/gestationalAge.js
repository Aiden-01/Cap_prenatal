import { normalizeClinicalDate } from "./riskAgeRules.js";

export function parseClinicalDate(value) {
  const normalized = normalizeClinicalDate(value);
  return normalized ? new Date(`${normalized}T00:00:00Z`) : null;
}

export function formatClinicalDate(value) {
  if (!value) return "—";
  const date = parseClinicalDate(value);
  return date ? date.toLocaleDateString("es-GT", { timeZone: "UTC" }) : "Sin fecha";
}

export function calculateGestationalAge(fur, referenceDate) {
  const furDate = parseClinicalDate(fur);
  const targetDate = parseClinicalDate(referenceDate);
  if (!furDate || !targetDate) return null;

  const diffDays = Math.floor((targetDate.getTime() - furDate.getTime()) / 86400000);
  if (diffDays < 0) return null;
  return {
    totalDays: diffDays,
    weeks: Math.floor(diffDays / 7),
    days: diffDays % 7,
  };
}

export function calculateGestationalWeeks(fur, referenceDate) {
  return calculateGestationalAge(fur, referenceDate)?.weeks ?? "";
}
