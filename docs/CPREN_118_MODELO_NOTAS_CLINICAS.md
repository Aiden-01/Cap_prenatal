# CPREN-118 — Modelo de datos y API de notas de evolución

> Documento histórico de la fase original. CHECKPOINT-10 sustituye sus contratos de perfiles/directorio: la arquitectura vigente usa cargo y clasificación, sin Especialidades; las altas requieren email. Véase [arquitectura y contratos actuales](CPREN_120_CHECKPOINT_10_PROFESIONALES_USUARIOS.md). Se conserva el contenido original como evidencia histórica.

## Alcance y dependencias

Sesión 22/10/2026 en Trabajo / Aiden29, PC del CAP El Chal. Rama local:
`feature/cpren-118-modelo-notas-clinicas`, creada desde el commit exacto
`e75ebfdee770f72a272c784785b0e3396bf06799` de CPREN-117. Requiere CPREN-115,
CPREN-116 y CPREN-117, todavía sin fusionar a main.

Persistencia y API únicamente. No incluye React, PDF, órdenes médicas,
redirecciones, indicadores de pendientes ni generación automática de notas para
controles históricos. No inicia CPREN-119/120. No cambia guardado de controles,
cita_siguiente, programación de citas, n8n ni datos persistentes.

## Arquitectura y decisiones clínicas

Rutas anidadas en pacientes → controlador → servicio → repositorio SQL. Zod
valida entradas estrictas; autorización y reglas se repiten dentro de la
transacción, sin depender de la interfaz. Las escrituras usan obligatoriamente
la misma conexión para política profesional, documento y auditoría privada.

Una sola tabla y una sola narrativa para:

| Tipo persistido | Título futuro | Responsable |
| --- | --- | --- |
| `nota_evolucion` | NOTA DE EVOLUCIÓN | Médico |
| `nota_enfermeria` | NOTA DE EVOLUCIÓN DE ENFERMERÍA | AE o EP |

No se usa SOAP ni se crean estructuras narrativas distintas. La futura impresión
tendrá solamente nombre del responsable y espacio de firma manuscrita, sin firma
de paciente ni secundaria. Finalizar captura no equivale a firmar, validar
clínicamente ni emitir una prescripción.

## Migración 026 e integridad

`026_notas_clinicas.sql` es aditiva/idempotente. Se replica al final de schema.sql;
schemaCompatibility.js exige su checksum. No modifica migraciones anteriores,
filas previas ni tablas de controles/embarazos. La instalación nueva y la
actualización usan el migrador oficial, sin ejecución automática al arrancar API.

Tabla `notas_clinicas`:

| Campos | Finalidad |
| --- | --- |
| id, paciente_id | Identidad y expediente obligatorio |
| embarazo_id, control_prenatal_id | Contexto opcional validado |
| tipo, es_principal | Documento y principal del control/tipo |
| fecha_atencion DATE, hora_atencion TIME sin zona | Atención clínica, inicialmente nullable |
| contenido TEXT | Una narrativa, máximo 20000 caracteres; borrador admite vacío |
| estado | borrador / captura_finalizada |
| responsable_usuario_id, responsable_snapshot JSONB | Referencia opcional y snapshot histórico obligatorio |
| capturista_usuario_id | Usuario original, determinado en servidor e inmutable |
| finalizador_usuario_id, finalizada_at | Cierre administrativo, inicialmente NULL |
| created_at, updated_at | Instantes técnicos TIMESTAMPTZ |
| version | Entero positivo, inicialmente 1; CAS y aumento exacto de una unidad |
| clave_idempotencia UUID, solicitud_hash | Deduplicación interna, nunca expuesta |

FK paciente RESTRICT. FK compuesta (embarazo_id,paciente_id) comprueba el
expediente. FK (control_prenatal_id,embarazo_id) aprovecha la clave única previa
del control y la integridad paciente/embarazo de 021; junto con CHECK control ⇒
embarazo no nulo impide cruzar pacientes. No se necesitan índices/alteraciones
nuevos en tablas anteriores. Las referencias a usuarios y contexto son RESTRICT:
no se permite perder documentación por cascada, ni siquiera en borrador.

