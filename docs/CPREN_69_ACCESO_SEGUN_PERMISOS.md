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
- Dashboard separa pacientes/citas, reportes, resumen del mapa y registro según permisos. Inicio siempre está disponible; sin módulos principales muestra una bienvenida útil. Conserva errores de consultas permitidas y el éxito de secciones independientes.
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

## Correcciones locales posteriores al despliegue — 2026-10-08

Base: cae3f4c5abc9bd00140daab690db7f8dd436f1d3. Esta sección describe cambios pendientes de revisión, todavía sin commit, push ni despliegue. No se accedió a producción durante esta corrección.

### Entrada según permisos

Se elimina por completo la tarjeta «Funciones disponibles». Inicio siempre permanece en /dashboard y en Sidebar para usuarios autenticados, sin homeDestination ni redirecciones automáticas. Con pacientes.ver muestra calendario/citas; con reportes.ver conserva estadísticas y errores legítimos; con mapa_riesgo.ver muestra resumen agregado del mapa y CTA; con pacientes.crear sin lectura muestra el bloque Registrar paciente. Los bloques se combinan según permisos. Sin módulos principales muestra bienvenida y accesos de administración autorizados, o indicaciones para solicitar acceso. Sin pestañas autorizadas no se renderiza su contenedor.

### Abrir control prenatal

La causa era la discrepancia entre la condición de Timeline (pacientes.ver) y prenatalControlDetailPath, que enviaba Abrir a /editar, protegido por controles.editar. La consulta ahora usa /pacientes/:id/controles/:controlId?embarazo_id=... y exige pacientes.ver. Edición conserva /editar y exige pacientes.ver + controles.editar.

Ambas rutas reutilizan NuevoControl. La consulta fija consultationOnly: fieldsets no editables, sin Guardar ni Eliminar, setters bloqueados y handler de submit bloqueado incluso si se dispara artificialmente en pruebas. Editar es una acción explícita del detalle, visible únicamente con permiso y embarazo activo editable. Embarazos cerrados y puerperio conservan solo lectura. El aviso distingue embarazo cerrado, puerperio, falta de permiso y vista de consulta. Crear sigue siendo una operación separada con controles.crear.

No se modificaron el backend, CPREN-68 ni las reglas VIH. El detalle solo solicita GET de control/expediente con el embarazo seleccionado; el backend conserva su redacción y el frontend conserva controles.ver_vih para mostrar resultados. La edición sin ese permiso sigue excluyendo campos VIH del PUT.

### Evidencia ejecutada

- npm test desde frontend: 187 Node + 185 DOM (19 archivos), 372 aprobadas, cero fallidas y omitidas. Incluye 22 regresiones adicionales: 15 de consulta/edición y 7 de destinos/rutas/perfiles mínimos.
- Consulta: pacientes.ver solo, crear sin editar, editar y VIH permitido/denegado, embarazo activo/cerrado, Abrir real desde Timeline, bloqueo de todos los campos en todas las pestañas y cero POST/PUT/PATCH/DELETE. Acciones de edición, alta separada y payload VIH también comprobados.
- Inicio: solo mapa, pacientes sin reportes, mínimo sin módulos, admin/director mínimos, destinos sin duplicación de Inicio, menú móvil/escritorio, URLs directas y errores legítimos. Se conservan regresiones de renovación de permisos, fechas, concurrencia 409 y citas.
- node --test test/datosSensibles.test.js desde backend: 24 aprobadas, cero fallidas/omitidas; redacción recursiva, timestamps y JSON de control/expediente con y sin permiso. Datos sintéticos; sin cambios backend.
- npm run lint desde frontend: exit 0. npm run build: exit 0, 1920 módulos, 2.13 s. Advertencia previa de Browserslist conservada; sin actualizar dependencias.
- Primer intento focalizado en sandbox: 11 casos de control pasaron; la suite de permisos no arrancó por ENOENT en temporales de Vitest. Repetición fuera del sandbox pasó; la suite completa final también pasó. Una invocación de lint desde raíz no tenía script; se ejecutó correctamente desde frontend.

Validación de UI mediante jsdom y variantes móvil/escritorio; no se afirma prueba visual en dispositivos físicos ni validación de estos cambios en producción. La selección entre varios módulos mínimos respeta el orden existente, sin modificar roles o permisos. Pendiente revisión del diff y autorización de commit.

### Histórico — ajuste de registro anterior a la decisión de Dashboard universal

