const chatbotKnowledge = [
  {
    id: 'calcular_fpp',
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
    suggestions: [],
  },
  {
    id: 'registrar_paciente',
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
    suggestions: [],
  },
  {
    id: 'buscar_paciente',
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
    suggestions: [],
  },
  {
    id: 'editar_paciente',
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
    suggestions: [],
  },
  {
    id: 'embarazo_activo',
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
    suggestions: [],
  },
  {
    id: 'cerrar_embarazo',
    title: 'Cerrar embarazo',
    keywords: [
      'cerrar embarazo',
      'cerrar el embarazo',
      'finalizar embarazo',
      'finalizar el embarazo',
      'pasar embarazo a puerperio',
      'pasar el embarazo a puerperio',
      'registrar que termino el embarazo',
    ],
    answer:
      'Para actualizar o cerrar el seguimiento de un embarazo:\n1. Abre el expediente de la paciente y entra en "Datos generales".\n2. En "Historial de embarazos", selecciona el embarazo actual.\n3. Si el parto ya ocurrió y registrarás atenciones posteriores, entra en "Puerperio" y presiona "Registrar puerperio"; al confirmar, el sistema cambia el embarazo activo a puerperio.\n4. Cuando corresponda finalizar todo el seguimiento, vuelve a "Historial de embarazos" y presiona "Cerrar embarazo" en el embarazo seleccionado.\n5. Confirma la acción. El embarazo quedará en el historial como cerrado y en modo de solo lectura.\n\nNo uses "Nuevo embarazo" únicamente para cerrar el seguimiento actual.',
    suggestions: [],
  },
  {
    id: 'control_prenatal',
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
    suggestions: [],
  },
  {
    id: 'impresion_no_disponible',
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
    suggestions: [],
  },
  {
    id: 'editar_control_prenatal',
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
    suggestions: [],
  },
  {
    id: 'eliminar_registro',
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
    suggestions: [],
  },
  {
    id: 'ficha_riesgo',
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
    suggestions: [],
  },
  {
    id: 'interpretar_riesgo',
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
    suggestions: [],
  },
  {
    id: 'mapa_riesgo',
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
    suggestions: [],
  },
  {
    id: 'vacunas',
    title: 'Vacunas',
    keywords: [
      'vacuna',
      'vacunas',
      'inmunización',
      'registrar vacuna',
      'tdap',
      'influenza',
      'toxide',
      'toxoide',
      'dosis',
    ],
    answer:
      'Para registrar una vacuna:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Vacunas".\n3. Presiona "Registrar vacuna".\n4. Selecciona el tipo: Td/Tdap, Influenza o SPR/SR.\n5. Selecciona el momento: previo embarazo, durante embarazo o postparto/aborto.\n6. Ingresa No. de dosis y fecha de dosis.\n7. Presiona "Guardar".',
    suggestions: [],
  },
  {
    id: 'editar_vacuna',
    title: 'Editar vacuna',
    keywords: [
      'editar vacuna',
      'modificar vacuna',
      'corregir vacuna',
      'actualizar vacuna',
      'vacuna incorrecta',
      'me equivoque en vacuna',
      'corregir dosis de una vacuna',
      'vacuna quedo incorrecta',
    ],
    answer:
      'Para editar una vacuna:\n1. Abre el expediente de la paciente.\n2. Entra en la pestaña "Vacunas".\n3. Busca la vacuna registrada.\n4. Presiona "Editar".\n5. Corrige tipo, momento, dosis o fecha.\n6. Presiona "Guardar".\n\nVerifica fecha, tipo de vacuna y dosis antes de guardar.',
    suggestions: [],
  },
  {
    id: 'morbilidad',
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
    suggestions: [],
  },
  {
    id: 'puerperio',
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
    suggestions: [],
  },
  {
    id: 'laboratorio',
    title: 'Laboratorio',
    keywords: [
      'laboratorio',
      'laboratorios',
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
    suggestions: [],
  },
  {
    id: 'referencias',
    title: 'Referencia desde Riesgo obstétrico o Morbilidad',
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
      'Para dejar constancia de una referencia usa el formulario clínico que corresponda:\n1. Abre el expediente de la paciente.\n2. En "Riesgo obstétrico", registra el destino en el campo "Referida a" (referida_a).\n3. En "Morbilidad", documenta el tratamiento o referencia en "Tratamiento/referencia" (tratamiento_referencia).\n4. Guarda el formulario.\n\nNo existe un módulo independiente de referencias.',
    suggestions: [],
  },
  {
    id: 'citas_seguimiento',
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
    suggestions: [],
  },
  {
    id: 'reportes',
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
    suggestions: [],
  },
  {
    id: 'filtrar_reportes',
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
    suggestions: [],
  },
  {
    id: 'usuarios',
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
    suggestions: [],
  },
  {
    id: 'cambiar_password',
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
    suggestions: [],
  },
  {
    id: 'olvido_contrasena',
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
    suggestions: [],
  },
  {
    id: 'permisos_usuario',
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
    suggestions: [],
  },
  {
    id: 'sesion',
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
    suggestions: [],
  },
  {
    id: 'modo_oscuro',
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
    suggestions: [],
  },
  {
    id: 'dashboard',
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
    suggestions: [],
  },
  {
    id: 'errores_guardado',
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
    suggestions: [],
  },
  {
    id: 'datos_obligatorios',
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
    suggestions: [],
  },
  {
    id: 'privacidad_datos',
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
    suggestions: [],
  },
  {
    id: 'sin_internet',
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
    suggestions: [],
  },
  {
    id: 'ayuda_bot',
    title: 'Ayuda del asistente',
    keywords: [
      'ayuda',
      'ayudame',
      'que puedes hacer',
      'como funciona',
      'asistente',
      'chatbot',
      'bot',
    ],
    answer:
      'Puedo ayudarte a ubicarte dentro del sistema, resolver dudas de registro y guiarte cuando no sepas dónde tocar. Dime qué estás intentando hacer y te digo el camino más directo.\n\nNo doy diagnósticos médicos ni sustituyo criterio clínico.',
    suggestions: [],
  },
  {
    id: 'imprimir_plan_parto',
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
    suggestions: [],
  },
  {
    id: 'plan_parto',
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
    suggestions: [],
  },
  {
    id: 'imprimir_riesgo',
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
    suggestions: [],
  },
  {
    id: 'secciones_expediente',
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
    suggestions: [],
  },
  {
    id: 'primeros_pasos',
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
    suggestions: [],
  },
];

const operationalPriorityRules = [
  {
    id: 'impresion_no_disponible',
    priority: 1,
    patterns: [
      /^quiero imprimir la ficha mspas$/,
      /^necesito descargar la ficha mspas$/,
      /^quiero sacar el pdf (?:del|de el) expediente$/,
      /^donde genero la ficha prenatal mspas$/,
    ],
  },
  {
    id: 'cerrar_embarazo',
    priority: 2,
    patterns: [
      /^como cierro un embarazo$/,
      /^quiero cerrar el embarazo actual$/,
      /^finalizar (?:el )?embarazo$/,
      /^pasar el embarazo a puerperio$/,
      /^registrar que termino el embarazo$/,
    ],
  },
  {
    id: 'cambiar_password',
    priority: 3,
    patterns: [
      /^como cambio mi (?:contrasena|clave|password)$/,
      /^quiero cambiar mi (?:contrasena|clave|password)$/,
    ],
  },
  {
    id: 'olvido_contrasena',
    priority: 4,
    patterns: [
      /^mi (?:contrasena|clave|password) no funciona$/,
      /^no puedo entrar con mi (?:contrasena|clave|password)$/,
      /^olvide mi (?:contrasena|clave|password)$/,
    ],
  },
  {
    id: 'secciones_expediente',
    priority: 5,
    patterns: [
      /^estoy en el expediente y no se que hacer$/,
      /^ya abri el expediente que sigue$/,
      /^que secciones tiene el expediente$/,
      /^donde estan las pestanas del expediente$/,
    ],
  },
  {
    id: 'puerperio',
    priority: 6,
    patterns: [
      /^seguimiento (?:de la madre )?despues de dar a luz$/,
      /^control despues del parto$/,
      /^atencion postparto$/,
      /^registrar seguimiento de la madre despues del parto$/,
    ],
  },
  {
    id: 'editar_vacuna',
    priority: 7,
    patterns: [
      /^quiero editar una vacuna$/,
      /^corregir la dosis de una vacuna$/,
      /^la vacuna quedo incorrecta$/,
    ],
  },
  {
    id: 'vacunas',
    priority: 8,
    patterns: [/^quiero registrar una vacuna$/],
  },
];

const laboratoryViewPatterns = [
  /^donde veo (?:los )?laboratorios$/,
  /^donde estan (?:los )?resultados (?:de |del )?laboratorio$/,
  /^quiero ver (?:los )?(?:resultados de )?laboratorios$/,
];

function deepFreeze(value) {
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return value;
}

deepFreeze(chatbotKnowledge);
deepFreeze(operationalPriorityRules);
deepFreeze(laboratoryViewPatterns);

module.exports = {
  chatbotKnowledge,
  laboratoryViewPatterns,
  operationalPriorityRules,
};
