const {
  CHATBOT_QUICK_ACTIONS: ACTIONS,
} = require('../config/chatbotQuickActions');
const { chatbotGuides } = require('../config/chatbotGuides');
const {
  chatbotQuickActionsSchema,
} = require('../validations/chatbotQuickActions.schemas');

const PREGNANCY_INTENTS = new Set([
  'control_prenatal',
  'editar_control_prenatal',
  'ficha_riesgo',
  'interpretar_riesgo',
  'imprimir_riesgo',
  'vacunas',
  'editar_vacuna',
  'laboratorio',
  'plan_parto',
  'imprimir_plan_parto',
  'puerperio',
  'referencias',
  'morbilidad',
  'cerrar_embarazo',
]);
const TARGET_PERMISSIONS = Object.freeze({
  pacientes: 'pacientes.ver',
  nueva_paciente: 'pacientes.crear',
  reportes: 'reportes.ver',
  usuarios: 'usuarios.gestionar',
  mapa_riesgo: 'mapa_riesgo.ver',
  comunidades: 'comunidades.gestionar',
  expediente_actual: 'pacientes.ver',
});
const ACTION_REQUIRED_PERMISSIONS = Object.freeze({
  'start-patient-guide': Object.freeze(['pacientes.crear']),
  'start-control-guide': Object.freeze(['controles.crear']),
  'start-risk-guide': Object.freeze(['controles.crear', 'controles.editar']),
  'start-vaccine-guide': Object.freeze(['controles.crear']),
  'start-birth-plan-guide': Object.freeze(['controles.crear', 'controles.editar']),
  'start-close-pregnancy-guide': Object.freeze(['pacientes.editar']),
  'how-register-control': Object.freeze(['controles.crear']),
  'how-register-vaccine': Object.freeze(['controles.crear']),
  'how-edit-vaccine': Object.freeze(['controles.editar']),
  'how-risk-form': Object.freeze(['controles.crear', 'controles.editar']),
  'how-birth-plan': Object.freeze(['controles.crear', 'controles.editar']),
  'how-close-pregnancy': Object.freeze(['pacientes.editar']),
  'how-register-puerperium': Object.freeze(['controles.crear', 'controles.editar']),
  'how-register-reference': Object.freeze(['controles.crear']),
  'how-register-morbidity': Object.freeze(['controles.crear']),
  'filter-reports': Object.freeze(['reportes.ver']),
});
const CLOSED_PREGNANCY_WRITE_ACTIONS = new Set([
  'start-control-guide',
  'start-risk-guide',
  'start-vaccine-guide',
  'start-birth-plan-guide',
  'start-close-pregnancy-guide',
  'how-register-control',
  'how-register-vaccine',
  'how-edit-vaccine',
  'how-risk-form',
  'how-birth-plan',
  'how-close-pregnancy',
  'how-register-puerperium',
  'how-register-reference',
  'how-register-morbidity',
]);

function hasPermission(context, permission) {
  return Array.isArray(context?.permissions) && context.permissions.includes(permission);
}

function canViewPatients(context) {
  return hasPermission(context, 'pacientes.ver');
}

function canUseCurrentRecord(context) {
  return Boolean(context?.hasPatientContext) && canViewPatients(context);
}

function guideActions(conversation) {
  const guide = chatbotGuides[conversation?.activeGuide];
  const currentStep = conversation?.currentStep;
  if (!guide || !Number.isInteger(currentStep)) return [];

  if (currentStep === guide.steps.length) {
    return [ACTIONS.guideFinish, ACTIONS.guidePrevious, ACTIONS.guideRepeat, ACTIONS.guideCancel];
  }
  if (currentStep > 1) {
    return [ACTIONS.guideNext, ACTIONS.guidePrevious, ACTIONS.guideRepeat, ACTIONS.guideCancel];
  }
  return [ACTIONS.guideNext, ACTIONS.guideRepeat, ACTIONS.guideCancel];
}

function missingPregnancyActions(context) {
  const actions = [];
  if (canViewPatients(context)) actions.push(ACTIONS.openPatients);
  if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
  else actions.push(ACTIONS.howOpenRecord);
  actions.push(ACTIONS.howSelectPregnancy, ACTIONS.systemHelp);
  return actions;
}

