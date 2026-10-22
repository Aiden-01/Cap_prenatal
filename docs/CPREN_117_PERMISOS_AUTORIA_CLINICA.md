# CPREN-117 — Permisos clínicos y autoría profesional

## Alcance y decisiones confirmadas el 22/10/2026

Implementación local desde `9cd23aed8bf07ad47c97c72b997b2612d1cdd176`, rama
`feature/cpren-117-permisos-autoria-clinica`. Depende de CPREN-115 y CPREN-116,
todavía sin fusionar a main. Sesión en Trabajo, dispositivo Aiden29 / CAP El Chal.

Las decisiones expresas del CAP prevalecen sobre propuestas anteriores:

- Nota de evolución: responsable médico. Nota de evolución de enfermería:
  responsable AE o EP. Compartirán formulario narrativo, con título y
  clasificación distintos; podrán vincularse a controles o existir por consulta.
- Órdenes médicas: redacción libre cuando el médico lo requiera, sin vínculo
  obligatorio a control ni consulta.
- Los tres documentos imprimirán solo el nombre del responsable y espacio para
  su firma manuscrita, sin firma de paciente ni secundaria. No se generan firmas.
- El capturista digital y quien finaliza pueden ser distintos del responsable.
  Finalizar captura es un cierre administrativo, sin firma, validación clínica
  ni emisión de una prescripción.

Esta fase prepara permisos, política reutilizable y directorio. No crea tablas,
formularios, endpoints de escritura ni PDF de notas/órdenes. No inicia CPREN-118.

## Matriz de permisos

| Grupo | Consultar | Capturar | Finalizar administrativamente | Emitir |
| --- | --- | --- | --- | --- |
| Evolución médica | `notas_evolucion.ver` | `notas_evolucion.registrar` | `notas_evolucion.finalizar_captura` | No aplica |
| Enfermería | `notas_enfermeria.ver` | `notas_enfermeria.registrar` | `notas_enfermeria.finalizar_captura` | No aplica |
| Órdenes | `ordenes_medicas.ver` | `ordenes_medicas.transcribir` | `ordenes_medicas.finalizar_captura` | `ordenes_medicas.emitir` |

Los diez son restrictivos por defecto para TODOS los roles, incluido director.
El rol de acceso, cargo, especialidad y permiso funcional son independientes.
`catalogos_profesionales.gestionar` conserva la capacidad administrativa previa:
la migración lo agrega a admin/director existentes y los valores iniciales lo
incluyen para altas o cambios a esos roles. Es insuficiente sin rol admin/director.

Solo el director conserva la administración de permisos por la API existente.
Puede conceder los códigos clínicos explícitamente a cuentas que los necesiten;
ninguna concesión acredita profesión. El permiso emitir en una cuenta no médica
sigue siendo insuficiente para autorizar la emisión en la política del servidor.
No se cambian reglas de VIH, pacientes, controles, reportes o auditoría.

## Concesiones automáticas y cambios de rol

La arquitectura previa usa `director: null` para representar todos los permisos
del catálogo. Se conserva esa interfaz interna, pero todas las expansiones
automáticas excluyen los namespaces `notas_evolucion.`, `notas_enfermeria.` y
`ordenes_medicas.`, incluidos futuros códigos bajo esos prefijos:

- `permisosRepository.asignarPermisosIniciales` y `reemplazarPermisosPorRol`.
- Cambio de rol transaccional en `usuariosService`.
- Bootstrap de permisos de `seed.js`, también revisado para evitar una concesión
  clínica inadvertida al ejecutar una semilla futura.

La 025 no altera concesiones previas salvo añadir gestión administrativa de
catálogos. Un cambio posterior de rol mantiene la política existente de
reemplazar el conjunto de permisos por los valores iniciales del nuevo rol:
retira concesiones clínicas explícitas, que requerirán nueva decisión del
director. Continúan auditoría privada obligatoria y revocación transaccional de
sesiones por cambios de rol/permisos. No se ejecutó seed en una base persistente.

## Clasificación profesional controlada

La migración 025 añade a `cargos_personal`:

```text
clasificacion_profesional TEXT NOT NULL DEFAULT 'sin_clasificar'
CHECK: sin_clasificar | medico | enfermeria_ae | enfermeria_ep | no_clinico
```

No se deduce clasificación de nombres editables, códigos o IDs fijos. TODOS los
cargos anteriores comienzan sin clasificar; el directorio no los ofrece como
responsables hasta que se clasifiquen explícitamente. Renombrar un cargo no
cambia su clasificación. No se crea un campo en especialidades ni roles.

