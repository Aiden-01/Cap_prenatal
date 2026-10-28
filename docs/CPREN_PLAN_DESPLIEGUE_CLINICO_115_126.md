# Plan coordinado del módulo clínico CPREN-115–120 y CPREN-126

**Plan para revisión; no ejecutado en AWS.** 2026-10-25, Casa / HP Victus.
CPREN-120/126 permanecen En revisión. CHECKPOINT-14 queda local, sin commit/push,
PR ni merge. Este documento no constituye una autorización de despliegue.

## 1. Referencias y evidencia disponible

Tras pull fast-forward y fetch, rama clínica
`feature/cpren-120-editor-pdf-notas-clinicas`, HEAD/origin
`0f341d78d9fcfa6bb8178cd1a36bec141adf7b5e`; `origin/main` y main local
`d5fae677fa462af9ca5b7174a46d3ebf21e12196`. Main es ancestro de la rama clínica;
hay nueve commits acumulados, incluido el merge previo de main en CPREN-119.
No se realizó ninguna integración adicional ni se modificó main.

El [inventario completo](cpren120/checkpoint14/deployment-inventory.json) contiene
las 399 rutas con estado respecto a main, los commits, hashes de migraciones y
los cambios locales 14 separados. El SHA anterior no incluye CHECKPOINT-14:
su revisión, commit/push e integración requieren autorización posterior.

| Diferencias ya publicadas frente a main | Nuevos | Modificados |
| --- | ---: | ---: |
| Backend, sin migraciones | 51 | 22 |
| Migraciones | 8 | 0 |
| Frontend | 23 | 8 |
| Documentación y evidencia | 283 | 2 |
| PDF sintéticos históricos en output | 2 | 0 |
| Total | 367 | 32 |

No hay eliminaciones en este inventario. Los cuatro archivos existentes cambiados
en 14 son generador y tres pruebas; se añaden herramientas, ensayo PostgreSQL,
documentación y evidencia. No hay modificaciones de frontend ni SQL histórico en 14.

No cambian `package.json`/lockfiles de backend o frontend, plantillas `.env.example`,
variables nuevas, dependencias runtime, scripts de despliegue, operations, .github
ni n8n respecto a main. La plantilla de notas reutiliza pdf-lib/Puppeteer ya
declarados y el gestor de Chrome existente. No se copiaron ni registraron archivos `.env` reales.
El entorno de producción debe comprobar sus configuraciones vigentes sin copiarlas
a Git/Jira. En un directorio de release nuevo se instalarán los lockfiles aprobados
con el procedimiento reproducible existente; no se actualizarán versiones al desplegar.

**Límite de la evidencia:** no se accedió a AWS. SHA servido, schema_migrations,
versiones, nombres de unidades systemd, rutas Nginx y estado del respaldo real son
**No verificable** en esta ejecución. La referencia de main no prueba que AWS la
esté sirviendo. El ensayo local usa su schema/migraciones 001–022 y datos inventados;
no es una copia ni una restauración de la base de producción.

## 2. Funcionalidades, dependencias y usuarios afectados

| Issue | Resultado acumulado y dependencia | Situación de gestión consultada |
| --- | --- | --- |
| CPREN-115 | Catálogo activo únicamente de cargos; nombres/códigos únicos normalizados. Base de perfiles | Tareas por hacer; conciliar con código existente |
| CPREN-116 | Cargo opcional del usuario, sin inferir profesión del rol. Directorio y gestión administrativa | Tareas por hacer; conciliar con código existente |
| CPREN-117 | Permisos funcionales separados de autoría, responsables elegibles MED/AE/EP y snapshots | En revisión |
| CPREN-118 | API de notas, pertenencia paciente/embarazo/control, borrador/finalización, versión e idempotencia | En revisión |
| CPREN-119 | Seguimiento desde controles nuevos; confirmaciones por tipo inmutables, sin activar controles históricos | En revisión |
| CPREN-120 | Editor/historial compartido, recuperación de borrador y PDF institucional; 14 limita firma a última hoja | En revisión |
| CPREN-126 | Correo obligatorio al crear, legado NULL pendiente; edición de nombre/username, auditoría y sesiones | En revisión |

