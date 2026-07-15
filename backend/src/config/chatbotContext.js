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
const CHATBOT_MAX_PERMISSIONS = 50;

module.exports = {
  CHATBOT_CONTEXT_MODULES,
  CHATBOT_CONTEXT_ROUTES,
  CHATBOT_MAX_PERMISSIONS,
  CHATBOT_ROUTE_MODULES,
};
