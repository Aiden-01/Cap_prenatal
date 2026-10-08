# CPREN-69 — Menú, rutas y Dashboard según permisos

Trabajo local en equipo Casa, sobre main, base 1c16b56b6911a97c51027c1c237ed54678d3ad8e. Sin acceso a producción, cambios de roles, base de datos, backend, commit o push.

## Diagnóstico y matriz auditada

El menú ofrecía Reportes y Mapa sin permiso y las rutas públicas dentro del layout autenticado no comprobaban sus permisos. Dashboard solicitaba las tres consultas de reportes incondicionalmente. Además, algunos botones internos de expediente no distinguían crear de editar.

Fuentes: backend/src/routes/{pacientes,reportes,mapa,citas,citasCalendario,controles,riesgo,morbilidad,vacunas,usuarios,comunidades,auditoria,pdf}.js y middleware de autorización. Plan de parto y puerperio están definidos en controles.js. Las reglas siguientes reflejan permisos existentes; no crean permisos ni conceden acceso implícito por ser admin/director.

| Módulo o operación | Requisito real del backend | Comportamiento frontend |
| --- | --- | --- |
| Pacientes, expediente y GET clínicos | pacientes.ver | Menú, ruta y enlaces al expediente condicionados |
| Alta de paciente | pacientes.crear | Alta disponible independientemente de lectura; volver/guardar dirige a Inicio si no puede consultar pacientes |
| Edición de paciente | pacientes.editar | Formulario exige también pacientes.ver porque carga el registro |
| Calendario y cola sin próxima cita | pacientes.ver | No montar calendario ni consultar cola sin lectura |
| Modificar citas | controles.editar | Acciones requieren además acceso al recurso leído |
| Crear controles, riesgo, morbilidad o vacuna | controles.crear | Formulario y botones requieren también pacientes.ver para cargar datos |
| Editar/eliminar registros anteriores | controles.editar | Acciones diferenciadas de crear; formularios requieren lectura |
| Guardar plan de parto o crear puerperio | controles.crear Y controles.editar | Ambos permisos y lectura; no simplificar la condición del backend |
| Reportes, estadísticas, próximas al parto, sin control, censo, primer control, controles prenatales, riesgo y resumen por comunidad | reportes.ver | Menú/ruta/consultas/tarjetas/pestañas solo con lectura de reportes |
| Exportaciones PDF/Excel de reportes | reportes.exportar | Conservar condición existente de botones de exportación; el endpoint no exige reportes.ver, pero la página consultiva sí lo exige |
| Mapa de riesgo | mapa_riesgo.ver | Menú y ruta condicionados; no enlazar pacientes sin pacientes.ver |
| Usuarios | rol admin o director | Mantener restricciones de rol; administración de permisos continúa siendo solo director en backend |
| Comunidades (administración) | rol director | Menú y ruta solo director |
| Comunidades activas (catálogo de formularios) | autenticación | No confundir este GET con administración del catálogo |
| Historial | rol admin/director Y auditoria.ver | Misma condición en menú y ruta |
| PDF clínico del expediente | pacientes.ver | No confundir con exportación de reportes |

La ruta compartida de riesgo acepta lectura y cualquiera de crear/editar para consultar si existe ficha; guardar exige el permiso exacto de POST o PUT según el resultado. Sin ese permiso se oculta Guardar y el handler no envía escritura.

## Solución

- accessRules.js centraliza reglas, módulos y comprobaciones; AccessRoute aplica la regla antes de montar el módulo lazy.
- Sidebar reutiliza la misma lista filtrada en móvil y escritorio. App protege módulos y formularios por URL.
- Dashboard separa pacientes/citas de reportes. Sin estadísticas muestra funciones disponibles; sin módulos muestra una bienvenida limpia. Conserva errores de consultas permitidas y el éxito de secciones independientes.
- Cambio de identidad, rol o permisos de sesión remonta Dashboard, aborta solicitudes iniciales/cola y descarta respuestas tardías. El timestamp de actividad no invalida el contenido.
- Pacientes, mapa, expediente y formularios limitan enlaces y acciones conforme a lectura/creación/edición existentes. No se cambian reglas clínicas ni contratos de concurrencia.

## Validación local

Datos sintéticos y API simulada en componentes; backend con repositorios de prueba y HTTP local. No se utilizaron registros ni credenciales productivas.

- Frontend: npm test: 187 pruebas Node y 163 DOM aprobadas (18 archivos DOM), cero fallidas/omitidas; npm run lint: exit 0; npm run build: exit 0, 1920 módulos, 3.90 s.
- Nuevas pruebas: perfiles completos, parciales, mínimos, admin/director; menú móvil/escritorio; Dashboard sin GET no autorizado; acceso directo denegado antes de montaje; errores legítimos independientes; revocación, respuestas tardías y renovación real mediante useAuth; acciones clínicas con crear, editar, ambos o ninguno.
- Regresiones backend ejecutadas: permissionsAudit, permissionHistoryDetail, reportes, auditoria, citasCalendario y citasSinProxima: 76 aprobadas, 0 fallidas, 0 omitidas. Las denegaciones 403 son casos esperados.
- La suite frontend completa incluye pacientes, fechas civiles, conflicto PATIENT_VERSION_CONFLICT, calendario/cola, reportes y contratos de mapa. Dos fixtures antiguos se actualizaron con permisos explícitos para las operaciones que probaban; dos pruebas estructurales se adaptaron a las reglas centralizadas.
- Primer intento backend bloqueado por EACCES del sandbox al abrir HTTP local; repetición autorizada fuera del sandbox pasó. No es un defecto del producto.
- Una repetición frontend dentro del sandbox falló antes de ejecutar 13 archivos por ENOENT al leer temporales de Vitest. Repetición completa aislada fuera del sandbox: 18 archivos DOM y las 187 pruebas Node pasaron. No se atribuye una causa más específica sin evidencia.
- Build conserva advertencia previa de Browserslist desactualizado; no se actualizan dependencias.

## Límites y revisión

La validación móvil/escritorio es automatizada sobre variantes de Sidebar en jsdom, no una inspección visual en dispositivos reales. Mapa conserva sus regresiones de contratos; no se verificaron teselas externas. No se ejecutó autenticación productiva ni una matriz con cuentas reales. La autorización backend permanece como frontera de seguridad y verifica permisos actuales en cada petición; el frontend utiliza la instantánea renovada de sesión.

El diff completo incluye archivos nuevos sin staging. CPREN-69 queda En revisión para revisión del código y aprobación de commit. Ningún resultado histórico sin evidencia se usa como validación de este cambio.