Orden funcional: cargos → perfiles → permisos/autoría → notas → seguimiento →
editor/PDF; CPREN-126 se integra con la misma versión de usuarios y esquema. Se
recomienda revisar e integrar **un resultado clínico coherente**, conservando su
historia, en lugar de publicar interfaces intermedias que todavía usaban campos
retirados. El mecanismo de integración se elegirá y autorizará después; aquí no
se hace merge, PR, rebase, squash ni force push.

El modelo final usa códigos clínicos **MED, AE y EP**; otros cargos administrativos
siguen admitidos pero no acreditan autoría clínica. El nombre del cargo, su ID,
el rol admin/director o tener un permiso funcional no convierten a alguien en
profesional elegible. La elegibilidad exige cuenta/cargo activos y código válido;
el permiso permite la operación y se verifica independientemente. Los diez permisos
clínicos de notas/órdenes no se conceden por defecto ni por seed automático.
`catalogos_profesionales.gestionar` es una capacidad administrativa separada.
Los permisos de órdenes no significan que esta entrega implemente CPREN-121.

La búsqueda de referencias activas a Especialidades/clasificación encontró solo
el nombre de la migración requerida en schemaCompatibility y lectura de un snapshot
legado para reintento idempotente en seguimiento. No hay formulario, endpoint,
columna activa ni nueva escritura de esa clasificación. SQL histórico y snapshots
mantienen términos anteriores para preservar checksums e historia; no deben borrarse
por coincidencias de texto. La instalación limpia y el upgrade verificaron la
ausencia de la tabla Especialidades y de las columnas retiradas.

Efectos a explicar a usuarios: nuevas cuentas requieren correo válido y único;
las antiguas sin dirección siguen accesibles y muestran regularización pendiente.
Cambiar username revoca sesiones y exige reautenticarse con el nuevo identificador;
cambiar solo nombre no las revoca. IDs, claves y snapshots anteriores se conservan.
Quien no tenga cargo/código o permisos aprobados no verá/registrará notas por asumir
que su rol basta. Captura finalizada es administrativa; el PDF no crea un estado
Firmado. La firma manuscrita se reserva solo en la última hoja según la decisión
del propietario; falta revisión institucional final del resultado completo.

### Superficie HTTP a validar

- `/api/catalogos/cargos`: GET/POST; `/:id`: GET/PUT;
  `/:id/desactivar` y `/:id/reactivar`: PATCH. Escritura administrativa y permiso.
- `/api/profesionales`: GET con permiso funcional de directorio, mínima proyección.
- `/api/usuarios` y `/:id`: altas/listado/perfil/edición, correo e identidad.
- `/api/pacientes/:pacienteId/notas-clinicas`: GET/POST; `/:notaId`: GET/PUT;
  `/:notaId/finalizar`: POST; `/:notaId/pdf`: GET con autorización por tipo,
  pertenencia, no-store, cuota y auditoría obligatoria.
- `/api/pacientes/:pacienteId/controles/seguimiento-notas`: GET;
  `/controles/:id/seguimiento-notas`: POST.

Los verbos y rutas están enumerados también en el inventario. No se publicarán
endpoints alternativos de Especialidades. `/api/health` comprueba el proceso;
no sustituye compatibilidad SQL, acceso autenticado ni las pruebas del PDF.

## 3. Migraciones: aplicar únicamente mediante el migrador aprobado

Orden numérico estricto, después de verificar el registro y checksums 001–022:

| Nº | Archivo / efecto | Comprobación y compatibilidad |
| --- | --- | --- |
| 023 | `023_catalogos_profesionales.sql`: cargos y Especialidades intermedias, claves normalizadas | Nombres/códigos únicos; semillas nuevas AE/EP, Médico/a sin MED. No asigna cargo a personas |
| 024 | `024_usuarios_perfiles_profesionales.sql`: FKs opcionales | Cuentas existentes conservan cargo NULL, roles y contraseñas |
| 025 | `025_permisos_autoria_clinica.sql`: capacidades y clasificación intermedia | Catálogo de permisos; solo concesión administrativa de gestión a admin/director, ninguna clínica automática |
| 026 | `026_notas_clinicas.sql`: notas, snapshots, restricciones y triggers | Contexto consistente, límite 20 000, versión y finalización; tablas previas intactas |
| 027 | `027_seguimiento_notas_controles.sql`: seguimiento y decisiones por tipo | Trigger para INSERT de nuevos controles; sin backfill de históricos |
| 028 | `028_retirar_especialidades.sql`: elimina tabla/columna y cambia validación snapshot | RESTRICT ante dependencia desconocida; incompatible con versiones intermedias que consultan Especialidades; snapshots no reescritos |
| 029 | `029_usuarios_email.sql`: email NULL permitido en legado, normalización/índice/check | Múltiples NULL admitidos; obligatoriedad de altas en API; sin direcciones inventadas |
| 030 | `030_cargos_autoria_estable.sql`: elimina clasificación activa y valida código en snapshots nuevos | Rechaza códigos contradictorios/duplicados; incompatible con código intermedio que lee/escribe clasificación; no infiere MED |

No editar los ocho SQL ni otros históricos. El migrador serializa ejecuciones,
verifica checksums y usa una transacción **por migración**; la cadena completa
no es una sola transacción. Varios DDL fijan lock_timeout=5s: una contención
significa detenerse, mantener mantenimiento y revisar, no eliminar el límite.
No lanzar varios migradores ni arrancar nuevos procesos de la app durante el cambio.

Preflight futuro: inventariar versiones y registro SQL sin exportar datos
identificables; comprobar FKs/dependencias desconocidas de Especialidades, códigos
clínicos/normalizados duplicados o contradictorios, campos/índices existentes,
columnas y triggers, permisos previos y sesiones. Si el estado es parcial o los
checksums no coinciden, detenerse y analizar; no borrar schema_migrations ni
marcar archivos como aplicados. Si ya hay filas clínicas de una versión intermedia,
ensayar ese estado concreto, además del escenario 022 local.

No asignar códigos MED/AE/EP a cargos reales por nombre ni mapear cuentas durante
el despliegue. Las semillas históricas no acreditan personas: el CAP debe aprobar
el catálogo y la asignación administrativa explícita. No usar `db:seed`, seeds
demo ni scripts de otorgamiento masivo de permisos. Registrar decisiones sin
nombres/identidades clínicas en Jira.

Los snapshots legados se conservan. La restricción `requerimiento_snapshot_cargo`
de 030 usa NOT VALID para no reescribir decisiones antiguas y exige el contrato
nuevo en escrituras nuevas; no ejecutar una validación masiva ni un backfill para
eliminar esos antecedentes sin una decisión específica.

### Ensayos realizados y prueba que falta

PostgreSQL 18.3 desechable: upgrade desde schema Git main 022, instalación limpia,
segunda ejecución, backup/restore antes y después, conservación exacta de filas
de roles, cuentas, sesiones, pacientes, embarazos, controles y citas; sin permisos
clínicos nuevos y sin códigos inferidos. La prueba 027→030 cubre snapshots históricos,
dependencias RESTRICT, duplicados/contradicciones y rollback por archivo. Las suites
de perfiles, autoría, notas y seguimiento verifican API, restricciones y auditoría.
Resultados: [migration-readiness.json](cpren120/checkpoint14/migration-readiness.json)
y [test-results.json](cpren120/checkpoint14/test-results.json).

Antes de producción falta un ensayo con el **estado realmente desplegado** y,
si se autoriza manejarlo, un respaldo real bajo custodia privada restaurado en un
entorno aislado, sin salida de correos/automatizaciones y con controles de acceso.
Puede prepararse primero un equivalente anonimizado de estructura/condiciones;
no sustituye verificar que el respaldo real sea restaurable. Ningún respaldo ni
contenido clínico se sube a Git/Jira.

## 4. Secuencia futura para producción nativa

