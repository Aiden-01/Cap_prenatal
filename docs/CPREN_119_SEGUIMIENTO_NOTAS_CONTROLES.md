# CPREN-119 — Seguimiento documental después del control prenatal

Actualización posterior: la sincronización con main de CHECKPOINT-06 y sus
resultados propios se documentan en
[CPREN_119_CHECKPOINT_06_SYNC_MAIN.md](CPREN_119_CHECKPOINT_06_SYNC_MAIN.md).
El resto de este documento conserva el registro histórico de CHECKPOINT-05.

Sesión: 2026-10-22, equipo Trabajo (PC del CAP El Chal), dispositivo Aiden29.
Jira: CPREN-119, subtarea de CPREN-12 bajo el Epic CPREN-3.
Base exacta: `e61979c2b6f5817c7853cbb47d075132d381ffdd` (CPREN-118).
Rama local: `feature/cpren-119-seguimiento-notas-controles`.
Dependencias acumuladas: CPREN-115/116/117/118, aún sin integrar a main.

## Alcance y decisiones

Se aplica la opción B: el control queda guardado aunque la nota no se complete.
Guardar control, confirmar seguimiento y capturar una nota son operaciones
independientes. No se crean notas ficticias ni controles adicionales. Cerrar el
navegador no pierde la elegibilidad ni una confirmación ya guardada.

Antes de modificar se verificó árbol limpio, rama y HEAD; `git pull --ff-only`
confirmó CPREN-118 actualizada. Se creó la rama nueva desde el SHA indicado.
No se hizo staging, commit, push, merge, PR ni despliegue.

La inspección confirmó el POST de controles con respuesta plana 201 e ID real,
la navegación de 800 ms y el campo libre `nombre_cargo_atiende`. Se conserva este
campo sin inferir de él profesión. El rol de cuenta tampoco decide el documento.
La clasificación sigue siendo funcional, no acreditación legal.

## Persistencia y elegibilidad

La migración aditiva e idempotente `027_seguimiento_notas_controles.sql` añade:

- `controles_seguimiento_notas`: PK control, paciente/embarazo, fecha técnica y
  versión interna. Su existencia es el criterio persistente de elegibilidad.
- `controles_notas_requeridas`: PK control/tipo, snapshot profesional validado por
  CPREN-117, usuario que confirmó (servidor) y momento técnico.
- Trigger AFTER INSERT de controles que crea solo el marcador de elegibilidad.
  UPDATE y la rama UPDATE del UPSERT no activan controles históricos.
- Trigger que impide actualizar una confirmación ya registrada.

No hay backfill, fecha de corte arbitraria ni marcador en el navegador. Los
controles previos carecen del marcador y no aparecen como pendientes. Si ya tienen
una nota principal manual, su estado real sí se puede consultar bajo permiso;
eso no activa obligaciones históricas adicionales.

Se eligió trigger frente a modificar `crearControl`: cubre toda inserción real,
persiste la elegibilidad junto con el control y deja intactas las reglas de citas,
asistencia, estados de embarazo y auditoría previa. No crea ni captura notas en
esa transacción. El POST conserva su contrato anterior y devuelve el ID real.

Las FKs compuestas conservan paciente/embarazo/control. La unicidad de nota
principal por control/tipo de 026 sigue vigente; se admiten principal médica y
principal de enfermería, además de notas adicionales no principales.

El seguimiento es metadato de un control, no contenido clínico: sus filas usan
ON DELETE CASCADE al borrar el control por el flujo autorizado y auditado previo.
Así no se bloquea la eliminación previa de controles sin citas ni notas. Cualquier
nota clínica real sigue siendo inmutable y bloquea la eliminación del control por
RESTRICT de 026. No existe endpoint para borrar confirmaciones individualmente.

`schema.sql` conserva exactamente su prefijo anterior y añade el SQL 027.
`schemaCompatibility.js` exige 027 con checksum canónico. No se modificaron
migraciones 023–026 ni las anteriores. Aplicación solo en clústeres de prueba.

## Estados y transiciones

| Situación persistida | Presentación autorizada |
| --- | --- |
| Sin marcador ni principal | Control histórico, sin pendiente automático |
| Marcador, sin confirmación/principal visible | Tipo de nota por definir para documentos autorizados |
| Confirmación por tipo, sin principal | Nota pendiente |
| Principal en borrador | Nota en borrador |
| Principal con captura finalizada | Captura finalizada |

Borrador/finalizada se derivan siempre de `notas_clinicas`, sin copiar estado.
Las notas adicionales no satisfacen la obligación de principal. Una principal
creada directamente con la API de CPREN-118 se refleja aunque no exista una
confirmación de seguimiento. Control completo y nota pendiente son independientes.
No se dice «Firmada»: finalizar captura es cierre administrativo, no firma clínica.

