export function parseClinicalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("T")[0].split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  const normalized = date.toISOString().slice(0, 10);
  if (normalized !== `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`) return null;
  return date;
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