Se admiten consultas independientes sin embarazo y sin control. Con embarazo
explícito debe pertenecer a la paciente. Con control y embarazo omitido, el
servicio deriva su embarazo real; embarazo NULL explícito o diferente se rechaza.
No se crea un embarazo o control ficticio. La relación, tipo, principal e
identidad original de captura son inmutables después de crear la nota.

Se reutiliza validarEmbarazoEditable: activo y puerperio admiten escrituras;
cerrado permanece en lectura, conforme al patrón del expediente y el issue.
Una nota independiente sin embarazo no obliga a reabrir un episodio anterior.
Una repetición idempotente puede confirmar una nota ya existente de un episodio
cerrado: no escribe ni modifica su contenido.

Una principal por **control y tipo**, protegida por índice único parcial. Con
control, es_principal es true por defecto; false permite notas adicionales de
otros profesionales sin reemplazarla. Sin control, principal debe ser false.
Dos tipos pueden tener su propia principal; esta elección permite que el futuro
flujo consulte el tipo pertinente sin bloquear notas del otro colectivo.

El trigger impide DELETE físico de cualquier nota, modificaciones de finalizadas,
cambio de contexto/capturista/clave/huella/creación y aumentos inválidos de versión.
La transición de finalización tampoco permite cambiar narrativa, atención o
responsable en la misma sentencia. CHECK exige mínimos completos al finalizar,
snapshot de forma/tipo/clasificación compatibles, y rechaza JSON NULL inválidos.
No hay endpoint DELETE.

## Autoría y permisos

Se reutiliza obligatoriamente prepararAutoriaClinica de CPREN-117 para crear,
cambiar explícitamente responsable y finalizar, con la misma conexión SQL.
Se extrae conContextoClinico de esa política para compartir su verificación
vigente de actor/sesión/permisos en lecturas y ediciones de texto que conservan
un responsable histórico. No se copia ni debilita la autenticación existente.

Toda operación exige pacientes.ver y el permiso del tipo correspondiente:

| Operación | Médico | Enfermería |
| --- | --- | --- |
| Listar/consultar contenido | notas_evolucion.ver | notas_enfermeria.ver |
| Crear/editar borrador | notas_evolucion.registrar | notas_enfermeria.registrar |
| Finalizar administrativamente | notas_evolucion.finalizar_captura | notas_enfermeria.finalizar_captura |

Registrar o finalizar no implica permiso ver. El listado filtra los tipos
autorizados; solicitar explícitamente un tipo no permitido devuelve 403.
GET/PUT/finalizar se autorizan por tipo almacenado y paciente real, nunca por un
tipo enviado por el cliente. Una nota bajo otra paciente devuelve 404.

Responsable: autenticado, otro usuario compatible o externo, con contrato estricto
de CPREN-117. El snapshot guarda tipo, usuario opcional, nombre, cargo ID/nombre,
clasificación y especialidad ID/nombre. No se reconstruye con joins de perfiles
actuales: renombrar o desactivar no altera historia. Editar solo contenido y
finalizar conservan ese snapshot aunque el responsable esté hoy inactivo; cambiar
el responsable explícitamente exige la validación vigente del nuevo profesional.

El capturista original y finalizador proceden del contexto servidor, sin campos
manipulables en el body. Otro usuario autorizado puede editar/finalizar sin
reemplazar al capturista. Director/admin no reciben privilegios clínicos nuevos.
No se clasifican cargos ni se conceden permisos en la migración. Clasificación,
identidad externa y permiso nunca acreditan habilitación legal.

## Ciclo de vida, concurrencia e idempotencia