El profesional previsto queda en un snapshot histórico. No se sustituye por el
capturista. Si la nota real tiene otro responsable, se presenta como responsable
de la nota y se muestra aparte el previsto; el seguimiento no modifica autorías.
Desactivar o renombrar un perfil conserva la confirmación histórica.

## API y seguridad

### Consulta agregada

`GET /api/pacientes/:pacienteId/controles/seguimiento-notas`

Query obligatoria: `embarazo_id` y `controles_ids` (CSV, 1–100 IDs). Se deduplican
IDs, se valida pertenencia estricta al paciente y embarazo; un ID ajeno produce
404, no datos parciales. La consulta SQL de estado es única por lote. El frontend
divide listas mayores en lotes de 100, nunca hace una solicitud por control.

Respuesta: `{data:[{control_prenatal_id,elegible,documentos}],tipos_autorizados}`.
Cada documento tiene `tipo`, `estado`, `nota_id`, `nota_version`,
`responsable_previsto` y `responsable_nota`. No contiene narrativa. Estados
admitidos: pendiente, borrador, captura_finalizada. Snapshots solo de tipos leíbles.
No se expone versión global ni conteos/existencia de tipos ocultos. Una lista
visible vacía se explica dentro del ámbito autorizado, no como ausencia absoluta.

### Confirmación de tipo y profesional

`POST /api/pacientes/:pacienteId/controles/:id/seguimiento-notas`

Ejemplo exclusivamente sintético:

```json
{
  "embarazo_id": 11,
  "version": 1,
  "tipo": "nota_enfermeria",
  "responsable": { "tipo": "usuario", "usuario_id": 3 }
}
```

Se reutilizan las identidades autenticado/usuario/externo y
`prepararAutoriaClinica` de CPREN-117 con acción registrar. Médico para evolución;
AE o EP para enfermería. El propio usuario solo se elige mediante confirmación
explícita; otro profesional se busca en el directorio controlado; externo usa los
campos de identidad y clasificación de CPREN-117. No se conceden permisos ni se
clasifican usuarios históricos.

Lectura requiere `pacientes.ver` y `.ver` del tipo. Confirmación requiere además
`.registrar` del mismo tipo y embarazo editable (activo/puerperio), nunca solo
lectura. Sesión, actor activo y permisos se recargan/bloquean mediante
`conContextoClinico` dentro de la transacción. Se conservan autenticación, CSRF,
Zod estricto, SQL parametrizado, no-store y protección IDOR. Campos manipulados
como confirmado_por, capturista, estado, snapshot o contenido se rechazan.

## Concurrencia, reintentos y auditoría

Las decisiones son adiciones inmutables, no ediciones. `version:1` es la
precondición pública de tipo aún sin confirmar. Dos solicitudes para el mismo
tipo e identidad devuelven un único registro; la repetición devuelve 200 con
`reutilizada:true`. Una identidad distinta ya confirmada responde 409
SEGUIMIENTO_YA_CONFIRMADO. Una versión inicial distinta responde 409
SEGUIMIENTO_VERSION_CONFLICT. No se sobrescribe ni se amplía el alcance para
implementar correcciones históricas.

Se bloquea el embarazo antes del marcador, en el orden usado por controles/notas.
La PK control/tipo y un CAS del contador interno bajo lock impiden duplicados y
pérdida de cambios. Confirmaciones de tipos diferentes son adiciones compatibles;
no se publica un contador compartido que revele cambios de otro tipo.

La auditoría privada obligatoria `seguimiento_nota_confirmado` comparte transacción
con la confirmación y el incremento de versión. Solo admite IDs, versión, resultado
y tipo controlado; no nombres, snapshot ni narrativa. Si falla o no se escribe,
todo se revierte. Los errores se procesan mediante el manejador sanitizado actual.

## Interfaz y navegación

NuevoControl reemplaza la navegación temporizada solo al crear: muestra éxito,
conserva ID, enfoca el encabezado y ofrece seguimiento y regreso al expediente sin
nota. El bloqueo inmediato por ref evita doble envío incluso antes del rerender.
Tras éxito desaparece el formulario. Una respuesta antigua sin ID ofrece recuperar
desde expediente, sin construir rutas falsas ni reenviar el control.

Editar conserva su comportamiento anterior; consulta y solo lectura no se alteran.
No hay diálogo nuevo; se usa confirmación en página con encabezado enfocable y
estado accesible. No se requiere cerrarlo para conservar el control.

