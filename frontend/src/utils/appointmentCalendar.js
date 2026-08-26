const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const CALENDAR_DAY_COUNT = 42;
export const WEEKDAY_LABELS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

function pad(value) {
  return String(value).padStart(2, "0");
}

export function parseDateOnly(value) {
  const match = ISO_DATE_RE.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

export function toDateOnly({ year, month, day }) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function startOfMonth(value) {
  const parts = parseDateOnly(value);
  return parts ? toDateOnly({ ...parts, day: 1 }) : "";
}

export function addDaysDateOnly(value, amount) {
  const parts = parseDateOnly(value);
  if (!parts) return "";
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return toDateOnly({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function shiftMonth(value, amount) {
  const parts = parseDateOnly(startOfMonth(value));
  if (!parts) return "";
  const date = new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1));
  return toDateOnly({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: 1,
  });
}

export function getVisibleCalendarRange(monthValue) {
  const month = startOfMonth(monthValue);
  const parts = parseDateOnly(month);
  if (!parts) return { from: "", to: "" };
  const firstWeekday = new Date(Date.UTC(parts.year, parts.month - 1, 1)).getUTCDay();
  const from = addDaysDateOnly(month, -firstWeekday);
  return { from, to: addDaysDateOnly(from, CALENDAR_DAY_COUNT - 1) };
}

export function getCalendarDays(monthValue) {
  const { from } = getVisibleCalendarRange(monthValue);
  return Array.from({ length: CALENDAR_DAY_COUNT }, (_, index) => addDaysDateOnly(from, index));
}

export function todayInGuatemala(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isDateInMonth(dateValue, monthValue) {
  const date = parseDateOnly(dateValue);
  const month = parseDateOnly(startOfMonth(monthValue));
  return Boolean(date && month && date.year === month.year && date.month === month.month);
}

export function formatMonthLabel(value) {
  const parts = parseDateOnly(startOfMonth(value));
  return parts ? `${MONTH_NAMES[parts.month - 1]} ${parts.year}` : "";
}

export function formatDateDisplay(value) {
  const parts = parseDateOnly(value);
  return parts ? `${pad(parts.day)}-${pad(parts.month)}-${parts.year}` : "—";
}

export function formatAccessibleDate(value) {
  const parts = parseDateOnly(value);
  if (!parts) return "fecha no disponible";
  const numericDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  return new Intl.DateTimeFormat("es-GT", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(numericDate);
}

export function formatDayHeading(value) {
  const parts = parseDateOnly(value);
  return parts ? `${parts.day} DE ${MONTH_NAMES[parts.month - 1].toUpperCase()}` : "DÍA";
}

export function groupAppointmentsByDate(items) {
  return (Array.isArray(items) ? items : []).reduce((groups, item) => {
    if (!parseDateOnly(item?.date)) return groups;
    const current = groups.get(item.date) || [];
    current.push(item);
    groups.set(item.date, current);
    return groups;
  }, new Map());
}

export function isDateWithinRange(value, range) {
  return Boolean(parseDateOnly(value) && value >= range.from && value <= range.to);
}