Borrador permite fecha/hora NULL y texto parcial/vacío; responsable compatible es
obligatorio desde su creación. Finalizar exige fecha, hora y contenido con algún
carácter no blanco. La finalización es administrativa y no cambia el contenido.
Fecha/hora se pueden corregir en borrador, con versión y auditoría.

Cada POST exige clave_idempotencia UUID. El servidor guarda una huella SHA-256
del payload normalizado y paciente, sin incluir el perfil mutable resuelto.
La clave es única por capturista. Misma clave/payload: 200, misma nota, sin nuevo
evento. Misma clave/payload distinto: 409 NOTA_IDEMPOTENCIA_CONFLICT. Claves
diferentes que compiten por una principal: 409 NOTA_PRINCIPAL_EXISTENTE. La
idempotencia también cubre notas independientes. Clave y huella nunca salen en
respuesta, log ni auditoría. Un replay no revela texto editado por otras personas.

PUT y finalizar requieren version. Bajo bloqueo de fila se comprueba borrador y
versión, y SQL repite CAS; desactualizada: 409 NOTA_VERSION_CONFLICT. Una carrera
produce un éxito y un conflicto; jamás sobrescritura silenciosa ni doble cierre.
Finalizada: 409 NOTA_FINALIZADA para cualquier nuevo cambio/cierre.

Orden de bloqueos: actor → sesión → paciente → embarazo → control → nota.
La consulta preliminar de control no bloquea; se vuelve a comprobar después de
bloquear embarazo. Se respeta el orden previo de controles y se serializa contra
cierres del embarazo, cambios de permisos/sesiones y escrituras concurrentes.

## Contratos REST

Base: `/api/pacientes/:pacienteId/notas-clinicas`. Autenticación y permisos
vigentes, CSRF en escrituras y Cache-Control: no-store. Sin endpoints arbitrarios
para estado, identidad del capturista/finalizador, reparentado o borrado.

- GET base: `{data,total,pagina,limite}`, metadatos/snapshot sin narrativa.
  Filtros tipo, embarazo_id, control_prenatal_id, estado; pagina 1–100000 y limite
  1–50 (20 por defecto). No filtra ni cuenta notas de tipos no autorizados.
- POST base: 201 al crear, 200 al repetir idempotentemente. Confirmación mínima.
- GET `/:notaId`: detalle con contenido, solo con permiso ver del tipo.
- PUT `/:notaId`: campos permitidos version y al menos uno de contenido,
  fecha_atencion, hora_atencion, responsable. Lo omitido se conserva; NULL solo
  permite retirar fecha/hora de borrador.
- POST `/:notaId/finalizar`: body exclusivamente `{ "version": 1 }`.

Todas las respuestas de escritura/replay contienen solo id, paciente_id, tipo,
estado, version y fechas técnicas. No narrativa ni snapshot profesional a quien
solo tiene permiso de captura/cierre. El listado sirve de historial de notas y
estado; no implementa historial de revisiones del borrador.

Ejemplo sintético de borrador independiente:

```json
{
  "tipo": "nota_evolucion",
  "fecha_atencion": "2026-10-20",
  "hora_atencion": "09:30",
  "contenido": "Narrativa sintética de ejemplo.\nSegundo párrafo.",
  "responsable": { "tipo": "autenticado" },
  "clave_idempotencia": "11111111-1111-4111-8111-111111111111"
}
```

Para control: añadir control_prenatal_id, opcionalmente embarazo_id coincidente.
Otro profesional: `{ "tipo":"usuario", "usuario_id":123 }`. Externo: contrato
CPREN-117 con nombre_completo, cargo, especialidad opcional y clasificación.

Errores: 400 validación/contexto/NOTA_INCOMPLETA; 401 sesión inválida, expirada o
inactiva; 403 permiso; 404 pertenencia; 409 versión/finalizada/idempotencia/
principal/embarazo cerrado o eliminación de recurso relacionado. No se devuelve
texto clínico dentro de errores. No hay acciones ni permisos nuevos de órdenes.

## Fechas clínicas

