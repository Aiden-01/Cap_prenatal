const GUATEMALA_TIME_ZONE = 'America/Guatemala';

function getGuatemalaParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: GUATEMALA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getGuatemalaDateInputValue() {
  const parts = getGuatemalaParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getGuatemalaTimeInputValue() {
  const parts = getGuatemalaParts();
  return `${parts.hour}:${parts.minute}`;
}

function withGuatemalaTimeFallback(data, options = {}) {
  const { onlyWhenHoraIsPresent = false } = options;
  if (!data || data.hora) return data;
  if (onlyWhenHoraIsPresent && !Object.prototype.hasOwnProperty.call(data, 'hora')) return data;
  return { ...data, hora: getGuatemalaTimeInputValue() };
}

module.exports = {
  getGuatemalaDateInputValue,
  getGuatemalaTimeInputValue,
  withGuatemalaTimeFallback,
};
