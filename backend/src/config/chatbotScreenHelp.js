const { CHATBOT_ROUTE_OPERATIONAL_CONTEXT } = require('./chatbotContext');

// Ayuda de interfaz versionada; nunca se construye desde DOM o valores clínicos.
const SCREEN_HELP = Object.freeze({
  nueva_paciente: 'Estás registrando una paciente. Completa las secciones del formulario con la información documentada, revisa los campos obligatorios y usa los botones para avanzar o regresar antes de guardar.',
  editar_paciente: 'Estás editando los datos de una paciente. Revisa las secciones y corrige únicamente la información que corresponda; al guardar podrás volver al expediente.',
  nuevo_control: 'Estás registrando un control prenatal. Completa la fecha y los campos obligatorios con la información del control documentado; las semanas de gestación se muestran según el cálculo del sistema. Revisa General, Laboratorio, Suplementación y Orientaciones antes de guardar; la visibilidad de VIH depende del permiso controles.ver_vih.',
  editar_control: 'Estás editando un control prenatal. Revisa la fecha y los campos obligatorios con la información documentada; las semanas de gestación se muestran según el cálculo del sistema. Revisa las pestañas antes de guardar; la visibilidad de VIH depende del permiso controles.ver_vih.',
  ficha_riesgo: 'Estás en la Ficha de riesgo. Revisa Información general, Condiciones de riesgo evaluadas y Referencia y seguimiento para registrar los criterios documentados. La edad clínica se calcula para la fecha de evaluación y algunos criterios se activan automáticamente según las reglas del sistema. Revisa lo mostrado antes de guardar; Lía no decide factores ni asigna puntajes.',
  plan_parto: 'Estás en el Plan de parto. Sus secciones registran antecedentes, preferencias, ruta y transporte, apoyos, acompañamiento y responsables del plan. Algunos datos vienen precargados del expediente y deben revisarse antes de guardar. La impresión se abre desde Plan de parto en el expediente; Lía no decide las opciones clínicas.',
  nuevo_puerperio: 'Estás registrando una atención de Puerperio. Completa la fecha, el número de atención y los campos del seguimiento con la información documentada. Revisa los campos obligatorios antes de guardar y vuelve a Puerperio en el expediente para consultar el registro.',
  editar_puerperio: 'Estás editando una atención de Puerperio. Revisa la fecha, el número de atención y los campos del seguimiento documentado antes de guardar. El registro se consulta desde Puerperio en el expediente.',
  nueva_morbilidad: 'Estás registrando una Morbilidad. El formulario documenta la atención, el diagnóstico y el tratamiento indicados por el profesional responsable; Lía no los determina. Revisa la fecha y los campos obligatorios antes de guardar y consulta el registro en Morbilidad del expediente.',
  editar_morbilidad: 'Estás editando una Morbilidad. Corrige únicamente la información documentada por el profesional responsable y revisa los campos obligatorios antes de guardar. Lía explica los controles del formulario, sin elegir diagnósticos ni tratamientos.',
  nueva_vacuna: 'Estás registrando una aplicación en Vacunas. Selecciona el tipo documentado, la posición de dosis si el formulario la muestra, el momento de aplicación y la fecha oficial según el carné o antecedente disponible. Las opciones visibles dependen de la vacuna seleccionada; Lía no decide qué vacuna aplicar ni inventa fechas.',
  editar_vacuna: 'Estás editando una aplicación en Vacunas. Revisa el tipo, la posición de dosis si aparece, el momento y la fecha oficial contra el carné o antecedente disponible. Lía no decide qué vacuna aplicar ni inventa fechas.',
});
const CONTROL_TAB_HELP = Object.freeze({
  general: 'En General se registran la fecha y los datos del control; las semanas de gestación se muestran según el cálculo del sistema.',
  laboratorio: 'En Laboratorio se registran resultados documentados; la visibilidad de VIH depende del permiso controles.ver_vih, sin interpretación clínica por Lía.',
  suplementacion: 'En Suplementación se documenta lo indicado por el profesional responsable; Lía no elige productos ni dosis.',
  orientaciones: 'En Orientaciones se registra la información brindada durante la atención, según lo documentado.',
});

function screenHelp(context) {
  const route = CHATBOT_ROUTE_OPERATIONAL_CONTEXT[context?.route];
  if (!route || route.form !== context?.form || route.section !== context?.section) return null;
  if (route.section === 'vacunas' && context.vaccineType === 'tdap') {
    return 'Estás en el registro de Tdap. El selector de dosis muestra «Dosis única del embarazo»; documenta la aplicación disponible, su momento (Previo al embarazo, Durante el embarazo o Postparto/aborto, según el registro) y la fecha oficial. Usa únicamente el carné o antecedente documentado, sin inventar fechas ni decidir aquí si debe aplicarse la vacuna.';
  }
  const help = SCREEN_HELP[route.form];
  if (route.section === 'control_prenatal' && CONTROL_TAB_HELP[context.tab]) {
    return `Estás en Control prenatal → ${context.tab === 'laboratorio' ? 'Laboratorio' : context.tab === 'general' ? 'General' : context.tab === 'suplementacion' ? 'Suplementación' : 'Orientaciones'}. ${CONTROL_TAB_HELP[context.tab]} Revisa las pestañas y los campos obligatorios antes de guardar.`;
  }
  if (help) return help;
  if (route.section === 'expediente') return 'Estás en el expediente. Usa sus pestañas para consultar datos generales, controles, laboratorios y seguimientos del embarazo seleccionado; las acciones disponibles dependen del estado y de los permisos de tu cuenta.';
  return null;
}

module.exports = { screenHelp };