Admin/director con `catalogos_profesionales.gestionar` administran la
clasificación mediante POST/PUT de cargos existentes. Campo omitido: conserva
clasificación en edición; alta: sin clasificar. Valores fuera del enum y campo
en especialidades: 400. El estado conserva la desactivación lógica existente.

Se audita el enum anterior/nuevo dentro de la misma transacción obligatoria.
Nombres y descripciones libres conservan sus marcadores privados, sin revelar
texto. Un fallo de auditoría revierte el cambio. Clasificar o asignar un cargo
no otorga permisos, colegiación ni habilitación legal. Es una declaración
administrativa de coherencia; CAP debe comprobar la idoneidad de las personas.

Observación de diseño revisada en CHECKPOINT-03: el nombre visible «No clínico»
puede resultar ambiguo para profesionales sanitarios que no sean médico/AE/EP.
En esta política, `no_clinico` queda excluido de la autoría de estos tres tipos
de documento; no determina si la persona es sanitaria ni su cualificación.
No asignarlo automáticamente a otras profesiones. La clasificación efectiva de
los ocho cargos iniciales y de los demás cargos se hará después de validación
con el CAP; mientras tanto permanecen `sin_clasificar`. El checkpoint conserva
el enum existente, sin ampliar ni reinterpretar atribuciones profesionales.

## Política reutilizable de identidades

`autoriaClinicaService.prepararAutoriaClinica` recibe:

```js
{
  tipoDocumento: 'nota_evolucion' | 'nota_enfermeria' | 'orden_medica',
  accion: 'registrar' | 'transcribir' | 'finalizar_captura' | 'emitir',
  responsable, // solo captura o emisión; prohibido al finalizar
  req, // contexto de autenticación del servidor
  db   // conexión de la transacción del futuro documento, opcional para preparar
}
```

Combinaciones permitidas: notas registrar/finalizar; órdenes transcribir,
finalizar o emitir. No hay acción firmar. La política exige contexto servidor
`req.usuario.id` y `req.authSession` concordantes; relee actor activo, sesión
vigente y permisos actuales en DB. No acepta IDs de capturista/finalizador del
cliente ni confía en permisos/rol copiados en una solicitud antigua.

Bloquea primero al actor (`FOR SHARE`), luego la sesión y al profesional/cargo.
Los cambios administrativos usan el bloqueo de usuario `FOR UPDATE`: una
revocación y una decisión clínica quedan serializadas en la transacción. Los
servicios futuros deben pasar la misma conexión `db` que usen para guardar el
documento y auditarlo; preparar fuera de esa transacción no autoriza una
escritura posterior ni constituye una capacidad reutilizable entre solicitudes.

Identidades del responsable (validación estricta, sin campos adicionales):

```json
{ "tipo": "autenticado" }
```

```json
{ "tipo": "usuario", "usuario_id": 123 }
```

```json
{
  "tipo": "externo",
  "nombre_completo": "Profesional de ejemplo",
  "cargo": "Cargo declarado",
  "especialidad": null,
  "clasificacion_profesional": "medico"
}
```

Para un usuario se relee perfil activo y cargo activo, con la clasificación
compatible. Una nota médica requiere médico; enfermería requiere AE/EP; una
orden requiere médico. Cuentas director no son visibles/seleccionables por
actores que no sean director. Un administrativo no clínico no puede atribuirse
una nota médica por su acceso al módulo, aunque pueda transcribir para un médico.

La respuesta es un parche de identidades, con `tipo_documento`,
`firma: 'manuscrita'` y `validacion_clinica: false`:

| Acción | Campos producidos | Efecto sobre otras identidades |
| --- | --- | --- |
| Registrar/transcribir | `responsable`, `capturista_usuario_id` del servidor | No emite ni finaliza |
| Finalizar captura | Solo `finalizador_usuario_id` del servidor | No cambia responsable ni capturista histórico |
| Emitir orden | `responsable`, `emisor_usuario_id` | No cambia capturista/finalizador |

Emitir exige `ordenes_medicas.emitir` Y responsable médico vinculado a la cuenta
actora. No se puede emitir en nombre de otro usuario ni de un externo; para
ellos existe transcripción de la indicación y posterior firma manuscrita. Esto
evita que seleccionar un médico ajeno otorgue facultades al capturista.

La preparación es de lectura: no escribe documentos ni eventos de falsa
atención. Las futuras escrituras deberán registrar privadamente IDs y acciones
controladas en su transacción; sin narrativa, tokens ni firmas en auditoría.

## Directorio seguro: contrato HTTP

