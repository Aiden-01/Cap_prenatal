import { isSupportedFormField } from "./chatbotFocusedField.js";

const PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const PREGNANCY_STATUSES = new Set(["activo", "puerperio", "cerrado"]);
const MAX_PERMISSIONS = 50;
const OPERATIONAL_ROUTES = {
  "/nuevo": [null, "nueva_paciente"],
  "/pacientes/:id/expediente": ["expediente", null],
  "/pacientes/:id/editar": ["expediente", "editar_paciente"],
  "/pacientes/:id/controles/nuevo": ["control_prenatal", "nuevo_control"],
  "/pacientes/:id/controles/:id/editar": ["control_prenatal", "editar_control"],
  "/pacientes/:id/riesgo": ["ficha_riesgo", "ficha_riesgo"],
  "/pacientes/:id/plan-parto": ["plan_parto", "plan_parto"],
  "/pacientes/:id/puerperio/nuevo": ["puerperio", "nuevo_puerperio"],
  "/pacientes/:id/puerperio/:id/editar": ["puerperio", "editar_puerperio"],
  "/pacientes/:id/morbilidad/nuevo": ["morbilidad", "nueva_morbilidad"],
  "/pacientes/:id/morbilidad/:id/editar": ["morbilidad", "editar_morbilidad"],
  "/pacientes/:id/vacunas/nuevo": ["vacunas", "nueva_vacuna"],
  "/pacientes/:id/vacunas/:id/editar": ["vacunas", "editar_vacuna"],
  "/reportes": ["reportes", null],
};
const EXPEDIENTE_TABS = new Set(["general", "controles", "laboratorio", "riesgo", "plan", "morbilidad", "puerperio", "vacunas"]);
const CONTROL_TABS = new Set(["general", "laboratorio", "suplementacion", "orientaciones"]);
const CONTROL_FIELDS = {
  numero_control: "general", cita_siguiente: "general", acompanante: "general",
  semanas_gestacion: "general", hematologia: "laboratorio", vih: "laboratorio",
};

const STATIC_ROUTES = new Map([
  ["/dashboard", { route: "/dashboard", module: "dashboard" }],
  ["/pacientes", { route: "/pacientes", module: "pacientes" }],
  ["/nuevo", { route: "/nuevo", module: "pacientes" }],
  ["/reportes", { route: "/reportes", module: "reportes" }],
  ["/usuarios", { route: "/usuarios", module: "usuarios" }],
  ["/mapa-riesgo", { route: "/mapa-riesgo", module: "mapa_riesgo" }],
  ["/comunidades", { route: "/comunidades", module: "comunidades" }],
]);

const PATIENT_ROUTE_RULES = [
  [/^\/pacientes\/[^/]+$/, "/pacientes/:id/expediente"],
  [/^\/pacientes\/[^/]+\/editar$/, "/pacientes/:id/editar"],
  [/^\/pacientes\/[^/]+\/controles\/nuevo$/, "/pacientes/:id/controles/nuevo"],
  [/^\/pacientes\/[^/]+\/controles\/[^/]+\/editar$/, "/pacientes/:id/controles/:id/editar"],
  [/^\/pacientes\/[^/]+\/riesgo$/, "/pacientes/:id/riesgo"],
  [/^\/pacientes\/[^/]+\/plan-parto$/, "/pacientes/:id/plan-parto"],
  [/^\/pacientes\/[^/]+\/puerperio\/nuevo$/, "/pacientes/:id/puerperio/nuevo"],
  [/^\/pacientes\/[^/]+\/puerperio\/[^/]+\/editar$/, "/pacientes/:id/puerperio/:id/editar"],
  [/^\/pacientes\/[^/]+\/morbilidad\/nuevo$/, "/pacientes/:id/morbilidad/nuevo"],
  [/^\/pacientes\/[^/]+\/morbilidad\/[^/]+\/editar$/, "/pacientes/:id/morbilidad/:id/editar"],
  [/^\/pacientes\/[^/]+\/vacunas\/nuevo$/, "/pacientes/:id/vacunas/nuevo"],
  [/^\/pacientes\/[^/]+\/vacunas\/[^/]+\/editar$/, "/pacientes/:id/vacunas/:id/editar"],
];

export function normalizeChatbotLocation(pathname = "/") {
  const cleanPath = String(pathname || "/").replace(/\/+$/, "") || "/";
  const staticRoute = STATIC_ROUTES.get(cleanPath);
  if (staticRoute) return { ...staticRoute };

  for (const [pattern, route] of PATIENT_ROUTE_RULES) {
    if (pattern.test(cleanPath)) return { route, module: "expediente" };
  }

  return { route: "/otro", module: "otro" };
}

function functionalPermissions(usuario) {
  const permissions = Array.isArray(usuario?.permisos) ? usuario.permisos : [];
  const candidates = [...permissions];
  if (usuario?.rol === "admin" || usuario?.rol === "director") {
    candidates.push("usuarios.gestionar");
  }

  return [...new Set(candidates)]
    .filter((permission) => (
      typeof permission === "string"
      && permission.length <= 80
      && PERMISSION_CODE_PATTERN.test(permission)
    ))
    .slice(0, MAX_PERMISSIONS);
}

export function buildChatbotContext({
  pathname,
  search = "",
  usuario,
  pregnancyStatus,
  screenTab = null,
  focusedField = null,
}) {
  const location = normalizeChatbotLocation(pathname);
  const [section, form] = OPERATIONAL_ROUTES[location.route] || [null, null];
  let tab = null;
  if (location.route === "/pacientes/:id/expediente") {
    const requestedTab = new URLSearchParams(search).get("tab") || "general";
    tab = EXPEDIENTE_TABS.has(requestedTab) ? requestedTab : null;
  } else if (section === "control_prenatal") {
    tab = CONTROL_TABS.has(screenTab) ? screenTab : null;
  }
  const hasPatientContext = location.module === "expediente";
  const safePregnancyStatus = hasPatientContext && PREGNANCY_STATUSES.has(pregnancyStatus)
    ? pregnancyStatus
    : null;
  const hasSelectedPregnancy = hasPatientContext
    && (safePregnancyStatus !== null || new URLSearchParams(search).has("embarazo_id"));

  return {
    route: location.route,
    module: location.module,
    hasPatientContext,
    hasPregnancyContext: hasSelectedPregnancy,
    pregnancyStatus: safePregnancyStatus,
    permissions: functionalPermissions(usuario),
    section,
    tab,
    form,
    focusedField: (section === "control_prenatal" && CONTROL_FIELDS[focusedField] === tab)
      || isSupportedFormField(focusedField, form) ? focusedField : null,
  };
}
