const DAY_MS = 24 * 60 * 60 * 1000;

const FRIENDLY_OPENINGS = {
  calcular_fpp: 'Claro, te ayudo con eso.',
  registrar_paciente: 'Va, hagamos el registro con calma.',
  buscar_paciente: 'Claro, para encontrarla rápido:',
  editar_paciente: 'Si hay que corregir datos, se puede hacer desde el expediente.',
  embarazo_activo: 'Buena pregunta. Esto conviene hacerlo con cuidado.',
  control_prenatal: 'Claro, vamos con el control prenatal.',
  ficha_riesgo: 'Va, revisemos la ficha de riesgo.',
  interpretar_riesgo: 'Te cuento como leerlo en el sistema.',
  mapa_riesgo: 'Va, el mapa te ayuda a ver el riesgo por comunidad.',
  laboratorio: 'Claro, para registrar laboratorios:',
  reportes: 'Si quieres generar un reporte, ve por aquí:',
  filtrar_reportes: 'Para ajustar el período del reporte:',
  usuarios: 'Para usuarios y permisos, revisa esto:',
  cambiar_password: 'Claro, puedes cambiar tu contraseña desde tu cuenta.',
  olvido_contrasena: 'Eso pasa, no te preocupes.',
  errores_guardado: 'Entiendo, cuando no guarda desespera un poco.',
  datos_obligatorios: 'Puede que falte un dato requerido.',
  sin_internet: 'Si el sistema está lento o no carga, revisa esto primero.',
  ayuda_bot: 'Aquí estoy para ayudarte con el sistema.',
  primeros_pasos: 'Si estás empezando, este orden te puede ayudar.',
};

const FRIENDLY_CLOSINGS = {
  eliminar_registro: 'Mi consejo: si solo fue un dato mal escrito, usa Editar antes de eliminar.',
  privacidad_datos: 'La idea es cuidar la información de las pacientes con la misma seriedad con la que se cuida el expediente físico.',
  olvido_contrasena: 'Cuando te restablezcan el acceso, entra con tu usuario y cambia la clave si te lo solicitan.',
  sin_internet: 'Si después de eso sigue igual, conviene reportarlo con la hora y la pantalla donde falló.',
};

const DEFAULT_OPENING = 'Claro, te ayudo.';
const DEFAULT_CLOSING = '';
const CLINICAL_DISCLAIMER = 'Te oriento sobre el sistema; lo clínico siempre se confirma con criterio profesional y protocolo local.';

