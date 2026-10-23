# CPREN-116 — Perfiles profesionales de usuarios

> Documento histórico de la fase original. CHECKPOINT-10 sustituye sus contratos de perfiles/directorio: la arquitectura vigente usa cargo y clasificación, sin Especialidades; las altas requieren email. Véase [arquitectura y contratos actuales](CPREN_120_CHECKPOINT_10_PROFESIONALES_USUARIOS.md). Se conserva el contenido original como evidencia histórica.

## Objetivo y dependencia

Integrar cargo laboral y especialidad opcional en la administración de usuarios,
conservar las reglas de acceso y ofrecer gestión visual de ambos catálogos.
Rol, cargo y especialidad son conceptos independientes; ningún cargo otorga
permisos ni acredita una especialidad.

Rama: `feature/cpren-116-perfiles-profesionales`.
Base exacta: `055e873338f1a363c78efa0030a40b4d813bf962`, rama CPREN-115.
Es una rama dependiente, no parte de main. CPREN-115 no está fusionada.
No se inicia CPREN-117, notas clínicas ni órdenes médicas.

## Migración 024

`backend/src/db/migrations/024_usuarios_perfiles_profesionales.sql` agrega:

| Campo de usuarios | Relación | Valor inicial |
| --- | --- | --- |
| cargo_id | FK a cargos_personal(id), ON DELETE RESTRICT | NULL |
| especialidad_id | FK a especialidades_personal(id), ON DELETE RESTRICT | NULL |

Ambos campos son INTEGER nullable, con índices `idx_usuarios_cargo` e
`idx_usuarios_especialidad`. No hay backfill, inferencias, cambios de roles ni
modificación de permisos existentes. 004–023 permanecen intactas.
El mismo bloque está al final de schema.sql, después de los catálogos.
schemaCompatibility.js exige 024 con su checksum. La migración es aditiva e
idempotente en el flujo oficial. Las FK impiden eliminar referencias históricas;
la API de catálogos sigue ofreciendo únicamente desactivación lógica.

No se ejecutó en bases persistentes ni producción. Requiere CPREN-115 y su
requisito de PostgreSQL UTF8 >= 13; pruebas ejecutadas con PostgreSQL 18.3.

## Contratos API

Se conservan `POST /api/usuarios`, `GET /api/usuarios` y `PUT /api/usuarios/:id`.
Se agrega `GET /api/usuarios/:id` con las mismas reglas de visibilidad.
Todas las rutas requieren autenticación y rol admin/director. Escrituras
mantienen CSRF. Admin no puede consultar ni modificar cuentas director.

POST conserva nombre_completo, username, password y rol obligatorios, y acepta:

```json
{
  "nombre_completo": "Usuario de ejemplo",
  "username": "usuario_ejemplo",
  "password": "valor-de-ejemplo",
  "rol": "personal_salud",
  "cargo_id": 1,
  "especialidad_id": null
}
```

Los dos IDs siguen siendo opcionales en POST para clientes anteriores. No
proporcionarlos crea referencias NULL. El formulario visual sí exige cargo.

PUT admite actualización parcial. Omitir un campo conserva su valor; NULL
borra explícitamente cargo o especialidad. Nombre y rol, antes requeridos en
PUT, ahora se pueden omitir. Contraseña vacía/NULL sigue significando no
reiniciarla. Perfil sin cambios de acceso:

```json
{ "cargo_id": 2, "especialidad_id": null }
```

El PUT mantiene respuesta `{ "message": "Usuario actualizado" }`; POST devuelve
el usuario y GET/listado incluyen:

```json
{
  "cargo_id": 2,
  "cargo_nombre": "Nombre del cargo",
  "cargo_activo": true,
  "especialidad_id": null,
  "especialidad_nombre": null,
  "especialidad_activa": null
}
```

