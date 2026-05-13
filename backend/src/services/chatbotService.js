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
      'Para calcular la FPP:\n1. Confirma la FUR de la paciente.\n2. Suma 280 dias a esa fecha.\n3. Registra la FPP en el formulario donde corresponda.\n\nTambien puedes escribirme una fecha, por ejemplo: "mi FUR fue 2026-01-10", y te dare la FPP aproximada.',
  },
  {
    intent: 'registrar_paciente',
    title: 'Registro de paciente',
    keywords: [
      'registrar paciente',
      'registrar una paciente',
      'registro paciente',
      'registro una paciente',
      'nueva paciente',
      'crear paciente',
      'agregar paciente',
      'agrego paciente',
      'ingresar paciente',
      'ingreso paciente',
      'ingreso una paciente',
      'datos paciente',
    ],
    answer:
      'Para registrar una paciente nueva:\n1. En el menu lateral, entra en "Nueva".\n2. Completa primero No. de Expediente, nombres y apellidos.\n3. Ingresa los datos de establecimiento, datos personales, gestacion actual, antecedentes y riesgo social.\n4. Revisa la pantalla de confirmacion.\n5. Presiona "Guardar paciente".\n\nAl guardar, el sistema abre el expediente de la paciente. Despues podras encontrarla desde "Pacientes".',
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
      'Para buscar una paciente:\n1. Entra en "Pacientes" desde el menu lateral.\n2. Usa el buscador o revisa la lista.\n3. Haz clic sobre la paciente para abrir su expediente.\n4. Dentro del expediente puedes revisar datos generales, controles, puerperio, morbilidad, riesgo, plan de parto, vacunas y laboratorios.',
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
      'Para editar datos de una paciente:\n1. Entra en "Pacientes".\n2. Abre el expediente de la paciente.\n3. Presiona "Editar paciente".\n4. Corrige los campos necesarios.\n5. Avanza a confirmar y guarda los cambios.\n\nAntes de guardar, revisa especialmente CUI, expediente, FUR/FPP y datos de contacto.',
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
      'El sistema trabaja con el embarazo activo de la paciente. Para crear un nuevo embarazo:\n1. Abre el expediente de la paciente.\n2. Presiona "Nuevo embarazo".\n3. Confirma que deseas cerrar el embarazo activo.\n4. Ingresa la FUR y FPP del nuevo embarazo si las tienes.\n5. Guarda y verifica que aparezca como embarazo activo.\n\nUsa esta opcion solo cuando realmente inicia una nueva gestacion.',
  },
  {
    intent: 'control_prenatal',
    title: 'Control prenatal',
    keywords: [
      'control prenatal',
      'nuevo control',
      'agregar control',
      'agrego control',
      'agrego un control',
      'registrar control',
      'registro control',
      'consulta prenatal',
      'editar control',
      'peso',
      'presion',
      'altura uterina',
      'frecuencia cardiaca fetal',
    ],
    answer:
      'Para agregar un control prenatal:\n1. Busca la paciente en "Pacientes" y abre su expediente.\n2. Presiona el boton "Control".\n3. Revisa el No. de control, fecha, hora y semanas de gestacion.\n4. Completa motivo de consulta, acompanante y personal que atiende.\n5. Marca signos de peligro si existen.\n6. Llena las pestanas necesarias: General, Laboratorios, Suplementacion y Orientaciones.\n7. Presiona "Guardar control".\n\nLos laboratorios se registran dentro del control prenatal, en la pestana "Laboratorios".',
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
      'Para imprimir o generar documentos desde el expediente:\n1. Abre el expediente de la paciente.\n2. Usa el boton "Expediente" para generar el PDF MSPAS.\n3. En la pestana "Riesgo obstetrico", usa "Imprimir" para la ficha de riesgo.\n4. En la pestana "Plan de parto", usa "Imprimir" para ese formato.\n\nSi un PDF no se genera, revisa que el registro exista y que los datos principales esten completos.',
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
      'Para editar un control prenatal:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana "Controles".\n3. Busca el control que deseas corregir.\n4. Presiona "Editar".\n5. Ajusta datos generales, examen, laboratorios, suplementacion u orientaciones.\n6. Guarda los cambios.\n\nVerifica que estes editando el control correcto antes de guardar.',
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
      'Para eliminar un registro:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana donde esta el registro: controles, puerperio, morbilidad, riesgo o vacunas.\n3. Presiona "Eliminar" en el registro correcto.\n4. Confirma solo si estas seguro.\n\nEsta accion borra el registro seleccionado. Si solo hay un error de captura, normalmente conviene usar "Editar".',
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
      'Para llenar la ficha de riesgo:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana "Riesgo obstetrico".\n3. Presiona "Registrar ficha de riesgo" o "Editar".\n4. Verifica fecha, telefono, pueblo, estado civil, escolaridad, ocupacion, FUR y FPP.\n5. Marca los criterios que apliquen en antecedentes obstetricos, embarazo actual e historia clinica general.\n6. Si corresponde, completa "Referida a" y el nombre del personal que atendio.\n7. Presiona "Guardar ficha".',
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
      'La ficha de riesgo marca si la paciente presenta criterios de riesgo obstetrico dentro del sistema.\n\nComo usarlo:\n1. Abre el expediente y revisa la pestana "Riesgo obstetrico".\n2. Confirma que los criterios marcados sean correctos.\n3. Si aparece "Presenta riesgo", revisa el detalle de los factores.\n4. Aplica el protocolo clinico local correspondiente y registra referencia si corresponde.\n\nEl asistente solo orienta sobre el sistema; no sustituye criterio clinico.',
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
      'Para registrar una vacuna:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana "Vacunas".\n3. Presiona "Registrar vacuna".\n4. Selecciona el tipo: Td/Tdap, Influenza o SPR/SR.\n5. Selecciona el momento: previo embarazo, durante embarazo o postparto/aborto.\n6. Ingresa No. de dosis y fecha de dosis.\n7. Presiona "Guardar".',
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
      'Para editar una vacuna:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana "Vacunas".\n3. Busca la vacuna registrada.\n4. Presiona "Editar".\n5. Corrige tipo, momento, dosis o fecha.\n6. Presiona "Guardar".\n\nVerifica fecha, tipo de vacuna y dosis antes de guardar.',
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
      'Para registrar morbilidad:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana "Morbilidad".\n3. Presiona "Registrar morbilidad".\n4. Ingresa fecha, hora y motivo de consulta.\n5. Completa historia de enfermedad actual, revision por sistemas, examen fisico, impresion clinica y tratamiento/referencia.\n6. Agrega nombre y cargo de quien atiende.\n7. Presiona "Guardar".\n\nEl registro queda asociado al embarazo activo.',
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
      'Para registrar puerperio:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana "Puerperio".\n3. Presiona "Registrar puerperio".\n4. Completa No. de atencion, fecha, hora y dias despues del parto.\n5. Ingresa lugar del parto, quien atendio, tipo de parto, presion, temperatura y personal que atiende.\n6. Marca RN vivo, apego inmediato y lactancia materna exclusiva si corresponde.\n7. Completa los demas campos del seguimiento y guarda.',
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
      'Para registrar laboratorios:\n1. Abre el expediente de la paciente.\n2. Presiona "Control" o edita un control existente.\n3. En el formulario del control, entra en la pestana "Laboratorios".\n4. Marca el examen realizado: hematologia, glicemia, grupo/RH, orina, heces, VIH, VDRL/RPR, TORCH, Papanicolau/IVAA, Hepatitis B o USG.\n5. Ingresa el resultado o detalle que corresponda.\n6. Guarda el control.\n\nLuego los resultados se ven en la pestana "Laboratorios" del expediente.',
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
      'Para dejar constancia de una referencia:\n1. Abre el expediente de la paciente.\n2. Si es por morbilidad, entra en "Morbilidad" y registra el tratamiento/referencia.\n3. Si es por ficha de riesgo, entra en "Riesgo obstetrico" y completa "Referida a".\n4. Guarda el formulario.\n\nAnota el lugar de referencia de forma clara para que quede visible en el expediente.',
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
      'Para revisar seguimiento prenatal:\n1. Abre el expediente de la paciente.\n2. Entra en "Controles" y revisa el ultimo control registrado.\n3. Verifica la fecha de "Cita siguiente" si fue registrada.\n4. En el Dashboard puedes revisar "Citas proximas" y "Sin control reciente".\n5. Define la proxima atencion segun el protocolo local.',
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
      'Para generar reportes:\n1. Entra en "Reportes" desde el menu lateral.\n2. Selecciona el modo de censo o consulta disponible.\n3. Elige el periodo cuando el sistema lo solicite.\n4. Presiona "Generar censo mensual" o "Ver censo actual".\n5. Revisa la tabla resultante.\n6. Si el boton de exportacion esta disponible para tu usuario, puedes descargar el archivo.',
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
      'Para filtrar reportes por fecha o periodo:\n1. Entra en "Reportes".\n2. Selecciona el tipo de reporte.\n3. Ajusta mes, anio o rango de fechas segun aparezca en pantalla.\n4. Genera el reporte.\n5. Antes de exportar, confirma que el periodo mostrado sea el correcto.',
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
      'Para gestionar usuarios, debes entrar con rol administrador.\n\nPasos:\n1. En el menu lateral, entra en "Usuarios".\n2. Para crear una cuenta, llena nombre completo, usuario, contrasena y rol.\n3. Para editar, selecciona el usuario existente y cambia los datos necesarios.\n4. Guarda los cambios.\n\nSi no ves "Usuarios", tu cuenta no tiene permiso de administrador.',
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
      'Para cambiar el tema:\n1. Ve al menu lateral.\n2. Busca el boton "Modo oscuro" o "Modo claro".\n3. Presionalo para alternar el tema.\n\nEl sistema recordara tu preferencia en ese navegador.',
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
      'El Dashboard sirve para revisar el estado general del sistema.\n\nAhi puedes ver:\n1. Total de pacientes.\n2. Controles del mes.\n3. Pacientes con riesgo.\n4. Pacientes proximas al parto.\n5. Pacientes sin control reciente.\n6. Citas proximas.\n\nPuedes hacer clic en varias tarjetas o filas para abrir el expediente relacionado.',
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
      'Si un formulario no guarda:\n1. Revisa los campos obligatorios marcados con asterisco o mensajes de error.\n2. Verifica fechas en formato correcto.\n3. Confirma que los numeros no lleven letras o simbolos raros.\n4. Si estas editando, revisa que el registro todavia exista.\n5. Intenta guardar nuevamente.\n6. Si continua, reporta el error al responsable tecnico con el nombre de la pantalla y la accion que estabas haciendo.',
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
      'Los campos obligatorios deben completarse antes de guardar.\n\nEn paciente nueva, revisa especialmente:\n1. No. de Expediente.\n2. Nombres.\n3. Apellidos.\n4. Datos basicos de gestacion cuando apliquen.\n\nEn otros formularios, revisa fecha, tipo de registro y datos principales antes de guardar.',
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
      'Puedo orientarte paso a paso sobre el uso del sistema.\n\nPuedes preguntarme cosas como:\n1. Como registrar una paciente.\n2. Como agregar un control prenatal.\n3. Como registrar laboratorios.\n4. Como llenar ficha de riesgo.\n5. Como registrar plan de parto, puerperio, morbilidad o vacunas.\n6. Como imprimir expediente, ficha de riesgo o plan de parto.\n7. Como generar reportes o gestionar usuarios.\n\nNo doy diagnosticos medicos ni sustituyo criterio clinico.',
  },
  {
    intent: 'imprimir_plan_parto',
    title: 'Imprimir plan de parto',
    keywords: [
      'imprimir plan de parto',
      'imprimo plan de parto',
      'imprimir plan parto',
      'imprimo plan parto',
      'pdf plan de parto',
      'pdf plan parto',
      'descargar plan de parto',
      'descargar plan parto',
      'generar plan de parto',
      'generar plan parto',
      'formato plan de parto',
      'formato plan parto',
    ],
    answer:
      'Para imprimir el plan de parto:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana "Plan de parto".\n3. Verifica que ya exista un plan guardado.\n4. Presiona "Imprimir".\n5. El sistema abrira el PDF en una nueva pestana.\n\nSi no aparece el boton o falla el PDF, primero guarda el plan de parto.',
  },
  {
    intent: 'plan_parto',
    title: 'Plan de parto',
    keywords: [
      'plan de parto',
      'registrar plan parto',
      'registrar plan de parto',
      'llenar plan de parto',
      'editar plan de parto',
      'formulario plan parto',
      'formulario plan de parto',
      'plan parto',
    ],
    answer:
      'Para registrar o editar el plan de parto:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana "Plan de parto".\n3. Presiona "Registrar plan de parto" o "Editar".\n4. Revisa los datos precargados desde paciente, riesgo y ultimo control.\n5. Completa datos generales, resumen obstetrico, logistica, responsables y signos de peligro.\n6. Presiona "Guardar plan".\n7. Para generar el formato, vuelve a la pestana "Plan de parto" y presiona "Imprimir".',
  },
  {
    intent: 'imprimir_riesgo',
    title: 'Imprimir ficha de riesgo',
    keywords: [
      'imprimir riesgo',
      'imprimo riesgo',
      'pdf riesgo',
      'descargar ficha riesgo',
      'imprimir ficha riesgo',
      'imprimo ficha riesgo',
      'generar ficha riesgo',
      'formato riesgo',
    ],
    answer:
      'Para imprimir la ficha de riesgo:\n1. Abre el expediente de la paciente.\n2. Entra en la pestana "Riesgo obstetrico".\n3. Verifica que la ficha este guardada.\n4. Presiona "Imprimir".\n5. El sistema generara el PDF de la ficha.\n\nSi no hay ficha registrada, primero presiona "Registrar ficha de riesgo" y guarda.',
  },
  {
    intent: 'secciones_expediente',
    title: 'Secciones del expediente',
    keywords: [
      'que tiene expediente',
      'secciones expediente',
      'pestanas expediente',
      'donde esta laboratorio',
      'donde esta morbilidad',
      'donde esta puerperio',
      'donde esta plan',
    ],
    answer:
      'El expediente de una paciente se organiza por pestanas:\n1. Datos generales: establecimiento, datos personales, gestacion y antecedentes.\n2. Controles: controles prenatales y sus acciones.\n3. Puerperio: seguimientos posteriores al parto.\n4. Morbilidad: eventos o consultas por enfermedad/complicacion.\n5. Riesgo obstetrico: ficha de riesgo e impresion.\n6. Plan de parto: plan, responsables, signos de peligro e impresion.\n7. Vacunas: registro y edicion de vacunas.\n8. Laboratorios: resultados guardados desde controles prenatales.',
  },
  {
    intent: 'primeros_pasos',
    title: 'Flujo recomendado',
    keywords: [
      'por donde empiezo',
      'primeros pasos',
      'flujo sistema',
      'orden registro',
      'como usar sistema',
      'que hago primero',
    ],
    answer:
      'Flujo recomendado para trabajar una paciente:\n1. Registra la paciente desde "Nueva".\n2. Abre el expediente desde "Pacientes".\n3. Registra o revisa la ficha de riesgo.\n4. Agrega controles prenatales conforme se atienda a la paciente.\n5. Dentro de cada control, registra laboratorios, suplementacion y orientaciones.\n6. Registra plan de parto cuando corresponda.\n7. Agrega vacunas, morbilidad o puerperio segun el caso.\n8. Usa "Reportes" para revisar censos e indicadores.',
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
