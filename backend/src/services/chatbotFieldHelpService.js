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
const FORM_SECTION_LABELS = Object.freeze({
  expediente: 'Paciente', ficha_riesgo: 'Ficha de riesgo',
  vacunas: 'Vacunas', puerperio: 'Puerperio',
  morbilidad: 'Morbilidad', plan_parto: 'Plan de parto',
});

function normalizeFieldQuestion(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function fieldMatchesContext(field, context) {
  const route = CHATBOT_ROUTE_OPERATIONAL_CONTEXT[context?.route];
  if (!route || route.form !== context?.form || route.section !== context?.section) return false;
  if (field.forms) return field.forms.includes(context.form);
  return field.section === context.section && field.tabs.includes(context.tab);
}

function findExplicitFieldHelp(message, context) {
  const question = normalizeFieldQuestion(message);
  if (question === 'que datos vienen precargados' && context?.section === 'plan_parto'
    && fieldMatchesContext({ forms: ['plan_parto'] }, context)) {
    return {
      recognized: true, intent: 'ayuda_campo', title: 'Datos precargados del plan de parto',
      answer: 'Al abrir un plan nuevo, el formulario propone datos de identificación, residencia y contacto desde el expediente; antecedentes obstétricos desde la paciente, el embarazo y la ficha de riesgo; y algunos signos y responsables desde controles previos. Puedes revisar y editar esos campos. La edad gestacional por UR se calcula con FUR y la fecha del plan y se muestra en solo lectura. La FPP puede venir precargada, pero este formulario no la recalcula al cambiar FUR.',
    };
  }
  const match = question.match(/^(?:que significa|que es|que va en|donde registro|donde se registra|como lleno) (?:el campo |la |el )?(.+)$/);
  if (!match) return null;
  const requested = match[1];
  // La consulta operacional existente de VIH conserva su intención laboratorio.
  if (question.startsWith('donde registro ') && requested === 'vih') return null;
  const planAlias = { fur: 'plan_parto_fur', fpp: 'plan_parto_fecha_probable_parto' }[requested];
  const planField = planAlias && chatbotFieldHelp.find((field) => field.id === planAlias
    && fieldMatchesContext(field, context));
  const matches = chatbotFieldHelp.filter((field) => [field.id, field.label, ...field.aliases]
    .some((name) => normalizeFieldQuestion(name) === requested));
  const contextual = matches.filter((field) => fieldMatchesContext(field, context));
  const field = planField || (contextual.length === 1 ? contextual[0] : matches.length === 1 ? matches[0] : null);
  if (!field && matches.length > 1 && /^(?:que significa|que es) /.test(question)
    && matches.every(({ help }) => help === matches[0].help)) {
    return {
      recognized: true, intent: 'ayuda_campo', title: requested.toUpperCase(),
      answer: `${matches[0].help} Dime si estás en el registro de paciente o en la ficha de riesgo para explicarte ese campo del formulario.`,
    };
  }
  if (!field) return null;
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
  const matchingRoute = route && route.form === context?.form && route.section === context?.section;
  const isControlForm = matchingRoute && route.section === 'control_prenatal';
  const tabLabel = isControlForm ? TAB_LABELS[context?.tab] : null;
  const field = chatbotFieldHelp.find((item) => item.id === context?.focusedField
    && fieldMatchesContext(item, context));

  if (field) {
    return {
      recognized: true,
      intent: 'ayuda_campo_contextual',
      title: field.label,
      answer: `Estás en ${field.forms ? FORM_SECTION_LABELS[field.section] : `Control prenatal → ${tabLabel}`} → ${field.label}.\n\n${field.help}\n\n${field.expected}\n\n${field.operationalNote}`,
    };
  }

  const location = tabLabel ? `Veo que estás en Control prenatal → ${tabLabel}. `
    : isControlForm ? 'Veo que estás en Control prenatal. '
      : matchingRoute && context.section === 'ficha_riesgo' ? 'Veo que estás en la Ficha de riesgo. '
        : matchingRoute && context.section === 'vacunas' ? 'Veo que estás en Vacunas. '
          : matchingRoute && context.section === 'puerperio' ? 'Veo que estás en Puerperio. '
            : matchingRoute && context.section === 'morbilidad' ? 'Veo que estás en Morbilidad. '
              : matchingRoute && context.section === 'plan_parto' ? 'Veo que estás en Plan de parto. '
        : matchingRoute && ['nueva_paciente', 'editar_paciente'].includes(context.form)
          ? 'Veo que estás en el formulario de paciente. ' : '';
  return {
    recognized: true,
    intent: 'ayuda_campo_sin_foco',
    answer: `${location}${SPECIAL_RESPONSES.fieldHelpMissing}`,
  };
}

module.exports = { findExplicitFieldHelp, findGenericFieldHelp };