Arquitectura indicada por el propietario: Nginx sirve React/Vite `frontend/dist`,
Express/Node y PostgreSQL nativos, n8n bajo systemd. **No Docker ni Compose.**
La guía [CPREN-125](CPREN_125_HOTFIX_UX.md) documenta el antecedente de intercambio
atómico `renameat2(RENAME_EXCHANGE)` y root `/home/ubuntu/cap_prenatal/frontend/dist`.
Es un antecedente, no verificación actual de rutas, servicios o SHAs. Revalidarlo.

1. **Aprobar el candidato.** Revisar muestras 14, criterios institucionales y
   conciliación de CPREN-115/116. Autorizar por separado commit/push e integración,
   registrar el SHA integrado exacto y revisar su diff contra main actualizado.
   Repetir checks pertinentes si cambió el candidato. Obtener autorización expresa
   de despliegue, ventana, responsables y decisión de recuperación/RPO.
2. **Preflight autorizado, aún sin corte.** Verificar Git limpio, SHA servido,
   schema_migrations, versiones PostgreSQL/Node/npm/Chrome, unidades y usuarios de
   servicio, root Nginx, permisos, espacio, DNS/TLS y salud. No mostrar secretos.
   Identificar quién escribe en tablas afectadas, incluidas tareas existentes.
   Preparar el control de acceso/mantenimiento solo de la app sin romper webhooks,
   backups ni n8n. Si no se pueden controlar las escrituras relevantes, no cortar.
3. **Preparar artefactos separados.** Backend del SHA aprobado con lockfile y
   configuración privada vigente; no sobrescribir .env ni construir en el root
   servido. Frontend con NODE_ENV=production en un directorio release del mismo
   filesystem. Verificar index, assets, hashes y permisos Nginx. Retener assets con
   hash de la versión anterior sin sobrescribir nuevos, para clientes con HTML viejo.
   Probar Chrome bajo el usuario real del servicio, librerías/fonts/temporales,
   tiempos/cuota y las cinco muestras en Linux. No desactivar protecciones del
   navegador como solución improvisada. No instalar/actualizar dependencias al azar.
4. **Respaldar y ensayar restauración.** Antes de cambiar SQL, guardar dump lógico
   consistente en formato restaurable, roles/grants/configuración necesarios y
   metadatos/versiones; comprobar hash, tamaño, permisos y listado del dump. Restituir
   a un destino aislado autorizado y validar schema, conteos e integridad. Un hash
   por sí solo no demuestra restaurabilidad. Resguardar frontend/dist y backend
   previos con manifiestos, lockfiles y configuración privada. Conservarlos fuera
   de Git y de directorios públicos. Si la prueba falla, cancelar la ventana.
5. **Entrar en mantenimiento controlado.** Bloquear nuevas escrituras de usuarios,
   drenar solicitudes y detener únicamente la unidad Express confirmada. Comprobar
   que no quedan sesiones/transacciones de app escribiendo las tablas objetivo.
   Evitar solapar jobs existentes; no modificar ni reiniciar n8n. Si un escritor
   externo puede interferir y no está coordinado, posponer. Hacer el respaldo final
   tras estabilizar las escrituras y registrar el instante de corte y cualquier
   escritura posterior; el ensayo previo de restauración no reemplaza verificar
   el dump final del corte.
6. **Migrar con el candidato aprobado.** Ejecutar una sola vez el comando existente
   `npm run db:migrate` desde el backend del release, con credenciales del destino
   autorizado y en la ventana. Revisar resultado y registro por archivo 023→030,
   checksums, esquema final y comparaciones de conteos/relaciones. No ejecutar este
   comando ahora. Ante fallo parcial, mantener mantenimiento y usar la sección 5.
7. **Activar backend y frontend coordinados.** Poner el backend compatible con 030,
   reiniciar solo su unidad Node y verificar inicio/compatibilidad SQL. Intercambiar
   atómicamente dist con el release verificado, conservando el anterior. Comprobar
   soporte de renameat2 y rutas absolutas antes del intercambio; si no existe,
   revisar otro mecanismo antes de la ventana. No improvisar dos renombrados que
   dejen ausente el root. Nginx solo se recarga si su configuración cambió y pasa
   `nginx -t`; PostgreSQL y n8n no requieren reinicio para esta entrega.