IDs enteros positivos hasta 2147483647; acepta números o cadenas decimales sin
espacios, rechaza vacíos, booleanos, fracciones y negativos. IDs inexistentes
o nuevas asignaciones inactivas producen 400 PERFIL_PROFESIONAL_INVALIDO con
details de campo. Zod conserva 400 VALIDATION_ERROR para formatos inválidos.
Un usuario inexistente/no visible produce 404. Conflictos FK/únicos conservan
el manejo general de errores de API. Las consultas nunca devuelven password_hash.

Catálogos CPREN-115: se reutilizan todos sus endpoints. Se amplía únicamente
el listado con `buscar` opcional (hasta 150 caracteres), por nombre o código,
normalizado mediante la función SQL de CPREN-115. El filtro se aplica tanto a
data como a total antes de paginar. Signos `%` y `_` se buscan literalmente:
se usa strpos parametrizado, no interpolación ni comodines SQL.

## Decisiones técnicas y seguridad

- Se usan LEFT JOIN para nombres/estado en consulta y listado de usuarios, y
  CTE con RETURNING en creación/edición. Se evita una consulta por catálogo y
  por cada usuario. Las comprobaciones de historial existentes se conservan.
- Validar asignaciones solo en React permitiría evadir controles y competir con
  una desactivación. Por eso se comprueba existencia/activo en el servicio y se
  bloquea cada nueva referencia con FOR SHARE dentro de la transacción. Este
  bloqueo impide UPDATE de activo hasta confirmar la asignación; FOR KEY SHARE
  no bastaría. Si la desactivación confirma primero, la asignación se rechaza.
- Mantener la misma referencia histórica inactiva está permitido. No se ofrece
  como nueva opción para otros usuarios. NULL permite retirar una referencia.
- Las ediciones con campos profesionales bloquean la fila del usuario con
  FOR UPDATE, releen los campos de acceso y repiten las protecciones antes de
  escribir. Omitir rol/activo/nombre no sobrescribe cambios concurrentes con
  valores antiguos. Cambios simultáneos en el mismo campo se serializan: gana
  la última escritura confirmada; no se agrega versión optimista al usuario.
- Alta con campos profesionales: usuario, permisos iniciales por rol y auditoría
  comparten transacción; si falla cualquiera se revierte. El repositorio de
  permisos acepta la conexión transaccional opcional sin cambiar sus códigos
  por rol. El alta legacy sin campos profesionales conserva el flujo previo.
- Edición del perfil: auditoría privada obligatoria en la misma transacción.
  Registra cargo_id/especialidad_id anterior/nuevo con política numérica y evento
  `perfil_profesional_actualizado`, sin nombres de catálogos ni texto libre.
  La política general sigue descartando contraseñas, IP y user-agent.
- Cambiar solo perfil no reemplaza permisos, no cambia rol/estado/contraseña y
  no revoca sesiones. La revocación se ejecuta únicamente cuando hay causa real:
  contraseña reiniciada, desactivación o cambio de rol. Se evita una revocación
  con motivo vacío al reactivar. Se conserva el reemplazo por rol únicamente
  cuando el rol cambia, las cuentas director protegidas y el rechazo de borrado
  de usuarios con historial.

## Flujo visual

Desde Gestión de Usuarios:

1. Nuevo usuario: nombre, username, contraseña, rol del sistema, cargo requerido
   y especialidad opcional. Selectores consultan los catálogos activos de la API;
   recuperan todas las páginas de 100 registros. No hay profesiones codificadas
   en React. Fallo de carga bloquea guardado y ofrece reintento.
2. Listado: cargo y especialidad aparecen bajo el nombre, con indicador de
   inactividad y alternativa Sin cargo asignado para históricos. Conserva los
   filtros existentes, carga/error/reintento y tabla con scroll interno móvil.
3. Perfil: modal independiente para modificar exclusivamente las dos referencias;
   muestra el elemento inactivo previamente asignado y permite quitar especialidad.
   No envía rol, contraseña, permisos ni estado del usuario.
4. Catálogos profesionales: panel de cargos/especialidades con búsqueda global,
   filtro activo/inactivo/todos, paginación de 20 registros, alta y edición de
   nombre/código/descripción. Desactivación requiere confirmar y explica la
   conservación histórica; reactivación usa el endpoint existente.