function dashboardActions(context) {
  const actions = [];
  if (canViewPatients(context)) actions.push(ACTIONS.openPatients);
  if (hasPermission(context, 'pacientes.crear')) actions.push(ACTIONS.openNewPatient);
  if (hasPermission(context, 'reportes.ver')) actions.push(ACTIONS.openReports);
  actions.push(ACTIONS.systemHelp, ACTIONS.firstSteps);
  return actions;
}

function patientListActions(context) {
  const actions = [];
  if (canViewPatients(context)) actions.push(ACTIONS.openPatients);
  if (hasPermission(context, 'pacientes.crear')) actions.push(ACTIONS.openNewPatient);
  actions.push(ACTIONS.howOpenRecord, ACTIONS.openDashboard);
  return actions;
}

function activePregnancyActions(context) {
  const actions = [];
  if (hasPermission(context, 'controles.crear')) {
    actions.push(ACTIONS.howControl, ACTIONS.howVaccine);
  }
  if (
    hasPermission(context, 'controles.crear')
    && hasPermission(context, 'controles.editar')
  ) {
    actions.push(ACTIONS.howRisk, ACTIONS.howBirthPlan);
  }
  if (hasPermission(context, 'pacientes.editar')) actions.push(ACTIONS.howClosePregnancy);
  actions.push(ACTIONS.howRecordSections);
  if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
  return actions;
}

function puerperiumActions(context) {
  const actions = [];
  if (
    hasPermission(context, 'controles.crear')
    && hasPermission(context, 'controles.editar')
  ) {
    actions.push(ACTIONS.howPuerperium);
  }
  actions.push(ACTIONS.howPreviousControls, ACTIONS.howViewVaccines, ACTIONS.howRecordSections);
  if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
  return actions;
}

function closedPregnancyActions(context) {
  const actions = [ACTIONS.howPregnancyHistory, ACTIONS.howRecordSections];
  if (canViewPatients(context)) actions.push(ACTIONS.openPatients);
  actions.push(ACTIONS.openDashboard);
  return actions;
}

function contextActions(context) {
  if (!context) return [];
  if (context.module === 'dashboard') return dashboardActions(context);
  if (context.module === 'pacientes') return patientListActions(context);
  if (context.module !== 'expediente') {
    const actions = [ACTIONS.systemHelp];
    if (canViewPatients(context)) actions.unshift(ACTIONS.openPatients);
    if (hasPermission(context, 'reportes.ver')) actions.push(ACTIONS.openReports);
    if (hasPermission(context, 'mapa_riesgo.ver')) actions.push(ACTIONS.openRiskMap);
    if (hasPermission(context, 'usuarios.gestionar')) actions.push(ACTIONS.openUsers);
    if (hasPermission(context, 'comunidades.gestionar')) actions.push(ACTIONS.openCommunities);
    return actions;
  }

  if (!context.hasPregnancyContext) return missingPregnancyActions(context);
  if (context.pregnancyStatus === 'cerrado') return closedPregnancyActions(context);
  if (context.pregnancyStatus === 'puerperio') return puerperiumActions(context);
  return activePregnancyActions(context);
}

function clinicalDataActions(context) {
  const actions = [];
  if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
  else if (canViewPatients(context)) actions.push(ACTIONS.openPatients);
  actions.push(ACTIONS.vihPermissionHelp, ACTIONS.systemHelp);
  return actions;
}

function clinicalAdviceActions(context) {
  const actions = [ACTIONS.howReference, ACTIONS.howMorbidity];
  if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
  actions.push(ACTIONS.systemHelp);
  return actions;
}

function completedGuideActions(guideId, context) {
  const related = {
    registrar_paciente: [ACTIONS.openPatients, ACTIONS.howControl, ACTIONS.howOpenRecord],
    control_prenatal: [ACTIONS.howLaboratory, ACTIONS.howVaccine, ACTIONS.howRisk],
    ficha_riesgo: [ACTIONS.howPrintRisk, ACTIONS.howBirthPlan, ACTIONS.howRecordSections],
    vacunas: [ACTIONS.howEditVaccine, ACTIONS.howControl, ACTIONS.howViewVaccines],
    plan_parto: [ACTIONS.howPrintBirthPlan, ACTIONS.howRisk, ACTIONS.howRecordSections],
    cerrar_embarazo: [ACTIONS.howPuerperium, ACTIONS.howPregnancyHistory, ACTIONS.openPatients],
  };
  const actions = [...(related[guideId] || [ACTIONS.systemHelp, ACTIONS.newQuestion])];
  if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
  actions.push(ACTIONS.systemHelp);
  return actions;
}

