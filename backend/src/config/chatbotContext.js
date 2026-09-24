const CHATBOT_CONTEXT_MODULES = Object.freeze([
  'dashboard',
  'pacientes',
  'expediente',
  'reportes',
  'usuarios',
  'mapa_riesgo',
  'comunidades',
  'otro',
]);

const CHATBOT_ROUTE_MODULES = Object.freeze({
  '/dashboard': 'dashboard',
  '/pacientes': 'pacientes',
  '/nuevo': 'pacientes',
  '/pacientes/:id/expediente': 'expediente',
  '/pacientes/:id/editar': 'expediente',
  '/pacientes/:id/controles/nuevo': 'expediente',
  '/pacientes/:id/controles/:id/editar': 'expediente',
  '/pacientes/:id/riesgo': 'expediente',
  '/pacientes/:id/plan-parto': 'expediente',
  '/pacientes/:id/puerperio/nuevo': 'expediente',
  '/pacientes/:id/puerperio/:id/editar': 'expediente',
  '/pacientes/:id/morbilidad/nuevo': 'expediente',
  '/pacientes/:id/morbilidad/:id/editar': 'expediente',
  '/pacientes/:id/vacunas/nuevo': 'expediente',
  '/pacientes/:id/vacunas/:id/editar': 'expediente',
  '/reportes': 'reportes',
  '/usuarios': 'usuarios',
  '/mapa-riesgo': 'mapa_riesgo',
  '/comunidades': 'comunidades',
  '/otro': 'otro',
});

const CHATBOT_CONTEXT_ROUTES = Object.freeze(Object.keys(CHATBOT_ROUTE_MODULES));
const CHATBOT_CONTEXT_SECTIONS = Object.freeze(['expediente', 'control_prenatal', 'ficha_riesgo', 'plan_parto', 'puerperio', 'morbilidad', 'vacunas', 'reportes']);
const CHATBOT_CONTEXT_TABS = Object.freeze(['general', 'controles', 'laboratorio', 'riesgo', 'plan', 'morbilidad', 'puerperio', 'vacunas', 'suplementacion', 'orientaciones']);
const CHATBOT_CONTEXT_FORMS = Object.freeze(['nueva_paciente', 'editar_paciente', 'nuevo_control', 'editar_control', 'ficha_riesgo', 'plan_parto', 'nuevo_puerperio', 'editar_puerperio', 'nueva_morbilidad', 'editar_morbilidad', 'nueva_vacuna', 'editar_vacuna']);
const EXPEDIENTE_TABS = Object.freeze(['general', 'controles', 'laboratorio', 'riesgo', 'plan', 'morbilidad', 'puerperio', 'vacunas']);
const CONTROL_TABS = Object.freeze(['general', 'laboratorio', 'suplementacion', 'orientaciones']);
const CHATBOT_ROUTE_OPERATIONAL_CONTEXT = Object.freeze({
  '/nuevo': { section: null, form: 'nueva_paciente' },
  '/pacientes/:id/expediente': { section: 'expediente', form: null, tabs: EXPEDIENTE_TABS },
  '/pacientes/:id/editar': { section: 'expediente', form: 'editar_paciente' },
  '/pacientes/:id/controles/nuevo': { section: 'control_prenatal', form: 'nuevo_control', tabs: CONTROL_TABS },
  '/pacientes/:id/controles/:id/editar': { section: 'control_prenatal', form: 'editar_control', tabs: CONTROL_TABS },
  '/pacientes/:id/riesgo': { section: 'ficha_riesgo', form: 'ficha_riesgo' },
  '/pacientes/:id/plan-parto': { section: 'plan_parto', form: 'plan_parto' },
  '/pacientes/:id/puerperio/nuevo': { section: 'puerperio', form: 'nuevo_puerperio' },
  '/pacientes/:id/puerperio/:id/editar': { section: 'puerperio', form: 'editar_puerperio' },
  '/pacientes/:id/morbilidad/nuevo': { section: 'morbilidad', form: 'nueva_morbilidad' },
  '/pacientes/:id/morbilidad/:id/editar': { section: 'morbilidad', form: 'editar_morbilidad' },
  '/pacientes/:id/vacunas/nuevo': { section: 'vacunas', form: 'nueva_vacuna' },
  '/pacientes/:id/vacunas/:id/editar': { section: 'vacunas', form: 'editar_vacuna' },
  '/reportes': { section: 'reportes', form: null },
});
const CHATBOT_MAX_PERMISSIONS = 50;

module.exports = {
  CHATBOT_CONTEXT_MODULES,
  CHATBOT_CONTEXT_ROUTES,
  CHATBOT_CONTEXT_SECTIONS,
  CHATBOT_CONTEXT_TABS,
  CHATBOT_CONTEXT_FORMS,
  CHATBOT_ROUTE_OPERATIONAL_CONTEXT,
  CHATBOT_MAX_PERMISSIONS,
  CHATBOT_ROUTE_MODULES,
};
