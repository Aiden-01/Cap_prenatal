function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("T")[0].split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function calculateGestationalWeeks(fur, referenceDate) {
  const furDate = parseDateInput(fur);
  const targetDate = parseDateInput(referenceDate);
  if (!furDate || !targetDate) return "";

  const diffDays = Math.floor((targetDate.getTime() - furDate.getTime()) / 86400000);
  if (diffDays < 0) return "";
  return Math.floor(diffDays / 7);
}