ExpedientePaciente pasa permisos actuales al TimelineControles. El hook agregado
consulta por lotes, invalida por identidad/permisos/contexto, recarga al recuperar
foco y ofrece reintento. Carga/error/403 nunca significan «Sin notas» ni «Finalizada».
El error no bloquea la apertura del control. Se preserva su indicador Completo.

Ruta válida de continuación:
`/pacientes/:id/controles/:controlId/seguimiento-notas?embarazo_id=:embarazoId`.
La pantalla consulta estado real, presenta contexto, confirma profesional cuando
está autorizado y permite volver al expediente. Explica que el editor/PDF aún no
están disponibles. No hay botones a editores inexistentes.

## Contrato previsto para CPREN-120 y límites

CPREN-120 deberá partir del contexto validado por backend (nunca confiar en la
URL), consultar seguimiento, recuperar nota_id existente y reutilizar la API de
CPREN-118 para el editor narrativo compartido. Si no existe principal, su creación
usará UUID de idempotencia y manejará NOTA_PRINCIPAL_EXISTENTE 409 recuperando la
existente. El profesional previsto sirve de contexto a confirmar, nunca autoriza
suplantación ni ignora desactivaciones. No implementar PDF/editor en CPREN-119.

No se agregaron órdenes médicas, firmas, aclaraciones de notas finalizadas ni
reglas VIH/roles. Tampoco se modificó cita_siguiente ni servicios de controles.
Una nota finalizada sigue protegida por CPREN-118. La clasificación y asignación
de permisos reales requieren una decisión autorizada posterior.

## Pruebas y verificaciones

Resultados e inventario final constan a continuación. No se deben activar
suites PostgreSQL históricas con
destinos configurables o archivos .env. La integración nueva crea initdb propio,
escucha solo en 127.0.0.1:55479, verifica data_directory, inyecta el pool temporal
y deshabilita dotenv. Detiene PostgreSQL y elimina su directorio en finally.

El navegador real usa Vite con envDir vacío, proxy a esa API temporal y bloqueo
de peticiones externas. Las capturas sintéticas se conservan como evidencia de
prueba en TEMP; no son directorios PostgreSQL residuales.

## Inventario local para CHECKPOINT-05

28 archivos: 13 modificados y 15 nuevos; todos sin staging.

- `backend/src/db/schema.sql` — modificado.
- `backend/src/db/schemaCompatibility.js` — modificado.
- `backend/src/routes/controles.js` — modificado.
- `backend/src/services/audit/auditFieldPolicy.js` — modificado.
- `backend/test/retiroReferencias.test.js` — modificado.
- `backend/test/schemaCompatibility.test.js` — modificado.
- `docs/API.md` — modificado.
- `docs/BASE_DATOS.md` — modificado.
- `frontend/src/App.jsx` — modificado.
- `frontend/src/components/TimelineControles.jsx` — modificado.
- `frontend/src/pages/ExpedientePaciente.jsx` — modificado.
- `frontend/src/pages/NuevoControl.jsx` — modificado.
- `frontend/src/utils/accessRules.js` — modificado.
- `backend/src/db/migrations/027_seguimiento_notas_controles.sql` — nuevo.
- `backend/src/repositories/seguimientoNotasRepository.js` — nuevo.
- `backend/src/routes/seguimientoNotas.js` — nuevo.
- `backend/src/services/seguimientoNotasService.js` — nuevo.
- `backend/src/validations/seguimientoNotas.schemas.js` — nuevo.
- `backend/test/helpers/seguimientoNotasBrowser.js` — nuevo.
- `backend/test/seguimientoNotas.test.js` — nuevo.
- `backend/test/seguimientoNotasPostgres.test.js` — nuevo.
- `docs/CPREN_119_SEGUIMIENTO_NOTAS_CONTROLES.md` — nuevo.
- `frontend/src/components/SeguimientoNotaEstado.jsx` — nuevo.
- `frontend/src/hooks/useSeguimientoNotas.js` — nuevo.
- `frontend/src/pages/SeguimientoNotasControl.jsx` — nuevo.
- `frontend/src/pages/seguimiento-notas.css` — nuevo.
- `frontend/src/utils/seguimientoNotas.js` — nuevo.
- `frontend/test-dom/seguimientoNotas.test.jsx` — nuevo.


## Resultados comprobados al cierre