Los componentes reutilizan colores, input-field, botones, tarjetas y toasts de
CAP. Modales comparten foco inicial/restaurado, Escape, recorrido Tab y bloqueo
durante guardado. Refs de petición impiden doble envío. Errores, incluidos
duplicados, conservan los datos ingresados y se muestran inline y/o por toast.
No hay eliminación física de catálogos. No se rediseñan otros módulos.

## Pruebas y verificación

Suites disponibles ejecutadas:

| Verificación | Resultado |
| --- | --- |
| Backend `npm test` | 1351 totales: 1300 aprobadas, 0 fallos, 51 omitidas |
| Frontend `npm test -- --maxWorkers=2`, lógica Node | 188 aprobadas, 0 fallos |
| Frontend DOM Vitest | 217 aprobadas en 22 archivos, 0 fallos |
| Frontend `npm run lint` | Sin errores |
| Frontend `npm run build` | Correcto |
| Regresión aislada CPREN-115 | 9 aprobadas, 0 fallos |
| CPREN-116 PostgreSQL + navegador real | 12 aprobadas, 0 fallos, 0 omisiones |

Tras el ajuste final del efecto de carga se repitieron las 31 pruebas DOM de
perfiles/usuarios/permisos: todas aprobadas. Lint y build finales también
aprobados. Revisión de capturas reales de listado en escritorio y perfil móvil.
Comprobación posterior: 0 directorios de clúster, 0 procesos PostgreSQL/initdb
de estas pruebas y 0 conexiones en 55475/55476. Las carpetas cpren116-ui-* solo
conservan capturas sintéticas y el directorio vacío de configuración de Vite.

Las 51 omisiones del backend son integraciones opt-in: las 50 documentadas en
CPREN-115 más la nueva raíz de perfiles. Las de catálogos y perfiles sí se
ejecutaron separadamente en clústeres desechables. No se habilitaron globalmente
pruebas que puedan usar el pool configurado o .env. Las otras 49 integraciones
históricas no se ejecutaron y no se presentan como aprobadas.

La integración CPREN-116 prueba migración sobre usuarios existentes, FKs,
idempotencia, bootstrap completo, autenticación y CSRF reales, admin/director,
alta legacy y con cargo, edición/quitar/omitir, opciones inactivas, protección de
historial, auditoría con rollback de usuario/permisos, preservación de sesiones
reales y bloqueo observable ante desactivación o edición concurrente.

La subprueba de Chrome abre el frontend real con Vite, su API y el PostgreSQL
temporal. Crea usuario, cargo y especialidad y edita el perfil; después verifica
el registro persistido en esa base. Captura escritorio 1440×1000 y ancho móvil
390×844, comprueba ausencia de overflow de página y errores JavaScript. Bloquea
peticiones externas y configura Vite con directorio .env vacío. Las capturas
son sintéticas y quedan en el temporal `cpren116-ui-*`, fuera del repositorio.

Reproducir desde backend con binarios PostgreSQL locales y Chrome de Puppeteer:

```powershell
$env:RUN_PERFILES_TEMP_POSTGRES = '1'
$env:PERFILES_POSTGRES_BIN = 'C:\Program Files\PostgreSQL\18\bin'
$env:RUN_PERFILES_BROWSER = '1'
node --test test/perfilesProfesionalesPostgres.test.js
```

El test crea y verifica data_directory de un clúster propio en 127.0.0.1:55476.
No acepta una URL ni una base existente. Frontend y backend deben tener sus
dependencias instaladas para la subprueba de navegador. Cierra Vite/Chrome,
termina PostgreSQL y elimina solo la carpeta del clúster generada.
CPREN-115 usa separadamente el puerto 55475 y su patrón establecido.
Se recomienda ejecutar la integración sin otras suites intensivas en paralelo:
un intento concurrente agotó los 30 segundos de initdb, se comprobó que no dejó
residuos y la ejecución aislada posterior aprobó las 12 pruebas.

## Inventario de archivos