`GET /api/profesionales` es una consulta distinta de `/api/usuarios`. Exige
autenticación/sesión activa y al menos un permiso de registrar, transcribir,
finalizar o emitir de los grupos nuevos. Los permisos de solo lectura de
documentos no dan acceso al selector; admin/director tampoco lo reciben por rol.
`cargarPermisos` consulta las concesiones vigentes en cada solicitud.

Parámetros estrictos:

- `buscar`: hasta 150 caracteres; nombre, cargo o especialidad, sin distinción
  de mayúsculas/diacríticos, mediante `catalogo_personal_clave` de CPREN-115.
  SQL parametrizado con substring literal (`%` y `_` no son comodines).
- `pagina`: 1–100000, predeterminado 1.
- `limite`: 1–50, predeterminado 20.
- `clasificacion_profesional`: opcional médico/AE/EP con los códigos anteriores.

Respuesta `{ data, total, pagina, limite }`, orden estable por nombre e ID.
Cada elemento contiene exclusivamente `id`, `nombre_completo`, `activo`,
`cargo_id`, `cargo_nombre`, `cargo_activo`, `clasificacion_profesional`,
`especialidad_id`, `especialidad_nombre`, `especialidad_activa`. Solo cuentas
activas con cargo activo clasificado clínicamente; no director para actores
no director. Una especialidad histórica inactiva se informa como tal y no se
interpreta como acreditación. Total y página usan un único snapshot SQL.

No expone username, rol, hashes, sesiones, permisos internos ni pacientes.
Respuesta con `Cache-Control: no-store`. Errores: 401 sin sesión válida,
403 sin permiso funcional, 400 query inválida. No hay ruta de alta de externos.

## Conservación histórica futura y límites

El responsable resuelto contiene `tipo`, `usuario_id` o NULL, nombre completo,
cargo ID/nombre, clasificación y especialidad ID/nombre. Se deberá guardar ese
snapshot en el futuro documento para que renombrar/desactivar un catálogo o una
cuenta no cambie quién atendió. La referencia externa nunca crea una cuenta ni
una concesión; su nombre/cargo/especialidad son declaración manual, sin afirmar
verificación legal. No se consultan servicios externos de colegiación.

El futuro servicio debe cargar el documento almacenado y comprobar sus permisos,
estado y ámbito de paciente antes de finalizar/consultar/emitir; el helper no
implementa autorización de objetos clínicos todavía inexistentes. Tampoco define
tablas, vigencia jurídica, workflow clínico, bloqueo de documentos finalizados ni
implementación de firma. Estas decisiones quedan fuera de CPREN-117.

025 es aditiva/idempotente; mantiene 023/024 y anteriores intactas. Su SQL se
replica al final de `schema.sql`, y `schemaCompatibility.js` exige su checksum.
No ejecutarla en una base real sin la autorización, respaldo y comprobaciones
del procedimiento del proyecto.

## Pruebas y registro de sesión

Las pruebas unitarias de política cubren capturista distinto, externo sin cuenta,
finalizador independiente, médico propio, AE/EP, clasificación incompatible,
sesión inválida/revocada/inactiva, lectura de permisos vigentes y entrada estricta.
La integración opt-in utiliza exclusivamente un clúster PostgreSQL vacío propio
en loopback: `RUN_AUTORIA_TEMP_POSTGRES=1` y `AUTORIA_POSTGRES_BIN`; nunca acepta
DATABASE_URL ni destinos de `.env`. Complementa upgrade/idempotencia, defaults,
directorio mínimo, cambios de rol/permisos, CSRF, auditoría y sesiones reales.

Resultados comprobados en esta sesión:

| Comprobación | Resultado |
| --- | --- |
| Backend `npm test`, sin flags RUN_* | 1330 aprobadas, 0 fallos, 52 omisiones opt-in |
| Política de identidades | 20 pruebas unitarias aprobadas, incluidas en backend |
| Permisos/clasificación/defaults | 9 pruebas nuevas aprobadas, incluidas en backend |
| Frontend | 188 lógicas y 226 DOM aprobadas, 0 fallos |
| Frontend lint y build | Correctos |
| Integración CPREN-117, PostgreSQL 18.3 temporal | 15 aprobadas, 0 fallos/omisiones |
| Regresión CPREN-115, PostgreSQL temporal | 9 aprobadas, 0 fallos/omisiones |
| Regresión CPREN-116, PostgreSQL temporal + Chrome | 13 aprobadas, 0 fallos/omisiones; escritorio 1440×1000 y móvil 390×844 |