La revisión detectó una regresión real del parche anterior: homeDestination enviaba automáticamente a /nuevo; NuevaPaciente ya vuelve a /dashboard tanto al cancelar como después del POST exitoso. Eso reabría el formulario en vez de concluir la operación.

Se corrigen únicamente homeDestination y la entrada sin widgets de Dashboard: alta ya no es un destino automático; solo crear termina en Inicio sencillo con un botón «Registrar paciente». Si también puede consultar mapa, el destino inicial y el retorno desde alta terminan en mapa. No se cambia NuevaPaciente ni la separación consulta/edición de controles o la política VIH.

Pruebas nuevas con NuevaPaciente real, router, guardas y Sidebar: siete casos cubren acceso explícito móvil/escritorio, Volver y POST exitoso de crear sin pacientes.ver, ambos con y sin mapa, y prioridad de mapa al entrar a Inicio. El POST usa respuesta sintética; se comprueba una sola apertura del formulario y retorno estable, sin GET de pacientes/reportes ni PUT. Solo el catálogo autenticado de comunidades se solicita desde alta.

Resultados de este ajuste: tres suites focalizadas, 61 pruebas aprobadas; suite frontend completa, 187 Node + 192 DOM (20 archivos), 379 aprobadas, cero fallidas/omitidas; ESLint exit 0; build exit 0, 1920 módulos, 2.10 s. Conserva las pruebas de consulta de controles, cero escrituras, edición y VIH del parche anterior. No se repitió la suite backend porque no se modifica su código ni su contrato.

Se entrega diff adicional contra el parche revisado previo, además del acumulado contra HEAD, ambos con archivos nuevos y validación de Git. Sin staging, commit, push, despliegue ni acceso a producción. CPREN-69 permanece En revisión.

### Decisión vigente — Dashboard universal y modular

La nueva regla de producto sustituye la elección automática de destinos descrita en el apartado histórico. Se elimina homeDestination y su filtro de Inicio. No se cambian las rutas protegidas, la consulta/edición de controles ni los permisos VIH. Volver y POST exitoso de registro regresan siempre a Dashboard, también cuando existe acceso a mapa.

| Perfil | Contenido principal de Inicio |
| --- | --- |
| Solo mapa | Resumen real del mapa y Abrir mapa completo; sin pestañas |
| Solo pacientes.ver | Calendario y cola de citas |
| Solo pacientes.crear | Bloque Registrar paciente; formulario solo por acción explícita |
| Crear + mapa | Resumen del mapa y registro; sin redirección |
| Pacientes.ver + mapa | Resumen del mapa y citas |
| Reportes.ver | Estadísticas y alertas de reportes |
| Permisos comunes completos | Estadísticas, resumen del mapa y citas, con navegación autorizada |
| Sin módulos principales | Bienvenida con herramientas administrativas autorizadas o indicación de solicitar acceso |

DashboardMapSummary se monta únicamente con mapa_riesgo.ver. Usa el GET existente /mapa/riesgo, calcula conteos de comunidades y pacientes con riesgo y conserva exclusivamente agregados en estado. No muestra ni retiene listas de pacientes o coordenadas; no añade dependencias de mapas ni teselas. Loading, error y reintento son explícitos; no presenta ceros ficticios ante fallos. Aborta GET y descarta respuestas tardías al retirarse el permiso. Los bloques usan el diseño card existente y texto que se adapta al ancho disponible.

Validación final ejecutada: npm test desde frontend, 187 Node + 204 DOM (20 archivos), 391 aprobadas, cero fallidas/omitidas. Focalizadas: 73 aprobadas. Cubre los ocho perfiles, menú móvil/escritorio con Inicio siempre presente, URLs protegidas, CTA de mapa, agregados sin filas clínicas, errores/reintento, revocación de permiso, Volver/POST real de registro y las regresiones de consulta de controles/VIH. ESLint final exit 0; build final exit 0, 1921 módulos, 2.52 s. Se corrigió el aviso inicial de ESLint por setState síncrono en el efecto del resumen: loading/error se reinician en la acción de reintento. Advertencia previa Browserslist sin actualizar dependencias.

No se ejecutaron nuevas pruebas backend porque permanece intacto; la evidencia previa de redacción API VIH sigue separada de la verificación frontend actual. Pruebas con datos sintéticos en jsdom; sin inspección visual física ni acceso productivo. Diff actualizado contra cae3f4c5 incluye consulta de controles ya aprobada y archivos nuevos; sin staging, commit, push ni despliegue. Pendiente revisión humana, CPREN-69 En revisión.
