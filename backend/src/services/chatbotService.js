const DAY_MS = 24 * 60 * 60 * 1000;

const knowledgeBase = [
  {
    intent: 'calcular_fpp',
    title: 'Calculo de FPP',
    keywords: [
      'fpp',
      'fecha probable de parto',
      'fecha parto',
      'fecha de parto',
      'fur',
      'ultima regla',
      'ultima menstruacion',
      'calcular parto',
      'sacar fecha',
    ],
    answer:
      'Para calcular la FPP usa la FUR y suma 280 dias. Tambien puedes escribir una fecha, por ejemplo: "mi FUR fue 2026-01-10", y te dare la FPP aproximada.',
  },
  {
    intent: 'registrar_paciente',
    title: 'Registro de paciente',
    keywords: [
      'registrar paciente',
      'nueva paciente',
      'crear paciente',
      'agregar paciente',
      'ingresar paciente',
      'datos paciente',
    ],
    answer:
      'Para registrar una paciente entra en "Nueva", completa los datos obligatorios y guarda el formulario. Luego podras abrir su expediente desde "Pacientes".',
  },
  {
    intent: 'buscar_paciente',
    title: 'Busqueda de pacientes',
    keywords: [
      'buscar paciente',
      'encontrar paciente',
      'ver paciente',
      'lista pacientes',
      'pacientes',
      'expediente',
      'abrir expediente',
    ],
    answer:
      'Para buscar una paciente entra en "Pacientes". Desde la lista puedes abrir el expediente y revisar controles, riesgo, vacunas, morbilidades, referencias y documentos.',
  },
  {
    intent: 'editar_paciente',
    title: 'Editar paciente',
    keywords: [
      'editar paciente',
      'editar una paciente',
      'edito paciente',
      'edito una paciente',
      'modificar paciente',
      'actualizar paciente',
      'corregir datos',
      'cambiar datos',
      'datos incorrectos',
      'equivoque datos',
    ],
    answer:
      'Para editar los datos de una paciente abre su expediente y usa la opcion de editar. Revisa los campos modificados antes de guardar para mantener el expediente consistente.',
  },
  {
    intent: 'embarazo_activo',
    title: 'Embarazo activo',
    keywords: [
      'embarazo activo',
      'nuevo embarazo',
      'otro embarazo',
      'cambiar embarazo',
      'historial embarazo',
      'numero embarazo',
      'gestacion nueva',
    ],
    answer:
      'El sistema trabaja con el embarazo activo de la paciente. Si necesitas registrar un nuevo embarazo, abre el expediente y usa la opcion correspondiente para crear el nuevo registro de embarazo.',
  },
  {
    intent: 'control_prenatal',
    title: 'Control prenatal',
    keywords: [
      'control prenatal',
      'nuevo control',
      'agregar control',
      'registrar control',
      'consulta prenatal',
      'editar control',
      'peso',
      'presion',
      'altura uterina',
      'frecuencia cardiaca fetal',
    ],
    answer:
      'Para agregar un control prenatal abre el expediente de la paciente y usa la opcion de nuevo control. Completa los datos del control y guarda los cambios.',
  },
  {
    intent: 'impresion_no_disponible',
    title: 'Impresion de expediente',
    keywords: [
      'imprimir expediente',
      'imprimo expediente',
      'imprimo el expediente',
      'impresion expediente',
      'imprimir ficha',
      'imprimir pdf',
      'generar pdf expediente',
      'descargar expediente',
      'pdf expediente',
    ],
    answer:
      'La impresion del expediente todavia no esta disponible como orientacion del asistente. Esa parte debe usarse hasta que el formato del sistema este completamente ajustado al formato fisico.',
  },
  {
    intent: 'editar_control_prenatal',
    title: 'Editar control prenatal',
    keywords: [
      'editar control prenatal',
      'modificar control',
      'corregir control',
      'actualizar control',
      'control incorrecto',
      'me equivoque en control',
    ],
    answer:
      'Para editar un control prenatal abre el expediente de la paciente, busca el control registrado y selecciona la opcion de editar. Guarda solamente cuando hayas verificado los datos.',
  },
  {
    intent: 'eliminar_registro',
    title: 'Eliminar registro',
    keywords: [
      'eliminar',
      'borrar',
      'quitar registro',
      'eliminar control',
      'eliminar vacuna',
      'eliminar morbilidad',
      'borrar registro',
    ],
    answer:
      'Si necesitas eliminar un registro, abre el expediente de la paciente y usa la opcion de eliminar en el registro correspondiente. El sistema pedira confirmacion antes de borrar.',
  },
  {
    intent: 'ficha_riesgo',
    title: 'Ficha de riesgo',
    keywords: [
      'riesgo',
      'ficha riesgo',
      'clasificacion riesgo',
      'alto riesgo',
      'riesgo medio',
      'riesgo bajo',
      'evaluar riesgo',
      'factores de riesgo',
    ],
    answer:
      'La ficha de riesgo se gestiona desde el expediente de la paciente, en la seccion de riesgo. Registra los factores encontrados y guarda la evaluacion.',
  },
  {
    intent: 'interpretar_riesgo',
    title: 'Interpretacion de riesgo',
    keywords: [
      'que significa riesgo alto',
      'que significa riesgo medio',
      'que significa riesgo bajo',
      'interpretar riesgo',
      'clasificacion',
      'semaforo riesgo',
    ],
    answer:
      'La clasificacion de riesgo ayuda a identificar prioridad de seguimiento dentro del sistema. Si aparece riesgo alto, revisa la ficha registrada y aplica el protocolo clinico local correspondiente.',
  },
  {
    intent: 'vacunas',
    title: 'Vacunas',
    keywords: [
      'vacuna',
      'vacunas',
      'inmunizacion',
      'registrar vacuna',
      'editar vacuna',
      'tdap',
      'influenza',
      'toxide',
      'toxoide',
      'dosis',
    ],
    answer:
      'Para registrar vacunas abre el expediente de la paciente y entra a la seccion de vacunas. Agrega la vacuna aplicada con su fecha correspondiente.',
  },
  {
    intent: 'editar_vacuna',
    title: 'Editar vacuna',
    keywords: [
      'editar vacuna',
      'modificar vacuna',
      'corregir vacuna',
      'actualizar vacuna',
      'vacuna incorrecta',
      'me equivoque en vacuna',
    ],
    answer:
      'Para editar una vacuna abre el expediente de la paciente, entra a vacunas y selecciona el registro que deseas modificar. Verifica fecha, tipo de vacuna y dosis antes de guardar.',
  },
  {
    intent: 'morbilidad',
    title: 'Morbilidad',
    keywords: [
      'morbilidad',
      'enfermedad',
      'complicacion',
      'diagnostico',
      'registrar morbilidad',
      'editar morbilidad',
      'antecedente',
    ],
    answer:
      'Para registrar una morbilidad abre el expediente de la paciente y usa la seccion de morbilidad. El sistema guardara el evento dentro del embarazo activo.',
  },
  {
    intent: 'puerperio',
    title: 'Puerperio',
    keywords: [
      'puerperio',
      'postparto',
      'post parto',
      'registrar puerperio',
      'control puerperio',
      'editar puerperio',
      'despues del parto',
    ],
    answer:
      'Para registrar puerperio abre el expediente de la paciente y usa la seccion de puerperio. Completa los datos del seguimiento y guarda el registro.',
  },
  {
    intent: 'laboratorio',
    title: 'Laboratorio',
    keywords: [
      'laboratorio',
      'examen',
      'examenes',
      'hemoglobina',
      'vih',
      'sifilis',
      'orina',
      'glicemia',
      'registrar laboratorio',
    ],
    answer:
      'Los datos de laboratorio deben registrarse desde el expediente de la paciente en la seccion correspondiente. Ingresa resultados claros y verifica la fecha del examen antes de guardar.',
  },
  {
    intent: 'referencias',
    title: 'Referencias',
    keywords: [
      'referencia',
      'referir',
      'traslado',
      'hospital',
      'centro asistencial',
      'referencia enviada',
      'contrarreferencia',
    ],
    answer:
      'Las referencias se registran desde el expediente de la paciente. Usa esa seccion cuando necesites dejar constancia de una referencia o traslado.',
  },
  {
    intent: 'citas_seguimiento',
    title: 'Seguimiento prenatal',
    keywords: [
      'proxima cita',
      'siguiente cita',
      'seguimiento',
      'cuando regresa',
      'control siguiente',
      'cita prenatal',
      'agenda',
    ],
    answer:
      'Para dar seguimiento, revisa el expediente de la paciente y sus controles prenatales registrados. Usa la informacion del ultimo control para definir la proxima atencion segun el protocolo local.',
  },
  {
    intent: 'reportes',
    title: 'Reportes',
    keywords: [
      'reporte',
      'reportes',
      'censo',
      'estadisticas',
      'exportar',
      'excel',
      'mspas',
      'descargar reporte',
      'periodo',
      'rango fechas',
    ],
    answer:
      'Para generar reportes entra en "Reportes", selecciona el periodo que necesitas y consulta la informacion disponible. Si tu usuario tiene permiso, tambien podras exportar datos.',
  },
  {
    intent: 'filtrar_reportes',
    title: 'Filtros de reportes',
    keywords: [
      'filtrar reporte',
      'filtro reporte',
      'fecha reporte',
      'mes reporte',
      'reporte por mes',
      'reporte por fechas',
      'periodo reporte',
    ],
    answer:
      'En "Reportes" puedes seleccionar el periodo que deseas consultar. Verifica las fechas antes de generar o exportar la informacion.',
  },
  {
    intent: 'usuarios',
    title: 'Usuarios',
    keywords: [
      'usuario',
      'usuarios',
      'crear usuario',
      'administrador',
      'permisos',
      'rol',
      'clave',
      'contrasena',
      'contraseña',
    ],
    answer:
      'La gestion de usuarios esta disponible solo para administradores. Entra en "Usuarios" para crear cuentas, editar roles o administrar accesos.',
  },
  {
    intent: 'olvido_contrasena',
    title: 'Contrasena olvidada',
    keywords: [
      'olvide mi contrasena',
      'olvide mi contraseña',
      'no recuerdo mi contrasena',
      'no recuerdo mi contraseña',
      'recuperar contrasena',
      'recuperar contraseña',
      'perdi mi clave',
      'restablecer clave',
      'no puedo entrar',
      'no puedo iniciar sesion',
      'bloqueado',
    ],
    answer:
      'Si olvidaste tu contrasena, comunicate con el Ingeniero a cargo del distrito o del area de salud para que pueda apoyarte con el restablecimiento del acceso.',
  },
  {
    intent: 'permisos_usuario',
    title: 'Permisos de usuario',
    keywords: [
      'no veo usuarios',
      'no aparece usuarios',
      'no tengo permiso',
      'acceso denegado',
      'no puedo entrar a usuarios',
      'permiso administrador',
      'solo admin',
    ],
    answer:
      'Si no ves una opcion del sistema, probablemente tu usuario no tiene ese permiso. La gestion de usuarios esta reservada para administradores.',
  },
  {
    intent: 'sesion',
    title: 'Sesion del sistema',
    keywords: [
      'cerrar sesion',
      'salir',
      'logout',
      'iniciar sesion',
      'login',
      'token expirado',
      'sesion expirada',
    ],
    answer:
      'Para salir del sistema usa "Cerrar sesion" en el menu lateral. Si la sesion expira, el sistema te enviara nuevamente a la pantalla de inicio de sesion.',
  },
  {
    intent: 'modo_oscuro',
    title: 'Modo oscuro',
    keywords: [
      'modo oscuro',
      'modo claro',
      'tema',
      'cambiar color',
      'pantalla oscura',
      'pantalla clara',
    ],
    answer:
      'Puedes cambiar entre modo claro y modo oscuro desde el menu lateral usando el boton de tema.',
  },
  {
    intent: 'dashboard',
    title: 'Dashboard',
    keywords: [
      'dashboard',
      'inicio',
      'pantalla principal',
      'resumen',
      'indicadores',
      'tarjetas',
    ],
    answer:
      'El Dashboard muestra un resumen general del sistema. Usalo como pantalla inicial para revisar indicadores y acceder rapidamente a las secciones principales.',
  },
  {
    intent: 'errores_guardado',
    title: 'Errores al guardar',
    keywords: [
      'no guarda',
      'error al guardar',
      'no puedo guardar',
      'fallo guardar',
      'campos obligatorios',
      'formulario no guarda',
    ],
    answer:
      'Si un formulario no guarda, revisa que los campos obligatorios esten completos y que los datos tengan el formato correcto. Si el problema continua, reportalo al administrador del sistema.',
  },
  {
    intent: 'datos_obligatorios',
    title: 'Campos obligatorios',
    keywords: [
      'campo obligatorio',
      'campos obligatorios',
      'dato requerido',
      'datos requeridos',
      'me falta dato',
      'validacion',
    ],
    answer:
      'Los campos obligatorios deben completarse antes de guardar. El sistema usa esas validaciones para evitar expedientes incompletos o inconsistentes.',
  },
  {
    intent: 'privacidad_datos',
    title: 'Privacidad de datos',
    keywords: [
      'privacidad',
      'datos personales',
      'confidencial',
      'seguridad datos',
      'informacion paciente',
      'proteger datos',
    ],
    answer:
      'La informacion de las pacientes debe manejarse con confidencialidad. Usa tu cuenta personal, cierra sesion al terminar y evita compartir datos fuera del sistema.',
  },
  {
    intent: 'sin_internet',
    title: 'Problemas de conexion',
    keywords: [
      'sin internet',
      'no carga',
      'servidor no responde',
      'conexion',
      'red',
      'pagina no abre',
      'sistema lento',
    ],
    answer:
      'Si el sistema no carga o esta lento, verifica la conexion de red y vuelve a intentar. Si el problema persiste, reportalo al responsable tecnico del distrito o area de salud.',
  },
  {
    intent: 'ayuda_bot',
    title: 'Ayuda del asistente',
    keywords: [
      'ayuda',
      'que puedes hacer',
      'como funciona',
      'asistente',
      'chatbot',
      'bot',
    ],
    answer:
      'Puedo orientarte sobre el uso del sistema: pacientes, controles prenatales, FPP, riesgo, vacunas, morbilidad, referencias, reportes y usuarios. No doy diagnosticos medicos.',
  },
];

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9/\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter((word) => word.length > 2);
}

