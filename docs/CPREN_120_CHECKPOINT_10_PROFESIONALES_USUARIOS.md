# CHECKPOINT-10 — Profesionales, cargos y correo de usuarios

2026-10-23. Equipo Trabajo, dispositivo Aiden29.
Rama `feature/cpren-120-editor-pdf-notas-clinicas`.
HEAD inicial `b00ddf3e881abfa784e2262aceabaabef00bb465`.
[CPREN-120](https://tareajiraads.atlassian.net/browse/CPREN-120) permanece En revisión.
El correo obligatorio se registra como cambio funcional independiente en
[CPREN-126](https://tareajiraads.atlassian.net/browse/CPREN-126), bajo CPREN-3.

## Estado y límites

Entrega local para revisión visual y funcional del propietario. No constituye
aprobación funcional ni autorización de integración. Se conserva CHECKPOINT-09,
su documentación, capturas, editor compartido, pestaña Notas tras Controles,
fecha/hora Guatemala, recuperación e idempotencia.

El árbol ya estaba modificado al iniciar: no se hizo pull, reset, limpieza,
cambio de rama ni descarte. Sin staging, commit, push, main, AWS, despliegues,
n8n, CPREN-121, pacientes reales ni migraciones persistentes.

## Diagnóstico comprobado del directorio

Se revisaron `profesionalesRepository.js`, `autoriaClinicaService.js`, la ruta
`GET /api/profesionales`, sus validaciones y `ResponsableNota.jsx`.

El endpoint requiere sesión vigente y al menos un permiso funcional de
registrar/transcribir/finalizar/emitir. El rol por sí solo y los permisos de solo
lectura no habilitan esta consulta. Devuelve únicamente cuentas y cargos activos
clasificados como `medico`, `enfermeria_ae` o `enfermeria_ep`. El filtro por tipo
es exacto; un director queda oculto para actores que no son director. La búsqueda
admite nombre/cargo, con paginación y validación de parámetros.

Las migraciones originales asignaron `sin_clasificar` como valor seguro a cargos
existentes; ni el texto Médico ni el rol infieren clasificación. La reproducción
HTTP sintética mantiene nombre y rol, cambia solo la clasificación de un cargo
médico y verifica 200 vacío con `sin_clasificar`, y profesional elegible al
clasificar explícitamente como `medico`. También comprueba AE/EP, cargo o cuenta
inactivos, búsqueda vacía, filtro inválido 400, falta de permiso 403 y ausencia
de sesión 401. No cambian las concesiones al reclasificar el cargo.

Esto demuestra el mecanismo de exclusión observado. La clasificación, cargo
asignado y permisos de las cuentas persistentes concretas no se consultaron;
atribuir todos los casos reales a una sola causa sería **No verificable**.
Un administrador autorizado debe revisar esos cargos en el catálogo y aprobar
explícitamente su clasificación. No se alteró ningún cargo o cuenta real.

## Corrección y arquitectura vigente

El único catálogo es **Catálogo de cargos**. El administrador autorizado puede
crear, editar, activar/desactivar y clasificar cada cargo. Valores:

| Ejemplo a verificar por el administrador | Clasificación |
| --- | --- |
| Médico/a | `medico` |
| Auxiliar de Enfermería | `enfermeria_ae` |
| Enfermera Profesional | `enfermeria_ep` |
| Digitador/a | `no_clinico` |
| Pendiente de evaluación | `sin_clasificar` |

Estas correspondencias no hacen backfill automático. Cargo y clasificación
describen la identidad profesional; rol y permisos controlan las acciones.
Clasificar no acredita colegiación, no cambia roles ni concede permisos.

El selector mantiene Yo atendí, Profesional del directorio y Profesional externo.
Presenta carga, resultado vacío, rechazo específico de permiso y error con
reintento. Solo muestra candidatos del tipo de nota; el servidor revalida
identidad y autorización en cada escritura. Una cuenta digitadora no obtiene
autoría clínica propia por poder capturar una nota de terceros. Los externos
declaran nombre, cargo y clasificación compatible, sin Especialidad.

## Retiro de Especialidades

Se retiraron el catálogo/API correspondientes, repositorio genérico de esa
entidad, validación, asignación/joins/columnas en respuestas de usuarios y
directorio, selector de altas/perfiles, campos externos, presentación en notas y
PDF, y comparación de seguimiento. `CatalogoCargos.jsx` sustituye el componente
genérico `CatalogosProfesionales.jsx`; la API frontend solo carga cargos.

Los contratos estrictos rechazan campos retirados. Los snapshots nuevos tienen
exactamente seis claves: `tipo`, `usuario_id`, `nombre_completo`, `cargo_id`,
`cargo_nombre`, `clasificacion_profesional`. Se conserva capturista, responsable
real, auditoría, versiones, idempotencia y finalización administrativa.

La auditoría de referencias distingue el SQL histórico de migraciones, pruebas
que verifican ausencia y documentos históricos marcados como sustituidos.
No se borra historial de Git ni se presenta la arquitectura antigua como vigente.
`docs/API.md` y `docs/BASE_DATOS.md` describen el contrato actual.

## Auditoría y decisión de migraciones

`main` local contiene migraciones hasta 022. Las 023–027 fueron introducidas en
la rama de funcionalidad mediante commits `055e873`, `9cd23ae`, `e75ebfd`,
`e61979c`, `6f15fef`. La documentación de fases 115–120 registra ejecuciones
temporales desechables. No existe evidencia suficiente para demostrar que nunca
se aplicaron manualmente en una base persistente; no se consultó ninguna.

Por ello **no se reescriben 023–027 ni sus checksums**. Se eligió un upgrade
correctivo compatible sobre la alternativa de modificar historial:

- `028_retirar_especialidades.sql`: elimina `usuarios.especialidad_id` con su
  índice/FK y la tabla retirada mediante RESTRICT, sin CASCADE. Una dependencia
  desconocida hace fallar y revertir la transacción.
- Sustituye la antigua restricción de snapshot por validación estricta al insertar
  o cambiar responsable. Los snapshots históricos intactos no se reescriben;
  pueden conservarse al editar contenido/finalizar borradores y siguen protegidos
  contra cambios tras finalización. Esta excepción preserva integridad histórica;
  no sostiene una funcionalidad operativa de especialidades.
- `029_usuarios_email.sql`: aditiva, normalización, formato, longitud y unicidad.

`schema.sql` representa el objetivo sin tabla/columna de Especialidades y con
email; el arranque exige 008–029 y sus checksums. Las pruebas cubren upgrade desde
027, bootstrap nuevo, repetición, dependencias desconocidas y preservación de
snapshot histórico. Ninguna de estas migraciones se ejecutó sobre una base
persistente. Antes de hacerlo se requieren inventario, respaldo y autorización
específica; el SQL correctivo no se debe aplicar a ciegas.

## Usuarios con correo

`usuarios.email VARCHAR(254)` acepta NULL exclusivamente para compatibilidad
legada. Un trigger recorta espacios y convierte a minúsculas; CHECK rechaza vacío
y formato inadecuado, e índice único `ux_usuarios_email` sobre `lower(email)`
resuelve también carreras de escritura. No se inventan direcciones.

POST `/api/usuarios` exige email válido en esquema y servicio. PUT admite
actualizar/completar email; omitirlo conserva el existente. NULL/vacío no retiran
un correo. Los legados sin email pueden editar otros campos sin bloqueo indebido.
Los duplicados devuelven 409 `EMAIL_DUPLICADO` con detalle del campo; los inválidos,
400. Login continúa por username/contraseña; no se modifican contraseñas.

Listado/detalle administrativo incluyen email y `email_pendiente`. La UI muestra
Correo pendiente y permite editar desde Perfil del usuario. El directorio clínico,
auth/me, login, snapshots y PDF no incluyen correo. Se preservan permisos
administrativos y protección del director. La auditoría registra únicamente
booleanos de modificación/pendiente, nunca la dirección completa.

### Regularización de cuentas anteriores

El administrador debe revisar las cuentas marcadas Correo pendiente, obtener
una dirección real y guardarla; no se listan identidades reales en este documento
ni en Jira. No se ejecutó un inventario de usuarios persistentes en esta fase.
La futura restricción NOT NULL exige comprobar primero que no queden NULL y
que todas las direcciones sean válidas/únicas, con respaldo y aprobación.
Asignar un correo no demuestra ni marca verificada su propiedad.

### Recuperación futura, todavía no implementada

Se documenta para una fase posterior: verificación de propiedad del correo,
tokens aleatorios seguros de un solo uso con vencimiento y almacenamiento de
hash, límite de solicitudes, respuestas uniformes contra enumeración,
invalidación de sesiones según política, e integración transaccional con Resend.
No hay nueva ruta de recuperación, credenciales Resend ni envío de correos;
nunca se deben enviar contraseñas. El correo administrativo permanece sin
verificación automática.

## Validación de esta entrega

Solo datos sintéticos. PostgreSQL 18.3 en clústeres creados con initdb y
comprobación de `data_directory`, puertos locales 55475–55480. Sin .env, destinos
de configuración ni bases clínicas persistentes. Los clústeres se detienen y
eliminan al terminar.

| Comprobación | Resultado |
| --- | --- |
| Backend completo `npm test` | 1.414 pruebas: 1.359 aprobadas, 0 fallos, 55 omitidas por ser integraciones opt-in |
| Frontend completo `npm test -- --maxWorkers=2` | 191 lógicas + 300 DOM aprobadas; 26 archivos DOM, 0 fallos |
| Frontend `npm run lint` y `npm run build` | Aprobados |
| Migración 027→029 y bootstrap repetido | 6/6 aprobadas |
| Catálogo de cargos PostgreSQL | 7/7 aprobadas |
| Perfiles/email/API y navegador administrativo | 14/14 aprobadas |
| Autoría clínica PostgreSQL | 15/15 aprobadas |
| Notas PostgreSQL, seguridad, concurrencia y PDF | 21/21 aprobadas |
| Seguimiento/control/cita, directorio HTTP, navegador CHECKPOINT-09/10 | 20/20 aprobadas, sin omisiones |
| PDF real multipágina médico y enfermería | 2/2 aprobadas; 9 páginas carta cada muestra |

La integración de migraciones prueba que una dependencia desconocida revierte
el retiro, preservación de snapshots históricos, rechazo de claves extra en
snapshots nuevos y carreras de unicidad de correo. Perfiles comprueba creación
con correo válido, ausencia/formato/duplicado, edición, cuenta legada, login,
protección director, permisos y privacidad de auditoría.

La integración de seguimiento comprueba controles/cita siguiente y tres notas
desde rutas directas, además de siete borradores desde la pestaña del expediente
con escritura real, ID, recarga, médico/AE/EP, propio/directorio/externo,
finalización/PDF, 401/403/404/409, y contextos sin embarazo/activo/cerrado/puerperio.
No se crean notas solo por navegar.

Las capturas están en `docs/cpren120/checkpoint10/`: Gestión de Usuarios,
Nuevo usuario, Perfil del usuario, Catálogo de cargos y clasificación, en
1440/390 y claro/oscuro (20 imágenes), más notas en 1440/1280/768/390/320 y ambos
temas (10 imágenes). Se corrigió el listado móvil a fichas legibles tras la
primera inspección: no se acepta como suficiente solo la ausencia de overflow.
`http-evidence.json` contiene método, ruta y estado; no tokens, cookies ni
narrativa. Las capturas de CHECKPOINT-09 permanecen intactas.

Las muestras sintéticas de `output/pdf/` se regeneraron con el renderer actual.
Se verificaron ambos PDFs mediante pypdf: nueve páginas 612×792, marcador final
presente y ausencia de Especialidad. Se renderizaron e inspeccionaron la primera
página médica y la última de enfermería con Poppler: logos proporcionales,
encabezado, acentos, párrafos extensos, texto sin espacios y pie legibles, sin
recortes.

Los intentos iniciales bajo aislamiento fallaron por permisos de initdb y
lecturas temporales ENOENT de Vite; se repitieron fuera de ese aislamiento con
los mismos destinos desechables. Una espera antigua de navegador exigía el
campo retirado y se corrigió a los dos campos actuales; la ejecución completa
posterior aprobó. La prueba DOM de foco de confirmación ahora espera el efecto
React antes de comprobar foco, coherente con el navegador real. No se presentan
esos primeros intentos como aprobados.

### Archivos principales

- Backend: repositorios/servicios/validaciones de cargos, usuarios y profesionales;
  autoría clínica, seguimiento y PDF; políticas de auditoría y error de unicidad.
- DB: schema.sql, schemaCompatibility.js y migraciones nuevas 028/029.
- Frontend: Usuarios, CatalogoCargos, PerfilProfesionalFields,
  ModalPerfilProfesional, ResponsableNota, EditorNotaClinica,
  SeguimientoNotasControl, CSS administrativo y utilidades de correo.
- Pruebas: suites de usuarios/email, perfiles, catálogo, autoría, migraciones,
  notas, seguimiento, PDF y helpers de navegador; documentación API/DB vigente.

### Estado Git

Rama de desarrollo indicada, HEAD permanece en
`b00ddf3e881abfa784e2262aceabaabef00bb465`. Hay archivos modificados, nuevos y
retiro del componente genérico reemplazado por CatalogoCargos. Ningún archivo
staged; **sin commit ni push**. `git diff --check` aprobado. Las migraciones
023–027 y originales de los logos tienen diff vacío. CHECKPOINT-09 se conserva
en el árbol, con los ajustes de eliminación de campos necesarios para esta fase.

## Riesgos y revisión pendiente

La reclasificación de cargos persistentes requiere aprobación administrativa;
la implementación no corrige silenciosamente datos. Sin aplicar 028/029 a una
instalación persistente, su backend actual no debe actualizarse aisladamente:
el control de compatibilidad exige el esquema coordinado.

Pendientes antes de integrar: revisión visual/funcional del propietario,
inventario de migraciones/respaldos y plan de actualización autorizado,
regularización de correos reales y confirmación de cargos. Firmas y CPREN-121
siguen fuera de alcance. Sin commit/push hasta autorización posterior.
