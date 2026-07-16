const GUATEMALA_TIME_ZONE = "America/Guatemala";

function getGuatemalaParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GUATEMALA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function getGuatemalaDateInputValue(value = new Date()) {
  const parts = getGuatemalaParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getGuatemalaTimeInputValue(value = new Date()) {
  const parts = getGuatemalaParts(value);
  return `${parts.hour}:${parts.minute}`;
}