function scoreIntent(message, item) {
  const normalizedMessage = normalizeText(message);
  const messageTokens = new Set(tokenize(normalizedMessage));

  return item.keywords.reduce((bestScore, keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    const keywordTokens = tokenize(normalizedKeyword);

    if (normalizedMessage.includes(normalizedKeyword)) {
      return Math.max(bestScore, 6 + keywordTokens.length);
    }

    const matches = keywordTokens.filter((token) => messageTokens.has(token)).length;
    if (!matches) return bestScore;

    const tokenScore = (matches / Math.max(keywordTokens.length, 1)) * 3;
    return Math.max(bestScore, tokenScore);
  }, 0);
}

function parseFurDate(message) {
  const normalized = normalizeText(message);
  const isoMatch = normalized.match(/\b(20\d{2}|19\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  const localMatch = normalized.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2}|19\d{2})\b/);

  let year;
  let month;
  let day;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (localMatch) {
    day = Number(localMatch[1]);
    month = Number(localMatch[2]);
    year = Number(localMatch[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isValid ? date : null;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function calculateFpp(furDate) {
  return new Date(furDate.getTime() + 280 * DAY_MS);
}

function buildFppResponse(message, baseAnswer) {
  const furDate = parseFurDate(message);
  if (!furDate) return baseAnswer;

  const fppDate = calculateFpp(furDate);
  return `Con FUR ${formatDate(furDate)}, la FPP aproximada es ${formatDate(fppDate)}. Formula usada: FPP = FUR + 280 dias.`;
}

function findBestIntent(message) {
  const ranked = knowledgeBase
    .map((item) => ({ ...item, score: scoreIntent(message, item) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 2 ? ranked[0] : null;
}

function answerQuestion(message) {
  const text = String(message || '').trim();
  if (!text) {
    return {
      recognized: false,
      intent: 'mensaje_vacio',
      answer: 'Escribe tu duda sobre el uso del sistema para poder ayudarte.',
      suggestions: knowledgeBase.slice(0, 4).map((item) => item.title),
    };
  }

  const bestIntent = findBestIntent(text);
  if (!bestIntent) {
    return {
      recognized: false,
      intent: 'no_reconocida',
      answer:
        'No encontre una respuesta segura para esa consulta. Puedes reformularla o consultar al administrador del sistema.',
      suggestions: knowledgeBase.slice(0, 6).map((item) => item.title),
    };
  }

  const answer = bestIntent.intent === 'calcular_fpp'
    ? buildFppResponse(text, bestIntent.answer)
    : bestIntent.answer;

  return {
    recognized: true,
    intent: bestIntent.intent,
    title: bestIntent.title,
    answer,
    confidence: Number(Math.min(bestIntent.score / 6, 1).toFixed(2)),
    disclaimer: 'Este asistente orienta sobre el uso del sistema y no sustituye criterio clinico.',
  };
}

module.exports = {
  answerQuestion,
  calculateFpp,
  knowledgeBase,
  normalizeText,
  parseFurDate,
};
