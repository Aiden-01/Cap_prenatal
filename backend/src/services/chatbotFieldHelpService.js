const { chatbotFieldHelp } = require('../config/chatbotFieldHelp');
const { CHATBOT_ROUTE_OPERATIONAL_CONTEXT } = require('../config/chatbotContext');
const { SPECIAL_RESPONSES } = require('../config/chatbotSpecialResponses');

const GENERIC_FIELD_QUESTIONS = new Set([
  'que pongo aqui', 'que va aqui', 'que significa este campo',
  'no entiendo este campo', 'no entiendo este recuadro',
  'que debo escribir aqui', 'para que sirve este campo', 'que dato va aqui',
]);
const TAB_LABELS = Object.freeze({
  general: 'General', laboratorio: 'Laboratorio',
  suplementacion: 'Suplementación', orientaciones: 'Orientaciones',
});

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

function findGenericFieldHelp(message, context) {
  if (!GENERIC_FIELD_QUESTIONS.has(normalizeFieldQuestion(message))) return null;

  const route = CHATBOT_ROUTE_OPERATIONAL_CONTEXT[context?.route];
  const isControlForm = route?.section === 'control_prenatal'
    && route.form === context?.form
    && context?.section === 'control_prenatal';
  const tabLabel = isControlForm ? TAB_LABELS[context?.tab] : null;
  const field = isControlForm && tabLabel
    ? chatbotFieldHelp.find(({ id, section, tabs }) => id === context?.focusedField
      && section === context.section && tabs.includes(context.tab))
    : null;

  if (field) {
    return {
      recognized: true,
      intent: 'ayuda_campo_contextual',
      title: field.label,
      answer: `Estás en Control prenatal → ${tabLabel} → ${field.label}.\n\n${field.help}\n\n${field.expected}\n\n${field.operationalNote}`,
    };
  }

  const location = tabLabel ? `Veo que estás en Control prenatal → ${tabLabel}. `
    : isControlForm ? 'Veo que estás en Control prenatal. ' : '';
  return {
    recognized: true,
    intent: 'ayuda_campo_sin_foco',
    answer: `${location}${SPECIAL_RESPONSES.fieldHelpMissing}`,
  };
}

module.exports = { findExplicitFieldHelp, findGenericFieldHelp };