- backend/src/controllers/usuariosController.js
- backend/src/db/migrations/024_usuarios_perfiles_profesionales.sql (nuevo)
- backend/src/db/schema.sql
- backend/src/db/schemaCompatibility.js
- backend/src/repositories/catalogosRepository.js
- backend/src/repositories/permisosRepository.js
- backend/src/repositories/usuariosRepository.js
- backend/src/routes/usuarios.js
- backend/src/services/audit/auditFieldPolicy.js
- backend/src/services/usuariosService.js
- backend/src/validations/catalogos.schemas.js
- backend/src/validations/usuarios.schemas.js
- backend/test/helpers/perfilesBrowser.js (nuevo)
- backend/test/perfilesProfesionales.test.js (nuevo)
- backend/test/perfilesProfesionalesPostgres.test.js (nuevo)
- backend/test/schemaCompatibility.test.js
- frontend/src/api/catalogos.js (nuevo)
- frontend/src/components/usuarios/AdminDialog.jsx (nuevo)
- frontend/src/components/usuarios/CatalogosProfesionales.jsx (nuevo)
- frontend/src/components/usuarios/ModalPerfilProfesional.jsx (nuevo)
- frontend/src/components/usuarios/PerfilProfesionalFields.jsx (nuevo)
- frontend/src/components/usuarios/profesionales.css (nuevo)
- frontend/src/pages/Usuarios.jsx
- frontend/test-dom/perfilesProfesionales.test.jsx (nuevo)
- docs/API.md
- docs/BASE_DATOS.md
- docs/CPREN_116_PERFILES_PROFESIONALES.md (nuevo)

## Registro de implementación para Jira, anterior a CHECKPOINT-02

Sesión 2026-10-22, equipo Trabajo, dispositivo Aiden29.
CPREN-116 es el issue existente indicado por el usuario; Epic esperado CPREN-3.
Jira no está disponible: getAccessibleAtlassianResources devolvió UNAVAILABLE,
Connection timed out. No fue posible confirmar Epic, pasar a En curso ni
actualizar el cierre. Estado propuesto: En revisión, pendiente de validación del
usuario y checkpoint. Este documento contiene contexto, decisiones, archivos,
resultados y pendientes listos para registrar. No se consultó Notion.
Resultados históricos ajenos a la evidencia de esta sesión: No verificable.

Se preservó CPREN-115 y main. No hay cambios en migraciones previas ni en
definiciones de roles/permisos por profesión. Sin datos reales ni secretos
nuevos. No hubo acceso a AWS, despliegue ni migraciones persistentes.
No se hizo commit, push, merge ni PR de CPREN-116. El trabajo permanece local.
Inventario final: 27 archivos, 15 modificados y 12 nuevos; sin staging.
`git diff --check` sin errores, índice vacío y main intacto en
`e07cef00f0a20931bf92e7f8f00eed2ae25d23e0`. La inspección de cambios y búsqueda
de patrones de claves/tokens no encontraron secretos nuevos ni archivos ajenos.

## Límites y siguiente checkpoint

Especialidades sigue sin semilla oficial; CAP debe confirmar sus nombres. Los
IDs históricos NULL se muestran explícitamente, sin asignarlos por profesión
supuesta. La búsqueda SQL usa substring normalizado y puede necesitar otro
índice si el catálogo crece mucho; no requiere extensión adicional.
Los avisos de Browserslist/caniuse-lite desactualizado no impidieron las pruebas
ni el build y no se actualizaron dependencias fuera del alcance.

## CHECKPOINT-02 — revisión y recuperación Trabajo → Casa

El usuario autoriza un único commit con mensaje
`feat(cpren-116): integrar perfiles profesionales de usuarios` y publicar solo
`feature/cpren-116-perfiles-profesionales`, sin reescribir CPREN-115, crear PR,
fusionar, desplegar ni iniciar CPREN-117.

Inspección inicial en Trabajo / Aiden29: rama correcta, HEAD en la base exacta
055e873338f1a363c78efa0030a40b4d813bf962, sin upstream aún y 27 archivos
(15 modificados, 12 nuevos) que coinciden exactamente con el inventario. Leídos
los diffs y los archivos nuevos; no se encontraron cambios ajenos, .env,
backups, claves privadas, tokens reales ni pacientes identificables. Las
identidades, contraseñas y sesiones de las pruebas son sintéticas.