Las 52 omisiones son opt-in: las 51 previas más la nueva integración propia de
CPREN-117. Las tres raíces temporales CPREN-115/116/117 se ejecutaron después,
aisladas y secuencialmente. Las otras 49 omisiones históricas no se activaron,
para evitar destinos persistentes. No se deshabilitaron pruebas unitarias
críticas. Los tres clústeres terminaron con 0 directorios, procesos y conexiones
residuales en 55475/55476/55477. Las capturas sintéticas de navegador permanecen
solo en Temp; no forman parte de los cambios.

Evidencia local temporal: `cpren117-backend-full.log`,
`cpren117-autoria-integration.log`, `cpren117-catalogos-regression.log` y
`cpren117-perfiles-regression.log` bajo `%TEMP%` de esta PC. Resultados históricos
de otros entornos no se infieren a partir de ellos. La primera ejecución de la
integración nueva detectó dos expectativas erróneas del test sobre el formato de
auditoría; se corrigieron según el contrato real y la repetición completa pasó.

Cierre de implementación anterior a CHECKPOINT-03: `git diff --check` correcto;
índice vacío. Base HEAD sigue siendo
`9cd23aed8bf07ad47c97c72b997b2612d1cdd176`, sin commit/push de CPREN-117. Rama
local nueva, sin upstream. Main permanece en
`e07cef00f0a20931bf92e7f8f00eed2ae25d23e0`. No hubo merge, PR, AWS, n8n,
despliegue ni migración persistente. Los cambios locales corresponden solo a
este inventario de CPREN-117. Estado técnico propuesto para Jira: En revisión,
pendiente de revisión del usuario y de CHECKPOINT-03 autorizado.

## Inventario final: 32 archivos, 22 modificados y 10 nuevos

- backend/src/db/migrations/025_permisos_autoria_clinica.sql (nuevo)
- backend/src/db/schema.sql
- backend/src/db/schemaCompatibility.js
- backend/src/db/seed.js
- backend/src/index.js
- backend/src/repositories/catalogosRepository.js
- backend/src/repositories/permisosRepository.js
- backend/src/repositories/profesionalesRepository.js (nuevo)
- backend/src/routes/catalogos.js
- backend/src/routes/profesionales.js (nuevo)
- backend/src/security/clinicalPermissions.js (nuevo)
- backend/src/services/audit/auditFieldPolicy.js
- backend/src/services/autoriaClinicaService.js (nuevo)
- backend/src/services/catalogosService.js
- backend/src/services/usuariosService.js
- backend/src/validations/catalogos.schemas.js
- backend/src/validations/profesionales.schemas.js (nuevo)
- backend/test/autoriaClinica.test.js (nuevo)
- backend/test/autoriaClinicaPostgres.test.js (nuevo)
- backend/test/catalogos.test.js
- backend/test/catalogosPostgres.test.js
- backend/test/helpers/perfilesBrowser.js
- backend/test/perfilesProfesionalesPostgres.test.js
- backend/test/permisosClinicos.test.js (nuevo)
- backend/test/schemaCompatibility.test.js
- docs/API.md
- docs/BASE_DATOS.md
- docs/CPREN_117_PERMISOS_AUTORIA_CLINICA.md (nuevo)
- frontend/src/components/usuarios/CatalogosProfesionales.jsx
- frontend/src/pages/Usuarios.jsx
- frontend/test-dom/perfilesProfesionales.test.jsx
- frontend/test-dom/usuariosAuditoriaPermission.test.jsx

Registro histórico de Jira, anterior a CHECKPOINT-03: se intentó leer CPREN-117
en el sitio oficial y la consulta agotó el tiempo
de espera (`UNAVAILABLE`, Connection timed out). No fue posible verificar su Epic
(esperado CPREN-3), pasar a En curso ni registrar decisiones/resultados. Reutilizar
CPREN-117 cuando se recupere la conexión; no crear duplicados. Este documento y
la entrega conservan el resumen listo para registrar. No se consultó Notion.
Históricos sin evidencia: No verificable. No se ejecutaron cambios productivos.

## Preparación anterior a CHECKPOINT-03

Revisar el inventario final, las decisiones clínicas y la matriz con CAP; confirmar
la clasificación de cargos y destinatarios de concesiones antes de usarlos.
Verificar por separado diff preparado, ausencia de secretos y remoto. Solicitar
autorización explícita para commit/push de esta rama dependiente; esta sesión no
los realiza. Conservar CPREN-115/116 como ancestros y no fusionar main, crear PR,
desplegar ni iniciar formularios o CPREN-118 durante el checkpoint.

## CHECKPOINT-03 — revisión y recuperación Trabajo → Casa