Fecha de atención es día civil YYYY-MM-DD, validado sin año cero, fecha imposible
o futura según Guatemala; hora HH:mm[:ss] se normaliza HH:mm:ss, sin offset.
No se convierten en instantes UTC. Las consultas formatean DATE explícitamente
como YYYY-MM-DD, independiente de TimeZone/DateStyle de PostgreSQL. Creación,
actualización y finalización son instantes técnicos separados y nunca sustituyen
automáticamente fecha/hora de atención desconocidas.

## Auditoría privada y conservación histórica

Eventos crear, actualizar y finalizar_captura sobre nota_clinica/notas_clinicas.
Solo IDs, tipo/estado controlados, versión y marcador de cambio de responsable.
Sin narrativa, snapshot de nombres, diagnósticos, claves, huellas, cookies o tokens.
Documento y auditoría obligatoria comparten transacción; fallo revierte ambos.
Replays y lecturas no crean eventos de falsa modificación clínica.

No se copian campos VIH ni otros datos desde controles. Sus permisos y flujos
existentes se conservan. La narrativa libre nueva se protege por permiso ver del
tipo; no se aplica una supuesta redacción automática de diagnósticos en texto.
Si CAP requiere segmentación adicional de textos, deberá definirla antes de la
interfaz; no se infiere clínicamente qué escribió el responsable.

Las aclaraciones no se implementan en esta fase: definir permisos específicos y
revisión de su autoría excedería una extensión acotada del contrato actual.
Mecanismo explícito pendiente: tabla append-only vinculada a la nota finalizada,
texto propio inmutable, snapshot del profesional que aclara, capturista servidor,
fecha clínica/técnica y auditoría privada, sin tocar el original. Hasta aprobar
ese contrato no hay ruta de corrección, reapertura ni borrado de finalizadas.

## Verificación, inventario y cierre

| Verificación de esta sesión | Resultado |
| --- | --- |
| Backend npm test con todos los RUN_* eliminados | 1344 aprobadas, 0 fallos, 53 omisiones opt-in (1397 total) |
| Nuevas pruebas rápidas HTTP/validación y servicio | Incluidas en la suite backend; sin fallos |
| CPREN-118 PostgreSQL 18.3 temporal | 20 aprobadas, 0 fallos/omisiones |
| CPREN-115 PostgreSQL temporal | 9 aprobadas |
| CPREN-116 PostgreSQL y Chrome escritorio/móvil | 13 aprobadas |
| CPREN-117 PostgreSQL temporal | 15 aprobadas |
| Frontend | 188 lógicas y 226 DOM aprobadas, 0 fallos |
| Frontend lint/build | Correctos |
| git diff --check | Correcto |

Todas las integraciones usan initdb propio con configuración sintética en
loopback y .env deshabilitado; jamás flags de suites históricas persistentes.
Puertos 55475/55476/55477/55478, sin clústeres, procesos ni conexiones residuales.
Se probó la 026 incremental dos veces, SQL repetido, instalación vacía y migrador
repetido con compatibilidad, relaciones falsas, borrador parcial, médico/AE/EP,
digitador, externo, suplantación, lectura por tipo, revocación/expiración/inactivo,
principal/idempotencia/CAS/finalización concurrentes, snapshots, tres rollback de
auditoría, inmutabilidad y ausencia de cambios en controles/calendario. Fechas:
UTC, Guatemala y Tokio, además de DateStyle SQL/German en conexiones dedicadas.

Las 53 omisiones son las 52 opt-in previas y la nueva raíz de PostgreSQL propia
de notas; no se añadieron desactivaciones accidentales de pruebas críticas. Las
cuatro raíces CPREN-115–118 se ejecutaron separadamente; las otras 49 omisiones
históricas no se activaron. No se usó PostgreSQL persistente. Los avisos existentes
de caniuse-lite antiguo no impidieron build ni cambiaron dependencias.