function intentActions(intent, context) {
  const actions = [];
  const editablePregnancy = context?.pregnancyStatus !== 'cerrado';
  const activePregnancy = context?.pregnancyStatus === 'activo';
  const hasPregnancy = Boolean(context?.hasPregnancyContext);
  const canCreateControls = hasPermission(context, 'controles.crear');
  const canEditControls = hasPermission(context, 'controles.editar');

  switch (intent) {
    case 'registrar_paciente':
      if (hasPermission(context, 'pacientes.crear')) {
        actions.push(ACTIONS.startPatientGuide, ACTIONS.openNewPatient);
      }
      if (canViewPatients(context)) actions.push(ACTIONS.openPatients);
      break;
    case 'buscar_paciente':
      if (canViewPatients(context)) actions.push(ACTIONS.openPatients);
      actions.push(ACTIONS.howOpenRecord);
      if (hasPermission(context, 'pacientes.crear')) actions.push(ACTIONS.openNewPatient);
      break;
    case 'control_prenatal':
    case 'editar_control_prenatal':
      if (hasPregnancy && activePregnancy && canCreateControls) actions.push(ACTIONS.startControlGuide);
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howLaboratory);
      break;
    case 'ficha_riesgo':
      if (hasPregnancy && editablePregnancy && canCreateControls && canEditControls) {
        actions.push(ACTIONS.startRiskGuide);
      }
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howPrintRisk);
      break;
    case 'interpretar_riesgo':
    case 'imprimir_riesgo':
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howRisk);
      break;
    case 'vacunas':
      if (hasPregnancy && editablePregnancy && canCreateControls) actions.push(ACTIONS.startVaccineGuide);
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howViewVaccines);
      break;
    case 'editar_vacuna':
      if (hasPregnancy && editablePregnancy && canEditControls) actions.push(ACTIONS.howEditVaccine);
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howViewVaccines);
      break;
    case 'laboratorio':
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howLaboratory);
      if (hasPregnancy && activePregnancy && canCreateControls) actions.push(ACTIONS.startControlGuide);
      break;
    case 'plan_parto':
      if (hasPregnancy && editablePregnancy && canCreateControls && canEditControls) {
        actions.push(ACTIONS.startBirthPlanGuide);
      }
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howPrintBirthPlan);
      break;
    case 'puerperio':
      if (hasPregnancy && context?.pregnancyStatus === 'puerperio') actions.push(ACTIONS.howPuerperium);
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howPregnancyHistory);
      break;
    case 'referencias':
      actions.push(ACTIONS.howReference, ACTIONS.howMorbidity);
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      break;
    case 'morbilidad':
      actions.push(ACTIONS.howMorbidity, ACTIONS.howReference);
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      break;
    case 'reportes':
    case 'filtrar_reportes':
      if (hasPermission(context, 'reportes.ver')) actions.push(ACTIONS.openReports);
      actions.push(ACTIONS.filterReports, ACTIONS.openDashboard);
      break;
    case 'cambiar_password':
      actions.push(ACTIONS.passwordInstructions, ACTIONS.endConversation);
      break;
    case 'olvido_contrasena':
      actions.push(ACTIONS.passwordAccessHelp, ACTIONS.endConversation);
      break;
    case 'usuarios':
    case 'permisos_usuario':
      if (hasPermission(context, 'usuarios.gestionar')) actions.push(ACTIONS.openUsers);
      actions.push(ACTIONS.howUserPermissions);
      break;
    case 'cerrar_embarazo':
      if (
        hasPregnancy
        && ['activo', 'puerperio'].includes(context?.pregnancyStatus)
        && hasPermission(context, 'pacientes.editar')
      ) {
        actions.push(ACTIONS.startClosePregnancyGuide);
      }
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howPregnancyHistory);
      break;
    case 'secciones_expediente':
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howRecordSections, ACTIONS.howPregnancyHistory);
      break;
    case 'impresion_no_disponible':
      actions.push(ACTIONS.howMspasForm);
      if (canUseCurrentRecord(context)) actions.push(ACTIONS.openCurrentRecord);
      actions.push(ACTIONS.howRecordSections);
      break;
    case 'mapa_riesgo':
      if (hasPermission(context, 'mapa_riesgo.ver')) actions.push(ACTIONS.openRiskMap);
      actions.push(ACTIONS.openDashboard);
      break;
    case 'dashboard':
      actions.push(ACTIONS.openDashboard);
      break;
    default:
      break;
  }

  return actions;
}

