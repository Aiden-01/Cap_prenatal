const { chatbotFieldHelp } = require('../config/chatbotFieldHelp');

function normalizeFieldQuestion(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function findExplicitFieldHelp(message) {
  const question = normalizeFieldQuestion(message);
  const match = question.match(/^(?:que significa|que va en|donde registro|donde se registra|como lleno) (?:el campo |la |el )?(.+)$/);
  if (!match) return null;
  const requested = match[1];
  // La consulta operacional existente de VIH conserva su intención laboratorio.
  if (question.startsWith('donde registro ') && requested === 'vih') return null;
  const matches = chatbotFieldHelp.filter((field) => [field.id, field.label, ...field.aliases]
    .some((name) => normalizeFieldQuestion(name) === requested));
  if (matches.length !== 1) return null;
  const field = matches[0];
  return {
    recognized: true,
    intent: 'ayuda_campo',
    title: field.label,
    answer: `${field.help}\n\n${field.expected}\n\n${field.operationalNote}`,
  };
}

module.exports = { findExplicitFieldHelp };