Se actualizó una expectativa previa del inventario de schema: ahora 20 tablas
operativas y dos técnicas, conservando la comprobación de retiro de referencias.
No se debilitó la regresión. Un assert unitario inicial usaba incorrectamente la
firma del builder de auditoría; se corrigió según su contrato real y pasó. Los
intentos HTTP dentro del sandbox sin sockets se repitieron con permiso de loopback.

Logs locales en %TEMP%: cpren118-backend-full.log, cpren118-notas-integration.log,
cpren118-catalogos-regression.log, cpren118-perfiles-regression.log,
cpren118-autoria-regression.log, cpren118-frontend.log, cpren118-lint.log y
cpren118-build.log. Históricos ajenos a esta evidencia: No verificable.

Inventario: **24 archivos, 14 modificados y 10 nuevos**:

- backend/src/controllers/notasClinicasController.js (nuevo)
- backend/src/db/migrations/026_notas_clinicas.sql (nuevo)
- backend/src/db/schema.sql
- backend/src/db/schemaCompatibility.js
- backend/src/repositories/notasClinicasRepository.js (nuevo)
- backend/src/repositories/usuariosRepository.js
- backend/src/routes/notasClinicas.js (nuevo)
- backend/src/routes/pacientes.js
- backend/src/services/audit/auditFieldPolicy.js
- backend/src/services/auditService.js
- backend/src/services/autoriaClinicaService.js
- backend/src/services/notasClinicasService.js (nuevo)
- backend/src/validations/notasClinicas.schemas.js (nuevo)
- backend/test/autoriaClinicaPostgres.test.js
- backend/test/notasClinicasHttp.test.js (nuevo)
- backend/test/notasClinicasPostgres.test.js (nuevo)
- backend/test/notasClinicasService.test.js (nuevo)
- backend/test/perfilesProfesionalesPostgres.test.js
- backend/test/permisosClinicos.test.js
- backend/test/retiroReferencias.test.js
- backend/test/schemaCompatibility.test.js
- docs/API.md
- docs/BASE_DATOS.md
- docs/CPREN_118_MODELO_NOTAS_CLINICAS.md (nuevo)

Jira CPREN-118 es la subtarea existente de CPREN-12 bajo Epic CPREN-3. Se reutilizó
y pasó a En curso al comenzar la implementación. El cierre registra decisiones,
inventario y resultados con estado En revisión para validación del usuario.
Las denominaciones nota_evolucion/nota_enfermeria y captura_finalizada siguen la
solicitud vigente y CPREN-117, frente a abreviaturas de la descripción antigua.

Git al cierre de implementación, anterior a CHECKPOINT-04: rama feature/cpren-118-modelo-notas-clinicas, HEAD aún en
e75ebfdee770f72a272c784785b0e3396bf06799; cambios locales sin staging, commit ni
push. Main permanece en e07cef00f0a20931bf92e7f8f00eed2ae25d23e0. No merge, PR,
AWS, servicios productivos, n8n ni despliegue. Las migraciones 004–025 permanecen
intactas; solo se añade 026. No se iniciaron CPREN-119/120.

## Preparación para CHECKPOINT-04 y fases posteriores

Revisar modelo, permisos, API y decisión de principal por tipo con el CAP.
Confirmar clasificación efectiva y concesiones explícitas antes del uso clínico.
En CHECKPOINT-04, verificar inventario/diffs/migraciones, secretos y pruebas antes
de solicitar autorización para commit/push; esta sesión conserva todo local.

CPREN-119 podrá consultar tipo/control/principal/estado y recuperar el borrador
mediante GET, reutilizar clave UUID en reintentos y manejar 409 de concurrencia.
Aquí no se implementa redirección ni indicador de pendiente. CPREN-120 podrá
consumir el snapshot para encabezado/firma manuscrita; no se inicia PDF ni React.
Ambas fases requieren autorización posterior del usuario.

## CHECKPOINT-04 — revisión y recuperación Trabajo → Casa