| Verificación | Resultado |
| --- | --- |
| Backend completo, npm test | 1401 totales: 1347 aprobadas, 0 fallos, 54 omisiones opt-in |
| Integración CPREN-119 PostgreSQL 18.3 + Chrome real | 18 aprobadas, 0 fallos/omisiones |
| Regresión CPREN-118 PostgreSQL temporal | 20 aprobadas |
| Regresión CPREN-117 PostgreSQL temporal | 15 aprobadas |
| Regresión CPREN-116 PostgreSQL + Chrome escritorio/móvil | 13 aprobadas |
| Regresión CPREN-115 PostgreSQL temporal | 9 aprobadas |
| Frontend completo | 188 lógicas y 241 DOM aprobadas (23 archivos DOM) |
| Revisión final de texto/contexto de seguimiento | 15 DOM específicas repetidas y aprobadas |
| Frontend lint y build | Correctos; compilación local, sin despliegue |
| git diff --check | Correcto |
| Limpieza PostgreSQL temporal | 0 directorios, 0 procesos y 0 conexiones en 55475–55479 |
| Seguridad e inventario | 28 archivos de CPREN-119; sin secretos ni archivos ajenos detectados |

Las 54 omisiones son las 53 opt-in anteriores y la nueva raíz de integración
CPREN-119. Las integraciones 115–119 se ejecutaron aparte, cada una en su propio
clúster desechable. No se habilitaron las suites históricas de destino configurable.
El navegador opcional de CPREN-116 inicialmente omitido se ejecutó después y pasó.

Hubo un fallo de infraestructura al ejecutar Vitest bajo el TEMP efímero del
sandbox (ENOENT). Se repitieron las suites con un TEMP estable y aprobaron.
También se corrigieron aserciones de pruebas nuevas (tabla auditoria_eventos y
contrato plano de notas), dos selectores DOM de prueba y los inventarios explícitos
de tablas/migraciones. El prefijo original de schema.sql quedó preservado byte a
byte, sin modificar 021. No se identificó un defecto pendiente en esos casos.
Persiste el aviso informativo preexistente de caniuse-lite antiguo; no se
actualizaron dependencias fuera de alcance.

La cobertura nueva verifica control/cita conservados, históricos incluso tras
UPDATE/UPSERT, profesión sin inferencia textual, AE/EP/médico/externo, responsable
separado de quien confirma, principales de ambos tipos y notas adicionales,
versiones/replay, dos sesiones con decisiones distintas (200/409), privacidad
entre tipos (respuesta de enfermería idéntica antes/después de decisión médica),
IDOR y lotes, CSRF, revocación/inactividad, auditoría y rollback, lectura de embarazo
cerrado, instalación nueva y migración incremental idempotente. Chrome real cubre
1440 y 390px, foco accesible tras guardar, un solo POST por control, confirmación,
abandono y recuperación desde expediente tras recarga; sin overflow horizontal.

Reproducción segura de la integración nueva desde backend (requiere binarios
PostgreSQL locales y Chrome de Puppeteer ya instalados):

```powershell
$env:RUN_SEGUIMIENTO_TEMP_POSTGRES='1'
$env:RUN_SEGUIMIENTO_BROWSER='1'
$env:SEGUIMIENTO_POSTGRES_BIN='C:\Program Files\PostgreSQL\18\bin'
node --test test/seguimientoNotasPostgres.test.js
```

La prueba no acepta URL/host de base de datos; crea su único destino local y
comprueba data_directory. La variable del binario solo selecciona ejecutables.

## Riesgos, límites y CHECKPOINT-05

- No hay editor ni PDF en esta entrega; el usuario ve información real y puede
  confirmar seguimiento, pero la captura narrativa desde React requiere CPREN-120.
- No se reemplazan ni eliminan confirmaciones por la API; una corrección futura
  requiere mecanismo explícito y auditado. La identidad real de la nota sigue
  siendo la almacenada por CPREN-118, separada del profesional previsto.
- Usuarios/cargos históricos conservan sin_clasificar; el CAP debe validar
  clasificaciones y permisos antes de una activación real. Ningún permiso se
  concedió fuera de fixtures sintéticos de clústeres temporales.
- El criterio es inserción nueva posterior a 027, no fecha de atención. Una futura
  importación de controles antiguos deberá diseñar su tratamiento de elegibilidad.
- Continúa la validación funcional del CAP; CPREN-119 queda En revisión en Jira.

Preparación CHECKPOINT-05: comparar los 28 archivos con este inventario, revisar
migración 027 y su checksum, confirmar migraciones previas y controles/citas
intactos, revisar diff/seguridad/pruebas y recién entonces pedir autorización
expresa de commit/push. No preparar el índice ni publicar durante esta sesión.

Git al cierre: rama CPREN-119, HEAD/base
`e61979c2b6f5817c7853cbb47d075132d381ffdd`, sin upstream nuevo, índice vacío y
28 archivos locales sin commit. Main conserva
`e07cef00f0a20931bf92e7f8f00eed2ae25d23e0`.
No hubo conexiones a AWS/n8n/producción, migraciones persistentes, merge, PR,
commit, push ni despliegue. CPREN-120 no ha comenzado.