023 y migraciones anteriores intactas. 024 es aditiva y coincide con su bloque
en schema.sql; el esquema previo sigue intacto al normalizar LF/CRLF y 024 está
en la lista requerida de schemaCompatibility. Revisadas autenticación, CSRF,
protecciones admin/director, bloqueo de asignaciones y auditoría privada.

Pruebas repetidas durante CHECKPOINT-02:

- Backend: 1300 aprobadas, 0 fallos y 51 omisiones esperadas.
- Frontend: 188 lógicas y 217 DOM aprobadas, sin fallos; lint y build correctos.
- Integración CPREN-116 con Chrome/API/PostgreSQL reales y temporales: 12
  aprobadas, sin omisiones; escritorio 1440×1000 y móvil 390×844.
- Regresión aislada CPREN-115: 9 aprobadas, sin omisiones.
- Limpieza posterior: 0 directorios de clústeres, 0 procesos PostgreSQL/initdb
  de esas pruebas y 0 conexiones en 55475/55476.
- `git diff --check`: sin errores; solo avisos habituales de conversión LF/CRLF.

Se cotejaron los 51 nombres omitidos del runner con sus gates RUN_* en 20
archivos, incluidos los nombres generados por bucles. Son 13 casos de
citasInasistenciasPostgres, 16 de migrateSafePostgres, 3 de
pacienteEmbarazoPostgres, 2 de migrateBootstrapPostgres, 2 de sessionActivityPostgres
y 15 raíces individuales. No se añadieron gates ni omisiones a pruebas existentes
en este cambio. Los gates nuevos pertenecen exclusivamente al clúster de perfiles
y su navegador opcional. Las raíces CPREN-115/116 omitidas en npm test se
habilitaron por separado y pasaron; las otras 49 integraciones históricas siguen
sin ejecutar. No se habilitaron suites contra bases persistentes o .env.

Remoto inspeccionado antes del commit: CPREN-116 no existía; CPREN-115 estaba
en 055e873338f1a363c78efa0030a40b4d813bf962 y main local/remoto en
e07cef00f0a20931bf92e7f8f00eed2ae25d23e0. Este documento se incluye en el propio
commit y no contiene un SHA autorreferente; el resultado de commit/push y la
coincidencia local/remota se confirman en la entrega de CHECKPOINT-02.

Jira: getAccessibleAtlassianResources pudo listar el sitio, pero getJiraIssue de
CPREN-116 terminó con MCP request timed out. Epic/estado no verificados ni
actualizados. Pendiente incorporar este registro y el SHA publicado en CPREN-116,
verificar CPREN-3 y dejar En revisión; no se usó Notion como alternativa.

### Recuperar en casa

Desde el repositorio existente, comprobar primero:

```powershell
git status --short --branch
```

Si hay cambios locales, preservarlos y detener el cambio de rama. Con el árbol
limpio y la publicación del checkpoint confirmada:

```powershell
git fetch origin
git switch --track origin/feature/cpren-116-perfiles-profesionales
git branch --show-current
git log -1 --format=fuller
git rev-parse HEAD
git rev-parse origin/feature/cpren-116-perfiles-profesionales
git merge-base --is-ancestor 055e873338f1a363c78efa0030a40b4d813bf962 HEAD
git status --short --branch
```

Los dos SHA deben coincidir con la entrega del checkpoint y merge-base debe
terminar con código 0, confirmando que conserva CPREN-115. Si la rama local ya
existe, sustituir git switch --track por:

```powershell
git switch feature/cpren-116-perfiles-profesionales
git pull --ff-only origin feature/cpren-116-perfiles-profesionales
```

No forzar si hay divergencias ni ejecutar migraciones antes de verificar una
base local aislada. No se necesita AWS para recuperar o revisar esta rama.
CPREN-117 permanece sin comenzar.