El usuario autoriza un único commit:
`feat(cpren-118): implementar modelo y api de notas clinicas`, y publicar solo
`feature/cpren-118-modelo-notas-clinicas`, sin reescribir dependencias, hacer
merge/rebase/PR, desplegar ni iniciar CPREN-119/120.

Inspección en Trabajo / Aiden29: HEAD exacto
`e75ebfdee770f72a272c784785b0e3396bf06799`, sin upstream e índice vacío antes
del staging. Los 24 archivos (14 modificados, 10 nuevos) coinciden con el
inventario. Por los cambios locales no se hizo pull. Revisados diffs y archivos
nuevos, sin cambios ajenos, secretos, .env, respaldos ni pacientes reales.

Revisión satisfactoria de modelo narrativo común, responsables médico/AE/EP,
relaciones, principal por control/tipo y adicionales, idempotencia y concurrencia,
capturista/finalizador del servidor, snapshot histórico, autorización por tipo,
IDOR, CSRF, revocación, auditoría privada y rollback. Finalizar no firma ni valida
clínicamente. Finalizadas inmutables; aclaraciones siguen expresamente pendientes,
sin implementación durante el checkpoint. No se cambiaron concesiones, reglas de
VIH/roles/permisos ni el comportamiento de controles, citas o cita_siguiente.
026 aditiva/idempotente, bloque idéntico al agregado de schema.sql y checksum
requerido; 023–025 y las demás migraciones anteriores intactas.

Checks repetidos: backend 1344 aprobadas, 0 fallos y 53 omisiones opt-in; frontend
188 lógicas y 226 DOM aprobadas; lint/build correctos; git diff --check correcto.
Las omisiones mantienen gates explícitos: las 52 previas más la raíz propia de
notas. No se añadieron skip/todo accidentales. Las cuatro raíces temporales ya
ejecutadas dejan otras 49 omisiones históricas sin activar. Se comprobaron los
logs previos de esta implementación: CPREN-118 20, CPREN-115 9, CPREN-116 13 y
CPREN-117 15 aprobadas. No se repitieron clústeres al no cambiar código; limpieza
revalidada: 0 directorios, procesos y conexiones en 55475–55478.
Logs repetidos: %TEMP%/cpren118-checkpoint04-{backend,frontend,lint,build}.log.

Remoto previo: CPREN-118 aún inexistente; CPREN-117 en la base indicada,
CPREN-116 en 9cd23aed8bf07ad47c97c72b997b2612d1cdd176, CPREN-115 en
055e873338f1a363c78efa0030a40b4d813bf962 y main en
e07cef00f0a20931bf92e7f8f00eed2ae25d23e0. El SHA resultante y su coincidencia
local/remota se registran en la entrega y Jira, sin autorreferencia dentro del
documento. CPREN-118 se reutiliza bajo CPREN-12 / Epic CPREN-3 y conserva En
revisión para validación del usuario.

Desde el clon de casa, ejecutar primero `git status --short --branch`. Si existen
cambios, preservarlos antes de cambiar de rama. Con árbol limpio:

```powershell
git fetch origin
git switch --track origin/feature/cpren-118-modelo-notas-clinicas
git branch --show-current
git log -1 --format=fuller
git rev-parse HEAD
git rev-parse origin/feature/cpren-118-modelo-notas-clinicas
git merge-base --is-ancestor e75ebfdee770f72a272c784785b0e3396bf06799 HEAD
git status --short --branch
```

Ambos SHA deben coincidir con la entrega. Si la rama local ya existe, sustituir
git switch --track por:

```powershell
git switch feature/cpren-118-modelo-notas-clinicas
git pull --ff-only origin feature/cpren-118-modelo-notas-clinicas
```

No forzar divergencias ni ejecutar migraciones persistentes. Clasificación y
concesiones efectivas, segmentación adicional de narrativa y mecanismo de
aclaraciones siguen pendientes de validación con CAP. CPREN-119 no ha comenzado.