El usuario autoriza un solo commit con mensaje
`feat(cpren-117): implementar permisos y autoria clinica` y el push exclusivo de
`feature/cpren-117-permisos-autoria-clinica`. No se reescriben CPREN-115/116 ni
se autoriza merge, PR, producción o CPREN-118.

Inspección inicial: Trabajo / Aiden29, rama correcta sin upstream, HEAD exacto
`9cd23aed8bf07ad47c97c72b997b2612d1cdd176`. Índice vacío y 32 archivos
(22 modificados, 10 nuevos), coincidentes con el inventario. Por existir cambios
locales no se hizo pull. Revisados todos los diffs y contenidos nuevos; sin
archivos ajenos, .env, respaldos, claves privadas, tokens reales ni pacientes
identificables. Los datos y credenciales de pruebas son sintéticos.

Revisión de seguridad satisfactoria: matriz y cuatro vías de concesión automática
(alta, cambio de rol, helper de reemplazo y seed), sesión y permisos vigentes,
emisión propia médica explícita, AE/EP, transcripción, finalización, externos,
directorio mínimo y auditoría privada. VIH y auditoría conservan sus reglas.
025 es aditiva e idempotente; el esquema anterior y las 21 migraciones previas
siguen intactos. Su bloque coincide con schema.sql y compatibilidad exige 025.
No se clasificaron los ocho cargos iniciales ni se aplicaron migraciones reales.

Pruebas repetidas durante CHECKPOINT-03: backend 1330 aprobadas, 0 fallos y
52 omisiones; frontend 188 lógicas y 226 DOM aprobadas, lint y build correctos.
Los logs de las integraciones previas de esta misma implementación confirman
15 (CPREN-117), 9 (CPREN-115) y 13 (CPREN-116) aprobadas, sin fallos/omisiones.
No se repitieron los clústeres al no cambiar código; se verificó de nuevo que no
hay directorios, procesos ni conexiones residuales en 55475/55476/55477.
`git diff --check` correcto. Evidencia repetida en
`%TEMP%/cpren117-checkpoint03-{backend,frontend,lint,build}.log`.

Las 52 omisiones pertenecen a 21 archivos, todas con flags opt-in explícitos:
13 de citasInasistenciasPostgres, 16 de migrateSafePostgres, 3 de
pacienteEmbarazoPostgres, 2 de migrateBootstrapPostgres, 2 de sessionActivityPostgres
y 16 raíces individuales (incluidas las tres integraciones propias ya ejecutadas).
Se verificaron gates y log; no se añadieron skip/todo accidentales ni se omitieron
pruebas unitarias críticas. Las otras 49 omisiones históricas no se activaron.

Remoto inspeccionado antes de preparar publicación: CPREN-117 aún inexistente;
CPREN-116 en la base indicada; CPREN-115 en
`055e873338f1a363c78efa0030a40b4d813bf962`; main en
`e07cef00f0a20931bf92e7f8f00eed2ae25d23e0`. El SHA del único commit resultante
y su coincidencia local/remota se informan en la entrega del checkpoint y se
consultan con `git log -1 --format=fuller`; el documento no incluye su propio SHA.

Jira respondió en este checkpoint: CPREN-117 es la subtarea existente de
CPREN-12, perteneciente al Epic CPREN-3. Se conservó esa jerarquía y se pasó
CPREN-117 a En curso. El cierre debe registrar resultados y los SHA reales,
dejando En revisión para validación del usuario. No se crearon issues duplicados.

Para recuperar desde el clon de casa, primero ejecutar:

```powershell
git status --short --branch
```

Si hay cambios locales, preservarlos y detenerse antes de cambiar de rama. Con
árbol limpio:

```powershell
git fetch origin
git switch --track origin/feature/cpren-117-permisos-autoria-clinica
git branch --show-current
git log -1 --format=fuller
git rev-parse HEAD
git rev-parse origin/feature/cpren-117-permisos-autoria-clinica
git merge-base --is-ancestor 9cd23aed8bf07ad47c97c72b997b2612d1cdd176 HEAD
git merge-base --is-ancestor 055e873338f1a363c78efa0030a40b4d813bf962 HEAD
git status --short --branch
```

Ambos SHA deben coincidir con el de la entrega. Si la rama local ya existe,
sustituir `git switch --track` por:

```powershell
git switch feature/cpren-117-permisos-autoria-clinica
git pull --ff-only origin feature/cpren-117-permisos-autoria-clinica
```

No forzar divergencias, ejecutar migraciones persistentes ni comenzar CPREN-118.
Clasificación de cargos y concesiones concretas quedan pendientes de validación
del CAP; clasificación/permiso/identidad externa no acreditan habilitación legal.