function socialActions(intent, conversation, context) {
  if (intent === 'despedida') return [ACTIONS.newQuestion];
  if (intent === 'agradecimiento') {
    return [
      ...intentActions(conversation?.lastIntent, context),
      ACTIONS.endConversation,
    ];
  }
  if (intent === 'saludo') return contextActions(context).slice(0, 3);
  return null;
}

function isActionAllowed(action, context) {
  if (action.type === 'navigate') {
    if (action.target === 'expediente_actual' && !context?.hasPatientContext) return false;
    const permission = TARGET_PERMISSIONS[action.target];
    return !permission || hasPermission(context, permission);
  }

  const permissions = ACTION_REQUIRED_PERMISSIONS[action.id] || [];
  if (!permissions.every((permission) => hasPermission(context, permission))) return false;

  if (
    context?.pregnancyStatus === 'cerrado'
    && CLOSED_PREGNANCY_WRITE_ACTIONS.has(action.id)
  ) return false;
  if (context?.pregnancyStatus === 'puerperio' && action.id === 'how-register-control') {
    return false;
  }
  return true;
}

function uniqueActions(actions) {
  const seen = {
    id: new Set(),
    label: new Set(),
    message: new Set(),
    target: new Set(),
  };
  const unique = [];

  for (const action of actions) {
    if (!action || seen.id.has(action.id) || seen.label.has(action.label)) continue;
    if (action.type === 'message' && seen.message.has(action.message)) continue;
    if (action.type === 'navigate' && seen.target.has(action.target)) continue;

    seen.id.add(action.id);
    seen.label.add(action.label);
    if (action.type === 'message') seen.message.add(action.message);
    if (action.type === 'navigate') seen.target.add(action.target);
    unique.push(action);
    if (unique.length === 4) break;
  }

  return unique;
}

function generateQuickActions({ intent, conversation, context } = {}) {
  let candidates = guideActions(conversation);

  if (!candidates.length) {
    const social = socialActions(intent, conversation, context);
    if (social) {
      candidates = social;
    } else if (intent === 'solicitud_dato_clinico') {
      candidates = clinicalDataActions(context);
    } else if (intent === 'solicitud_consejo_clinico') {
      candidates = clinicalAdviceActions(context);
    } else if (intent === 'guia_finalizada') {
      candidates = completedGuideActions(conversation?.lastIntent, context);
    } else if (PREGNANCY_INTENTS.has(intent) && !context?.hasPregnancyContext) {
      candidates = missingPregnancyActions(context);
    } else if (context?.module === 'expediente' && context?.pregnancyStatus === 'cerrado') {
      candidates = [
        ...intentActions(intent, context),
        ...closedPregnancyActions(context),
      ];
    } else {
      const specificActions = intentActions(intent, context);
      candidates = specificActions.length > 0
        ? [...specificActions, ACTIONS.systemHelp]
        : contextActions(context);
    }
  }

  const allowedCandidates = candidates.filter((action) => {
    if (!isActionAllowed(action, context)) return false;
    if (intent === 'impresion_no_disponible' && action.target === 'reportes') return false;
    if (
      ['cambiar_password', 'olvido_contrasena'].includes(intent)
      && action.type === 'navigate'
      && action.target === 'usuarios'
    ) return false;
    if (intent === 'olvido_contrasena' && action.type === 'navigate') return false;
    return true;
  });
  const validation = chatbotQuickActionsSchema.safeParse(uniqueActions(allowedCandidates));
  return validation.success ? validation.data : [];
}

module.exports = {
  generateQuickActions,
};
