const chatbotFieldHelp = Object.freeze([
  {
    id: 'numero_control', label: 'No. Control', aliases: ['numero de control', 'número de control'],
    section: 'control_prenatal', tabs: ['general'],
    help: 'Identifica el número de esta atención en la secuencia de controles prenatales.',
    expected: 'Selecciona un número en la lista No. Control.',
    operationalNote: 'Está en la pestaña General de Nuevo o Editar control.',
  },
  {
    id: 'cita_siguiente', label: 'Cita siguiente', aliases: ['proxima cita', 'próxima cita', 'siguiente cita'],
    section: 'control_prenatal', tabs: ['general'],
    help: 'Registra la fecha de la siguiente cita asociada al control.',
    expected: 'Es una fecha en el selector del formulario.',
    operationalNote: 'Está en General. Si la cita ya está programada, el campo se muestra de solo lectura y se reprograma desde el calendario.',
  },
  {
    id: 'acompanante', label: 'Nombre del acompañante', aliases: ['acompanante', 'acompañante'],
    section: 'control_prenatal', tabs: ['general'],
    help: 'Identifica a la persona acompañante de esta atención.',
    expected: 'Es un campo de texto para el nombre del acompañante.',
    operationalNote: 'Está en la pestaña General.',
  },
  {
    id: 'semanas_gestacion', label: 'Semanas de gestación', aliases: ['semanas de gestacion', 'edad gestacional'],
    section: 'control_prenatal', tabs: ['general'],
    help: 'Muestra las semanas de gestación calculadas para la fecha del control.',
    expected: 'Es un número calculado por el sistema a partir de FUR y fecha del control; el campo es de solo lectura.',
    operationalNote: 'Está en la pestaña General.',
  },
  {
    id: 'hematologia', label: 'Hematología', aliases: ['hematologia'],
    section: 'control_prenatal', tabs: ['laboratorio'],
    help: 'Agrupa el estado de realización y el resultado registrado para Hematología.',
    expected: 'Marca Realizado cuando corresponda; entonces se habilita un campo de texto para el resultado disponible.',
    operationalNote: 'Está en Laboratorio. El formulario no identifica este resultado como hemoglobina ni los equipara.',
  },
  {
    id: 'vih', label: 'VIH', aliases: ['prueba de vih'],
    section: 'control_prenatal', tabs: ['laboratorio'],
    help: 'Agrupa el estado de realización y el resultado registrado para VIH.',
    expected: 'Marca Realizado cuando corresponda; el resultado se elige entre las opciones que muestra el formulario.',
    operationalNote: 'Está en Laboratorio. Al editar un control, su captura requiere el permiso controles.ver_vih.',
  },
]);

const CHATBOT_FIELD_IDS = Object.freeze(chatbotFieldHelp.map(({ id }) => id));

module.exports = { chatbotFieldHelp, CHATBOT_FIELD_IDS };