const knowledgeBase = [
  {
    intent: 'calcular_fpp',
    title: 'Cálculo de FPP',
    keywords: [
      'fpp',
      'fecha probable de parto',
      'fecha parto',
      'fecha de parto',
      'fur',
      'última regla',
      'última menstruación',
      'calcular parto',
      'sacar fecha',
    ],
    answer:
      'Para calcular la FPP:\n1. Confirma la FUR de la paciente.\n2. Suma 280 días a esa fecha.\n3. Registra la FPP en el formulario donde corresponda.\n\nTambién puedes escribirme una fecha, por ejemplo: "mi FUR fue 2026-01-10", y te daré la FPP aproximada.',
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
      'Para registrar una paciente nueva:\n1. En el menú lateral, entra en "Nueva".\n2. Completa primero No. de Expediente, nombres y apellidos.\n3. Ingresa los datos de establecimiento, datos personales, gestación actual, antecedentes y riesgo social.\n4. Revisa la pantalla de confirmación.\n5. Presiona "Guardar paciente".\n\nAl guardar, el sistema abre el expediente de la paciente. Después podrás encontrarla desde "Pacientes".',
  },
  {
    intent: 'buscar_paciente',
    title: 'Búsqueda de pacientes',
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
      'Para buscar una paciente:\n1. Entra en "Pacientes" desde el menú lateral.\n2. Usa el buscador o revisa la lista.\n3. Haz clic sobre la paciente para abrir su expediente.\n4. Dentro del expediente puedes revisar datos generales, controles, puerperio, morbilidad, riesgo, plan de parto, vacunas y laboratorios.',
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
      'gestación nueva',
    ],
    answer:
      'El sistema trabaja con el embarazo activo de la paciente. Para crear un nuevo embarazo:\n1. Abre el expediente de la paciente.\n2. Presiona "Nuevo embarazo".\n3. Confirma que deseas cerrar el embarazo activo.\n4. Ingresa la FUR y FPP del nuevo embarazo si las tienes.\n5. Guarda y verifica que aparezca como embarazo activo.\n\nUsa esta opción solo cuando realmente inicia una nueva gestación.',
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
      'presión',
      'altura uterina',
      'frecuencia cardiaca fetal',
    ],
    answer:
      'Para agregar un control prenatal:\n1. Busca la paciente en "Pacientes" y abre su expediente.\n2. Presiona el botón "Control".\n3. Revisa el No. de control, fecha, hora y semanas de gestación.\n4. Completa motivo de consulta, acompañante y personal que atiende.\n5. Marca signos de peligro si existen.\n6. Llena las pestañas necesarias: General, Laboratorios, Suplementación y Orientaciones.\n7. Presiona "Guardar control".\n\nLos laboratorios se registran dentro del control prenatal, en la pestaña "Laboratorios".',
  },
  {
    intent: 'impresion_no_disponible',
    title: 'Impresión de expediente',
    keywords: [
      'imprimir expediente',
      'imprimo expediente',
      'imprimo el expediente',
      'impresión expediente',
      'imprimir ficha',
      'imprimir pdf',
      'generar pdf expediente',
      'descargar expediente',
      'pdf expediente',
    ],
    answer:
      'Para imprimir o generar documentos desde el expediente:\n1. Abre el expediente de la paciente.\n2. Usa el botón "Expediente" para generar el PDF MSPAS.\n3. En la pestaña "Riesgo obstétrico", usa "Imprimir" para la ficha de riesgo.\n4. En la pestaña "Plan de parto", usa "Imprimir" para ese formato.\n\nSi un PDF no se genera, revisa que el registro exista y que los datos principales estén completos.',
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
      'Para editar un control prenatal:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Controles".\n3. Busca el control que deseas corregir.\n4. Presiona "Editar".\n5. Ajusta datos generales, examen, laboratorios, suplementación u orientaciones.\n6. Guarda los cambios.\n\nVerifica que estés editando el control correcto antes de guardar.',
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
      'Para eliminar un registro:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña donde está el registro: controles, puerperio, morbilidad, riesgo o vacunas.\n3. Presiona "Eliminar" en el registro correcto.\n4. Confirma solo si estás seguro.\n\nEsta acción borra el registro seleccionado. Si solo hay un error de captura, normalmente conviene usar "Editar".',
  },
  {
    intent: 'ficha_riesgo',
    title: 'Ficha de riesgo',
    keywords: [
      'riesgo',
      'ficha riesgo',
      'clasificación riesgo',
      'alto riesgo',
      'riesgo medio',
      'riesgo bajo',
      'evaluar riesgo',
      'factores de riesgo',
    ],
    answer:
      'Para llenar la ficha de riesgo:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Riesgo obstétrico".\n3. Presiona "Registrar ficha de riesgo" o "Editar".\n4. Verifica fecha, teléfono, pueblo, estado civil, escolaridad, ocupación, FUR y FPP.\n5. Marca los criterios que apliquen en antecedentes obstétricos, embarazo actual e historia clínica general.\n6. Si corresponde, completa "Referida a" y el nombre del personal que atendió.\n7. Presiona "Guardar ficha".',
  },
  {
    intent: 'interpretar_riesgo',
    title: 'Interpretación de riesgo',
    keywords: [
      'que significa riesgo alto',
      'que significa riesgo medio',
      'que significa riesgo bajo',
      'interpretar riesgo',
      'clasificación',
      'semaforo riesgo',
    ],
    answer:
      'La ficha de riesgo marca si la paciente presenta criterios de riesgo obstétrico dentro del sistema.\n\nCómo usarlo:\n1. Abre el expediente y revisa la pestaña "Riesgo obstétrico".\n2. Confirma que los criterios marcados sean correctos.\n3. Si aparece "Presenta riesgo", revisa el detalle de los factores.\n4. Aplica el protocolo clínico local correspondiente y registra referencia si corresponde.\n\nEl asistente solo orienta sobre el sistema; no sustituye criterio clínico.',
  },
  {
    intent: 'mapa_riesgo',
    title: 'Mapa de riesgo',
    keywords: [
      'mapa de riesgo',
      'mapa riesgo',
      'mapa obstetrico',
      'mapa obstetrico de riesgo',
      'que hace el mapa',
      'como funciona el mapa',
      'ver mapa',
      'comunidades en riesgo',
      'riesgo por comunidad',
      'pacientes en el mapa',
      'embarazadas en riesgo',
      'por que aparece en mapa',
      'por que no aparece en mapa',
    ],
    answer:
      'El mapa de riesgo muestra las comunidades del Municipio de El Chal y marca dónde hay embarazadas con riesgo obstétrico activo.\n\nCómo usarlo:\n1. Entra en "Mapa de riesgo" desde el menú lateral.\n2. Revisa los marcadores sobre las comunidades.\n3. Si un marcador tiene número, ese número indica cuántas embarazadas con riesgo activo hay en esa comunidad.\n4. Haz clic en una comunidad para abrir el panel lateral.\n5. En el panel puedes ver las pacientes con riesgo y abrir su expediente.\n\nUna paciente aparece en el mapa cuando tiene ficha de riesgo con riesgo activo y su embarazo está activo. Si el embarazo se cierra o deja de estar activo, ya no se cuenta en el mapa. El mapa está limitado al área de El Chal para evitar navegar fuera del municipio.',
  },
  {
    intent: 'vacunas',
    title: 'Vacunas',
    keywords: [
      'vacuna',
      'vacunas',
      'inmunización',
      'registrar vacuna',
      'editar vacuna',
      'tdap',
      'influenza',
      'toxide',
      'toxoide',
      'dosis',
    ],
    answer:
      'Para registrar una vacuna:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Vacunas".\n3. Presiona "Registrar vacuna".\n4. Selecciona el tipo: Td/Tdap, Influenza o SPR/SR.\n5. Selecciona el momento: previo embarazo, durante embarazo o postparto/aborto.\n6. Ingresa No. de dosis y fecha de dosis.\n7. Presiona "Guardar".',
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
      'Para editar una vacuna:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Vacunas".\n3. Busca la vacuna registrada.\n4. Presiona "Editar".\n5. Corrige tipo, momento, dosis o fecha.\n6. Presiona "Guardar".\n\nVerifica fecha, tipo de vacuna y dosis antes de guardar.',
  },
  {
    intent: 'morbilidad',
    title: 'Morbilidad',
    keywords: [
      'morbilidad',
      'enfermedad',
      'complicación',
      'diagnóstico',
      'registrar morbilidad',
      'editar morbilidad',
      'antecedente',
    ],
    answer:
      'Para registrar morbilidad:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Morbilidad".\n3. Presiona "Registrar morbilidad".\n4. Ingresa fecha, hora y motivo de consulta.\n5. Completa historia de enfermedad actual, revisión por sistemas, examen físico, impresión clínica y tratamiento/referencia.\n6. Agrega nombre y cargo de quien atiende.\n7. Presiona "Guardar".\n\nEl registro queda asociado al embarazo activo.',
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
      'Para registrar puerperio:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Puerperio".\n3. Presiona "Registrar puerperio".\n4. Completa No. de atención, fecha, hora y días después del parto.\n5. Ingresa lugar del parto, quién atendió, tipo de parto, presión, temperatura y personal que atiende.\n6. Marca RN vivo, apego inmediato y lactancia materna exclusiva si corresponde.\n7. Completa los demás campos del seguimiento y guarda.',
  },
  {
    intent: 'laboratorio',
    title: 'Laboratorio',
    keywords: [
      'laboratorio',
      'examen',
      'exámenes',
      'hemoglobina',
      'vih',
      'sifilis',
      'orina',
      'glicemia',
      'registrar laboratorio',
    ],
    answer:
      'Para registrar laboratorios:\n1. Abre el expediente de la paciente.\n2. Presiona "Control" o edita un control existente.\n3. En el formulario del control, entra en la pestaña "Laboratorios".\n4. Marca el examen realizado: hematología, glicemia, grupo/RH, orina, heces, VIH, VDRL/RPR, TORCH, Papanicolau/IVAA, Hepatitis B o USG.\n5. Ingresa el resultado o detalle que corresponda.\n6. Guarda el control.\n\nLuego los resultados se ven en la pestaña "Laboratorios" del expediente.',
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
      'Para dejar constancia de una referencia:\n1. Abre el expediente de la paciente.\n2. Si es por morbilidad, entra en "Morbilidad" y registra el tratamiento/referencia.\n3. Si es por ficha de riesgo, entra en "Riesgo obstétrico" y completa "Referida a".\n4. Guarda el formulario.\n\nAnota el lugar de referencia de forma clara para que quede visible en el expediente.',
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
      'Para revisar seguimiento prenatal:\n1. Abre el expediente de la paciente.\n2. Entra en "Controles" y revisa el último control registrado.\n3. Verifica la fecha de "Cita siguiente" si fue registrada.\n4. En el Dashboard puedes revisar "Citas próximas" y "Sin control reciente".\n5. Define la próxima atención según el protocolo local.',
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
      'Para generar reportes:\n1. Entra en "Reportes" desde el menú lateral.\n2. Selecciona el modo de censo o consulta disponible.\n3. Elige el período cuando el sistema lo solicite.\n4. Presiona "Generar censo mensual" o "Ver censo actual".\n5. Revisa la tabla resultante.\n6. Si el botón de exportación está disponible para tu usuario, puedes descargar el archivo.',
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
      'Para filtrar reportes por fecha o período:\n1. Entra en "Reportes".\n2. Selecciona el tipo de reporte.\n3. Ajusta mes, año o rango de fechas según aparezca en pantalla.\n4. Genera el reporte.\n5. Antes de exportar, confirma que el período mostrado sea el correcto.',
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
      'Para gestionar usuarios, debes entrar con rol administrador.\n\nPasos:\n1. En el menú lateral, entra en "Usuarios".\n2. Para crear una cuenta, llena nombre completo, usuario, contraseña y rol.\n3. Para editar, selecciona el usuario existente y cambia los datos necesarios.\n4. Guarda los cambios.\n\nSi no ves "Usuarios", tu cuenta no tiene permiso de administrador.',
  },
  {
    intent: 'cambiar_password',
    title: 'Cambiar contraseña',
    keywords: [
      'cambiar contrasena',
      'cambiar contraseña',
      'cambiar mi contrasena',
      'cambiar mi contraseña',
      'cambiar clave',
      'cambiar mi clave',
      'actualizar contrasena',
      'actualizar contraseña',
      'actualizar mi contrasena',
      'actualizar mi contraseña',
      'nueva contrasena',
      'nueva contraseña',
      'modificar contrasena',
      'modificar contraseña',
      'modificar mi clave',
      'poner otra clave',
      'quiero cambiar mi password',
      'cambiar password',
    ],
    answer:
      'Para cambiar tu contraseña:\n1. Ve al menú lateral.\n2. Presiona la opción "Cambiar contraseña".\n3. Escribe tu contraseña actual.\n4. Escribe la nueva contraseña.\n5. Confirma la nueva contraseña en el último campo.\n6. Presiona "Guardar cambios".\n\nSi la contraseña actual no coincide, el sistema no permitirá el cambio. Si olvidaste tu contraseña y no puedes entrar, debes pedir apoyo al responsable técnico para restablecer el acceso.',
  },
  {
    intent: 'olvido_contrasena',
    title: 'Contraseña olvidada',
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
      'Si olvidaste tu contraseña, comunícate con el Ingeniero a cargo del distrito o del área de salud para que pueda apoyarte con el restablecimiento del acceso.',
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
      'Si no ves una opción del sistema, probablemente tu usuario no tiene ese permiso. La gestión de usuarios está reservada para administradores.',
  },
  {
    intent: 'sesion',
    title: 'Sesión del sistema',
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
      'Para salir del sistema usa "Cerrar sesión" en el menú lateral. Si la sesión expira, el sistema te enviará nuevamente a la pantalla de inicio de sesión.',
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
      'Para cambiar el tema:\n1. Ve al menú lateral.\n2. Busca el botón "Modo oscuro" o "Modo claro".\n3. Presiónalo para alternar el tema.\n\nEl sistema recordará tu preferencia en ese navegador.',
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
      'El Dashboard sirve para revisar el estado general del sistema.\n\nAhí puedes ver:\n1. Total de pacientes.\n2. Controles del mes.\n3. Pacientes con riesgo.\n4. Pacientes próximas al parto.\n5. Pacientes sin control reciente.\n6. Citas próximas.\n\nPuedes hacer clic en varias tarjetas o filas para abrir el expediente relacionado.',
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
      'Si un formulario no guarda:\n1. Revisa los campos obligatorios marcados con asterisco o mensajes de error.\n2. Verifica fechas en formato correcto.\n3. Confirma que los números no lleven letras o símbolos raros.\n4. Si estás editando, revisa que el registro todavía exista.\n5. Intenta guardar nuevamente.\n6. Si continúa, reporta el error al responsable técnico con el nombre de la pantalla y la acción que estabas haciendo.',
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
      'Los campos obligatorios deben completarse antes de guardar.\n\nEn paciente nueva, revisa especialmente:\n1. No. de Expediente.\n2. Nombres.\n3. Apellidos.\n4. Datos básicos de gestación cuando apliquen.\n\nEn otros formularios, revisa fecha, tipo de registro y datos principales antes de guardar.',
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
      'La información de las pacientes debe manejarse con confidencialidad. Usa tu cuenta personal, cierra sesión al terminar y evita compartir datos fuera del sistema.',
  },
  {
    intent: 'sin_internet',
    title: 'Problemas de conexión',
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
      'Si el sistema no carga o está lento, verifica la conexión de red y vuelve a intentar. Si el problema persiste, repórtalo al responsable técnico del distrito o área de salud.',
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
      'Puedo ayudarte a ubicarte dentro del sistema, resolver dudas de registro y guiarte cuando no sepas dónde tocar. Dime qué estás intentando hacer y te digo el camino más directo.\n\nNo doy diagnósticos médicos ni sustituyo criterio clínico.',
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
      'Para imprimir el plan de parto:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Plan de parto".\n3. Verifica que ya exista un plan guardado.\n4. Presiona "Imprimir".\n5. El sistema abrirá el PDF en una nueva pestaña.\n\nSi no aparece el botón o falla el PDF, primero guarda el plan de parto.',
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
      'Para registrar o editar el plan de parto:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Plan de parto".\n3. Presiona "Registrar plan de parto" o "Editar".\n4. Revisa los datos precargados desde paciente, riesgo y último control.\n5. Completa datos generales, resumen obstétrico, logística, responsables y signos de peligro.\n6. Presiona "Guardar plan".\n7. Para generar el formato, vuelve a la pestaña "Plan de parto" y presiona "Imprimir".',
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
      'Para imprimir la ficha de riesgo:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Riesgo obstétrico".\n3. Verifica que la ficha esté guardada.\n4. Presiona "Imprimir".\n5. El sistema generará el PDF de la ficha.\n\nSi no hay ficha registrada, primero presiona "Registrar ficha de riesgo" y guarda.',
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
      'El expediente de una paciente se organiza por pestañas:\n1. Datos generales: establecimiento, datos personales, gestación y antecedentes.\n2. Controles: controles prenatales y sus acciones.\n3. Puerperio: seguimientos posteriores al parto.\n4. Morbilidad: eventos o consultas por enfermedad/complicación.\n5. Riesgo obstétrico: ficha de riesgo e impresión.\n6. Plan de parto: plan, responsables, signos de peligro e impresión.\n7. Vacunas: registro y edición de vacunas.\n8. Laboratorios: resultados guardados desde controles prenatales.',
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
      'Flujo recomendado para trabajar una paciente:\n1. Registra la paciente desde "Nueva".\n2. Abre el expediente desde "Pacientes".\n3. Registra o revisa la ficha de riesgo.\n4. Agrega controles prenatales conforme se atienda a la paciente.\n5. Dentro de cada control, registra laboratorios, suplementación y orientaciones.\n6. Registra plan de parto cuando corresponda.\n7. Agrega vacunas, morbilidad o puerperio según el caso.\n8. Usa "Reportes" para revisar censos e indicadores.',
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
  return `Con FUR ${formatDate(furDate)}, la FPP aproximada es ${formatDate(fppDate)}.\n\nUsé la fórmula FPP = FUR + 280 días. Puedes registrarla en el campo FPP correspondiente y confirmar que coincida con el criterio del servicio.`;
}