8. **Smoke con acceso restringido.** Validar la matriz siguiente con cuentas y
   expedientes sintéticos expresamente autorizados. Confirmar SHA/artefactos
   efectivos; health, login y una consulta autenticada que use SQL; generar PDF.
   No abrir tráfico general por un health 200 aislado. La regularización de cargos
   y concesiones debe ser explícita y revisada, sin modificar perfiles reales en
   una prueba. Si falla un criterio crítico, mantener el corte.
9. **Reabrir y observar.** Confirmar criterios de aceptación, informar al responsable,
   retirar mantenimiento de la app y seguir errores 5xx, rechazos de permisos,
   conflictos/versiones, latencia de API/PDF, sesiones, locks y respaldos. Verificar
   continuidad de n8n sin cambios. Definir responsables y duración de observación
   antes de la ventana; conservar artefactos y evidencia hasta cerrar la liberación.

## 5. Recuperación: archivos y SQL son decisiones distintas

| Momento | Estrategia segura |
| --- | --- |
| Antes de cualquier SQL | Mantener mantenimiento si comenzó; restaurar artefactos previos verificados y comprobar salud. La base no cambió |
| Fallo a mitad de la cadena | La migración fallida revierte su transacción, las anteriores pueden estar aplicadas. Inventariar registro/esquema y preferir corrección hacia adelante aprobada; no arrancar código incompatible |
| SQL completo, sin nuevas escrituras confirmadas | Preferir backend compatible con 030 y corrección de aplicación. Una restauración del respaldo exige autorización explícita, prueba aislada y demostrar ausencia de escrituras desde el corte |
| Hubo escrituras después del respaldo | No restaurar encima de producción. Preservar estado actual, aislar copia, evaluar delta y reconciliación/RPO con responsables. Preferir reparación hacia adelante; cualquier pérdida requiere decisión expresa |

No hay migraciones down aprobadas. Un git revert, checkout, intercambio de dist o
rollback de archivos **no deshace 028/030 ni restaura columnas/datos eliminados**.
Los backends intermedios con Especialidades o clasificación son incompatibles con
el esquema final. El main anterior 022 tampoco es un rollback clínico validado:
carece de endpoints y reglas nuevas de correo/autoría, aunque parte del esquema
core siga siendo legible. No asumir compatibilidad por poder arrancarlo.

Una versión clínica ya verificada con 030, como el código 13B, tiene el mismo
contrato SQL que 14; su firma se repetiría por hoja, por lo que revertir ese
comportamiento también requiere evaluar la política clínica y autorización.
No se adopta como fallback productivo sin ensayar sus funciones y el estado real.

Si se autoriza restaurar, hacerlo primero en una base/instancia aislada, comprobar
integridad y decidir el cambio controlado del destino conservando la base actual.
Documentar escrituras posteriores, horas, SHA y decisión humana. No copiar dumps,
secretos ni registros de personas a Jira; registrar solo metadatos seguros. No
alterar migraciones históricas ni eliminar el registro para simular un rollback.

## 6. Matriz de validación previa a abrir tráfico

Usar primero staging aislado. En producción, solo cuentas y expedientes sintéticos
aprobados y reconocibles, sin seleccionar pacientes reales; no conceder privilegios
a usuarios reales como parte del smoke. Para autoría positiva, usar un cargo ya
aprobado por el CAP, sin crear un MED/AE/EP duplicado ni reclasificar cargos reales.
Conservar IDs de prueba de forma privada y acordar su manejo posterior sin limpieza
destructiva de notas finalizadas. No habilitar n8n ni enviar notificaciones reales
desde el entorno aislado.

