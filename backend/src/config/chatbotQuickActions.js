const CHATBOT_QUICK_ACTION_TARGETS = Object.freeze([
  'dashboard',
  'pacientes',
  'nueva_paciente',
  'reportes',
  'usuarios',
  'mapa_riesgo',
  'comunidades',
  'expediente_actual',
]);

function message(id, label, text) {
  return Object.freeze({ id, label, type: 'message', message: text });
}

function navigate(id, label, target) {
  return Object.freeze({ id, label, type: 'navigate', target });
}

const CHATBOT_QUICK_ACTIONS = Object.freeze({
  guideNext: message('guide-next', 'Siguiente', 'Siguiente'),
  guideFinish: message('guide-finish', 'Finalizar', 'Siguiente'),
  guidePrevious: message('guide-previous', 'Anterior', 'Anterior'),
  guideRepeat: message('guide-repeat', 'Repetir', 'Repetir'),
  guideCancel: message('guide-cancel', 'Cancelar', 'Cancelar'),

  startPatientGuide: message(
    'start-patient-guide',
    'Guíame paso a paso',
    'Guíame para registrar una paciente'
  ),
  startControlGuide: message(
    'start-control-guide',
    'Guíame con el control',
    'Guíame para registrar un control prenatal'
  ),
  startRiskGuide: message(
    'start-risk-guide',
    'Guíame con la ficha',
    'Guíame para registrar la ficha de riesgo'
  ),
  startVaccineGuide: message(
    'start-vaccine-guide',
    'Guíame con la vacuna',
    'Guíame para registrar una vacuna'
  ),
  startBirthPlanGuide: message(
    'start-birth-plan-guide',
    'Guíame con el plan',
    'Guíame para registrar el plan de parto'
  ),
  startClosePregnancyGuide: message(
    'start-close-pregnancy-guide',
    'Guíame con el cierre',
    'Guíame para cerrar un embarazo'
  ),

  openDashboard: navigate('open-dashboard', 'Volver al dashboard', 'dashboard'),
  openPatients: navigate('open-patients', 'Buscar paciente', 'pacientes'),
  openNewPatient: navigate('open-new-patient', 'Registrar paciente', 'nueva_paciente'),
  openReports: navigate('open-reports', 'Ir a reportes', 'reportes'),
  openUsers: navigate('open-users', 'Ir a usuarios', 'usuarios'),
  openRiskMap: navigate('open-risk-map', 'Ir al mapa de riesgo', 'mapa_riesgo'),
  openCommunities: navigate('open-communities', 'Ir a comunidades', 'comunidades'),
  openCurrentRecord: navigate(
    'open-current-record',
    'Ir al expediente actual',
    'expediente_actual'
  ),

  systemHelp: message('system-help', 'Ayuda del sistema', '¿Con qué puedes ayudarme en el sistema?'),
  firstSteps: message('first-steps', 'Ver primeros pasos', '¿Cuáles son los primeros pasos?'),
  newQuestion: message('new-question', 'Nueva consulta', 'Necesito ayuda con otra consulta'),
  endConversation: message('end-conversation', 'Terminar conversación', 'Hasta luego'),
  howOpenRecord: message('how-open-record', 'Cómo abrir un expediente', '¿Cómo abro un expediente?'),
  howSelectPregnancy: message(
    'how-select-pregnancy',
    'Seleccionar un embarazo',
    '¿Cómo cambiar embarazo?'
  ),
  howRecordSections: message(
    'how-record-sections',
    'Ver secciones del expediente',
    '¿Qué secciones tiene el expediente?'
  ),
  howPregnancyHistory: message(
    'how-pregnancy-history',
    'Ver historial',
    '¿Cómo veo el historial embarazo?'
  ),
  howControl: message(
    'how-register-control',
    'Registrar control',
    '¿Cómo registro un control prenatal?'
  ),
  howPreviousControls: message(
    'how-previous-controls',
    'Ver controles anteriores',
    'Pestañas expediente'
  ),
  howVaccine: message('how-register-vaccine', 'Registrar vacuna', '¿Cómo registro una vacuna?'),
  howViewVaccines: message('how-view-vaccines', 'Ver vacunas', '¿Dónde veo las vacunas registradas?'),
  howEditVaccine: message('how-edit-vaccine', 'Editar una vacuna', '¿Cómo editar vacuna?'),
  howRisk: message('how-risk-form', 'Ficha de riesgo', '¿Cómo completo la ficha de riesgo?'),
  howPrintRisk: message('how-print-risk', 'Imprimir ficha de riesgo', 'Imprimir ficha riesgo'),
  howBirthPlan: message('how-birth-plan', 'Plan de parto', '¿Cómo registro el plan de parto?'),
  howPrintBirthPlan: message(
    'how-print-birth-plan',
    'Imprimir plan de parto',
    'Imprimir plan de parto'
  ),
  howClosePregnancy: message(
    'how-close-pregnancy',
    'Cerrar embarazo',
    '¿Cómo cierro un embarazo?'
  ),
  howPuerperium: message('how-register-puerperium', 'Registrar puerperio', '¿Cómo registro el puerperio?'),
  howLaboratory: message('how-view-laboratory', 'Ver laboratorios', '¿Dónde veo los laboratorios?'),
  howReference: message(
    'how-register-reference',
    'Referencia desde Riesgo obstétrico o Morbilidad',
    '¿Cómo registro una referencia desde Riesgo obstétrico o Morbilidad?'
  ),
  howMorbidity: message('how-register-morbidity', 'Registrar morbilidad', '¿Cómo registro una morbilidad?'),
  howMspasForm: message(
    'how-mspas-form',
    'Cómo generar la ficha',
    '¿Dónde genero la ficha prenatal MSPAS?'
  ),
  filterReports: message('filter-reports', 'Filtrar reportes', '¿Cómo filtro los reportes?'),
  passwordInstructions: message(
    'password-instructions',
    'Ver instrucciones',
    '¿Cómo cambio mi contraseña?'
  ),
  passwordAccessHelp: message(
    'password-access-help',
    'Solicitar restablecimiento',
    'Olvidé mi contraseña'
  ),
  vihPermissionHelp: message(
    'vih-permission-help',
    'Ayuda sobre permiso de VIH',
    'No tengo permiso para ver VIH'
  ),
  howUserPermissions: message(
    'how-user-permissions',
    'Ayuda sobre permisos',
    '¿Cómo funcionan los permisos de usuario?'
  ),
});

module.exports = {
  CHATBOT_QUICK_ACTIONS,
  CHATBOT_QUICK_ACTION_TARGETS,
};