function findBestIntent(message) {
  const ranked = knowledgeBase
    .map((item) => ({ ...item, score: scoreIntent(message, item) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 2 ? ranked[0] : null;
}

function isSimpleGreeting(message) {
  const normalized = normalizeText(message);
  return [
    /^hola(?: lia)?(?: necesito ayuda| ayudame| puedes ayudarme)?$/,
    /^buen(?:os)? dias?(?: lia)?$/,
    /^buenas(?: tardes| noches)?(?: lia)?$/,
    /^hey(?: lia)?$/,
    /^holi(?: lia)?$/,
    /^que tal(?: lia)?$/,
    /^como estas(?: lia)?$/,
  ].some((pattern) => pattern.test(normalized));
}

function isSimpleThanks(message) {
  const normalized = normalizeText(message);
  return [
    /^(?:muchas )?gracias(?: lia)?$/,
    /^te lo agradezco(?: lia)?$/,
    /^(?:perfecto|listo) gracias(?: lia)?$/,
    /^buena onda(?: gracias)?$/,
  ].some((pattern) => pattern.test(normalized));
}

function isSimpleFarewell(message) {
  const normalized = normalizeText(message);
  return /^(?:adios|hasta luego|nos vemos|chao|hasta manana|eso es todo|ya termine)(?: lia)?$/.test(normalized);
}

function withoutSocialLeadIn(message) {
  return normalizeText(message).replace(
    /^(?:(?:hola|hey|holi)(?: lia)?|buen(?:os)? dias?(?: lia)?|buenas(?: tardes| noches)?(?: lia)?|(?:muchas )?gracias(?: lia)?)\s+/,
    ''
  );
}

function findOperationalSafetyException(message) {
  const normalized = withoutSocialLeadIn(message);
  const treatmentRegistration = /^(?:donde|en donde|como) (?:registro|registrar|escribo|ingreso|anoto|documento) (?:el |un )?(?:medicamento|tratamiento)(?: indicado)?(?: en el sistema)?$/;

  if (treatmentRegistration.test(normalized)) return 'morbilidad';
  return null;
}

function getClinicalDataRequest(message) {
  const normalized = withoutSocialLeadIn(message);
  const patterns = [
    /^(?:esta|la) paciente tiene vih$/,
    /^quiero saber si (?:esta|la) paciente tiene vih$/,
    /^quiero saber (?:el )?resultado (?:de )?vih de (?:esta|la) paciente$/,
    /^(?:cual|que) es (?:el )?resultado (?:de )?vih(?: de (?:esta|la) paciente)?$/,
    /^(?:cual|que) es su diagnostico$/,
    /^dime (?:los|sus) laboratorios de (?:esta|la) paciente$/,
    /^que enfermedad tiene(?: (?:esta|la) paciente)?$/,
    /^cual es su presion$/,
    /^muestrame (?:sus|los) datos clinicos(?: de (?:esta|la) paciente)?$/,
  ];

  if (!patterns.some((pattern) => pattern.test(normalized))) return null;
  return { mentionsVih: /\bvih\b/.test(normalized) };
}

function isClinicalAdviceRequest(message) {
  const normalized = withoutSocialLeadIn(message);
  return [
    /^que medicamento (?:debo darle|le doy|puedo darle|debo usar|recomiendas)$/,
    /^recomiendame (?:un )?medicamento$/,
    /^que tratamiento (?:le pongo|le doy|debo darle|debo usar|puedo darle|recomiendas)$/,
    /^(?:cual|que) es el diagnostico$/,
    /^que dosis (?:debo|puedo) (?:usar|dar|darle|indicar)$/,
    /^que hago si (?:la paciente )?tiene presion alta$/,
    /^es peligroso (?:este|ese) resultado$/,
    /^(?:debe|deberia) ser referida(?: la paciente)?$/,
  ].some((pattern) => pattern.test(normalized));
}

function buildOperationalGuardResponse(intent, message) {
  const item = knowledgeBase.find((candidate) => candidate.intent === intent);
  if (!item) return null;

  const answer = item.intent === 'calcular_fpp'
    ? buildFppResponse(message, item.answer)
    : item.answer;

  return {
    recognized: true,
    intent: item.intent,
    title: item.title,
    answer: humanizeAnswer(item.intent, answer),
    confidence: 1,
    disclaimer: CLINICAL_DISCLAIMER,
  };
}

function conversationalizeSteps(answer) {
  const connectors = [
    'Primero',
    'Luego',
    'Despues',
    'Cuando ya estes ahi',
    'Al final',
    'Si aplica',
    'Para cerrar',
    'Tambien puedes',
  ];
  let stepIndex = 0;

  return answer
    .replace(/^Para ([^:\n]+):\n/i, (_, topic) => `Para ${topic}, hazlo asi:\n`)
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*\d+\.\s+(.+)$/);
      if (!match) return line;

      const connector = connectors[Math.min(stepIndex, connectors.length - 1)];
      stepIndex += 1;
      const text = match[1].charAt(0).toLowerCase() + match[1].slice(1);
      return `${connector}, ${text}`;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function humanizeAnswer(intent, answer) {
  const opening = FRIENDLY_OPENINGS[intent] || DEFAULT_OPENING;
  const closing = FRIENDLY_CLOSINGS[intent] || DEFAULT_CLOSING;
  const body = conversationalizeSteps(answer);

  return [opening, body, closing].filter(Boolean).join('\n\n');
}

function answerQuestion(message) {
  const text = String(message || '').trim();
  if (!text) {
    return {
      recognized: false,
      intent: 'mensaje_vacio',
      answer: 'Estoy aquí. Escríbeme qué necesitas hacer, por ejemplo: "quiero registrar una paciente" o "no me deja guardar".',
      suggestions: knowledgeBase.slice(0, 4).map((item) => item.title),
    };
  }

  if (isSimpleGreeting(text)) {
    return {
      recognized: true,
      intent: 'saludo',
      answer: '¡Hola! Aquí estoy 😊\nDime qué necesitas hacer en el sistema y te ayudo paso a paso.',
      suggestions: [
        'Registrar una paciente',
        'Agregar un control prenatal',
        'Revisar una ficha de riesgo',
        'Generar un reporte',
      ],
    };
  }

  if (isSimpleThanks(text)) {
    return {
      recognized: true,
      intent: 'agradecimiento',
      answer: '¡Con gusto! Si necesitas algo más del sistema, aquí estoy para ayudarte.',
    };
  }

  if (isSimpleFarewell(text)) {
    return {
      recognized: true,
      intent: 'despedida',
      answer: '¡Hasta luego! Cuando necesites ayuda con el sistema, aquí estaré.',
    };
  }

  const operationalException = findOperationalSafetyException(text);
  if (operationalException) {
    return buildOperationalGuardResponse(operationalException, text);
  }

  const clinicalDataRequest = getClinicalDataRequest(text);
  if (clinicalDataRequest) {
    const permissionGuidance = clinicalDataRequest.mentionsVih
      ? ' El acceso a resultados de VIH depende del permiso controles.ver_vih; no puedo afirmar si tu cuenta lo tiene.'
      : '';

    return {
      recognized: true,
      intent: 'solicitud_dato_clinico',
      answer: `No consulto ni revelo expedientes o resultados clínicos de pacientes. Revisa esa información dentro del expediente, con los permisos correspondientes.${permissionGuidance}`,
    };
  }

  if (isClinicalAdviceRequest(text)) {
    return {
      recognized: true,
      intent: 'solicitud_consejo_clinico',
      answer: 'Puedo orientarte sobre cómo usar el sistema, pero no puedo indicar medicamentos, dosis, diagnósticos o tratamientos ni clasificar la gravedad. Consulta al profesional responsable y los protocolos vigentes del MSPAS para decidir la conducta.',
    };
  }

  const bestIntent = findBestIntent(text);
  if (!bestIntent) {
    return {
      recognized: false,
      intent: 'no_reconocida',
      answer:
        'Eso no lo manejo bien todavía, y prefiero no inventarte algo. Puedes decirme en qué pantalla estás y qué campo o botón te dio duda. Si es algo de permisos o configuración, revísalo con el administrador del sistema.',
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
    answer: humanizeAnswer(bestIntent.intent, answer),
    confidence: Number(Math.min(bestIntent.score / 6, 1).toFixed(2)),
    disclaimer: CLINICAL_DISCLAIMER,
  };
}

module.exports = {
  answerQuestion,
  calculateFpp,
  knowledgeBase,
  normalizeText,
  parseFurDate,
  scoreIntent,
  tokenize,
};