| Área | Criterio de aceptación |
| --- | --- |
| Login legado | Misma cuenta/contraseña; sesión válida, email NULL permitido y pendiente visible |
| Alta/edición usuarios | Correo requerido en alta, normalizado/único; admin/director protegidos; nombre conserva ID; username nuevo revoca y permite re-login |
| Cargos/directorio | Sin Especialidades/clasificación en UI/API; códigos estables; inactivos y cuentas sin código no elegibles; rol separado |
| Permisos | Médico y AE/EP con concesión explícita; sin concesión 403; registrar no implica leer/finalizar/firmar; no se emiten órdenes CPREN-121 |
| Controles y seguimiento | Registro sintético, pertenencia por embarazo, ausencia de backfill histórico, confirmación por tipo y reintento sin sustitución |
| Notas | Crear/recuperar borrador, recargar, conflicto 409 preserva texto; finalizar captura exige mínimos y versión; snapshot histórico intacto |
| PDF | Cinco casos 14; carta, texto íntegro, fecha/hora, identificación/numeración cada hoja, FIN DE NOTA y firma solo en última, sin leyendas retiradas |
| Citas/calendario | Cita sintética creada/reprogramada según flujo; fecha civil/embarazo correctos y sin duplicaciones; históricos iguales |
| Reportes | Consulta y exportación sintéticas con permisos y tiempos normales; sin pérdida de otros formatos |
| Expedientes previos | Conteos, FKs, huellas/agregados y muestras de lectura autorizadas; no editar datos reales para probar |
| Backups/n8n | Respaldo posterior válido y monitoreo vigente; servicios/jobs/webhooks conservan su configuración y funcionamiento |

Definir éxito/fallo y registrar metadatos de cada paso. No usar logs con contenido
clínico para evidencias públicas. Los test locales de CHECKPOINT-14 no sustituyen
esta validación del release ni el ensayo físico/institucional de impresión.

## 7. Riesgos, bloqueadores y condiciones de autorización

| Clasificación | Hallazgo / requisito | Acción antes de avanzar |
| --- | --- | --- |
| Bloqueante para despliegue | 14 local, sin revisión final ni SHA integrado/publicado | Revisar propietario; autorizar commit/push e integración por separado |
| Bloqueante para despliegue | Estado real AWS, versión SQL y escritores desconocidos | Autorizar preflight específico y resolver diferencias; no asumir main=producción |
| Bloqueante para despliegue | Respaldo real y restauración aislada no comprobados aquí | Verificar custodia, restauración, corte y recuperación con datos posteriores |
| Bloqueante para despliegue | Códigos, permisos y aceptación institucional no regularizados | CAP aprueba asignaciones explícitas y política de uso/impresión; sin inferencias |
| Bloqueante para despliegue | Falta ensayo del candidato en Linux con Chrome/usuario de servicio y entorno equivalente real | Ejecutar pruebas de formato, servicios y cadena SQL en staging autorizado |
| Corregible antes de producción | CPREN-115/116 siguen Tareas por hacer pese a código presente | Conciliar alcance final e historial en Jira sin duplicar issues ni declarar cierre sin revisión |
| Corregible antes de producción | Ventana, unidades/rutas, mantenimiento y recuperación sin aprobación operativa | Completar runbook con valores verificados, responsables y autorización |
| Mejora posterior no bloqueante | Aviso de Browserslist y amplitud de pruebas UI sobre dispositivos físicos | Programar mantenimiento separado; no actualizar dependencias en esta liberación |

No se encontró un fallo funcional local abierto de firma, SQL o regresiones en
las selecciones finales. Se puede iniciar una **preparación real autorizada**
(revisión y preflight) una vez acordado su alcance; eso no permite ejecutar
migraciones o desplegar. Para autorizar producción deben estar resueltos todos
los bloqueantes, revisado el runbook con SHAs/rutas/servicios reales, aprobado el
respaldo/recuperación y superado el smoke del candidato coherente. Mantener
CPREN-120/126 En revisión hasta la validación que corresponda.

Fuentes locales principales: `backend/src/db/migrations/023…030`, migrador y
schemaCompatibility; rutas/servicios/seguridad de notas, usuarios y profesionales;
[CHECKPOINT-14](CPREN_120_CHECKPOINT_14_FIRMA_ULTIMA_HOJA.md), inventario y resultados
enlazados, y procedimiento nativo documentado de CPREN-125. No se consultó Notion,
no se accedió a AWS, no se modificó n8n ni se inició CPREN-121.
