# CPREN-91 — Fase 2: monitor local de respaldos

Implementación local para revisión. **No instalada en Ubuntu, sin importaciones n8n, activaciones ni correos reales.** No modifica los seis workflows clínicos, los respaldos, rclone ni servicios existentes. No utiliza Docker ni dependencias Python adicionales.

## Arquitectura implementada

`systemd/journald (lectura) → observador Python → SQLite exclusiva → API loopback → workflow n8n → Resend → ACK`

Dos procesos independientes: `observe` registra resultados aunque n8n esté detenido; `serve` expone solamente reclamación y confirmación. Ambos usan `monitor.sqlite`, nunca PostgreSQL clínico ni la base interna de n8n. Los procesos de pruebas locales terminan al finalizar los tests. Importar `monitor.py` no inicia procesos ni servidores.

El lector Linux ejecuta únicamente `journalctl --unit=cap-prenatal-backup.service` y `systemctl show` con argumentos fijos, sin shell. No ejecuta el script de respaldo ni rclone, ni abre dumps o sus credenciales. Este lector se comprobó mediante respuestas simuladas de subprocess, **no mediante ejecución real en Ubuntu durante Fase 2**.

La fuente auditada en Fase 1 es un respaldo diario a las **02:00 America/Guatemala**. El proceso de observación tiene una cadencia inicial de 300 segundos; `--interval`, `--start-grace` (5 minutos) y `--finish-grace` (35 minutos) son configurables. No altera el timer original. Guatemala usa UTC−06, independiente de la zona horaria de Windows; se prueban cambios de mes y año.

## Clasificación y evidencia

| Evento observado | Evidencia |
|---|---|
| `OK` | Validación local, SHA-256 local/remoto coincidentes, confirmación de hashes, movimiento, comprobación final y mensaje específico de éxito |
| `DUMP_FAILED` | Fallo durante generación/validación local |
| `TRANSFER_FAILED` | Fallo al preparar, transferir o finalizar el objeto externo |
| `DESTINATION_UNAVAILABLE` | Autenticación o conectividad categorizadas, sin copiar el error crudo |
| `VERIFY_FAILED` | Hash distinto o fallo en una etapa de verificación |
| `MISSED_BACKUP` | Ausencia desde 02:05 o ejecución incompleta al alcanzar 02:35 |
| `INCOMPLETE` | Ejecución sin resultado terminal; no se alerta antes del plazo |
| `UNKNOWN` | No existe evidencia suficiente, incluso si el código de salida fue cero |

`inactive/dead` es normal para un servicio oneshot y no genera una alerta por sí mismo. `pg_restore --list` no se confunde con una restauración integral. El método `sha256_readback_temp_then_move_and_lsf` describe exactamente el nivel de evidencia del script actual: hash de la copia temporal recuperada, movimiento y comprobación final existente. **No afirma una nueva consulta stat ni disponibilidad actual de Drive.** No se ha reforzado el script productivo en esta fase.

Si la copia externa quedó verificada pero falló la limpieza local, se conserva `OK` con `reason_code=CLEANUP_FAILED` en el historial. Esta advertencia no abre un incidente de pérdida de respaldo. La primera versión no envía alertas independientes de limpieza.

Si falla la lectura del observador se intenta registrar `UNKNOWN`, sin inventar una ejecución omitida ni copiar excepciones. Si falla también SQLite no puede persistir esa alerta: queda un mensaje fijo `OBSERVATION_UNAVAILABLE` y se requiere vigilancia independiente del host.

## Contratos

`event.schema.json` define la observación v1. `validate()` aplica además coherencia de fechas, enums y evidencia; rechaza campos desconocidos. Los logs crudos son entradas transitorias y se descartan. No se almacenan nombres de archivos, datos clínicos, tokens ni texto libre de errores.

Cada observación contiene identidad de ejecución, turno esperado, fechas con zona explícita, `destination_type`, etapa, tipo, causa y evidencia booleana. `OK` es silencioso; `RECUPERADO` es una transición de incidente, no un resultado inventado del job.

La entrega a n8n contiene un `alert` con `event_id`, `incident_id`, `kind` (`ALERTA`/`RECUPERADO`), tipo/causa, destino, fecha del evento, apertura del incidente y última copia verificada. La respuesta de reclamación añade un `claim_id` operativo y una clave de idempotencia determinista. El claim no es una credencial de acceso: la API exige autenticación por separado. El cuerpo destinado a Resend se genera de manera determinista y no incluye el claim ni secretos.

`destination_type` admite `gdrive` y `external_hdd`. **Solo existe el adaptador de lectura de Google Drive basado en logs.** El workflow rechaza por ahora entregas HDD. Para un adaptador futuro deberán verificarse UUID/identidad del dispositivo y montaje correcto, espacio libre, archivo final presente, lectura/hash del destino, staging/rename y persistencia durable. Un directorio del SSD sin el disco montado no será un destino válido. El método de evidencia HDD deberá incorporarse y probarse antes de habilitarlo; no basta con cambiar el enum. CPREN-71 a CPREN-80 permanecen bloqueadas.

## SQLite y consistencia

`schema.sql` crea exclusivamente:

- `meta`: línea base de primera inicialización, última copia verificada y heartbeat del observador.
- `runs`: historial de observaciones sanitizadas por ejecución/turno.
- `incidents`: identidad, apertura, cierre y ejecución de recuperación; un incidente abierto para este único job/destino.
- `outbox`: mensaje inmutable, estado, vencimiento de reclamación, intentos, aceptación del proveedor y revisión manual.

Estados: `pending`, `claimed`, `confirmed`, `uncertain`. WAL, claves foráneas y `BEGIN IMMEDIATE` protegen reclamaciones y ACK entre conexiones. No se utiliza workflow static data como cola ni se escribe por SQL en las tablas internas de n8n.

La línea base se conserva después de reinicios. Los incidentes previos a la primera inicialización quedan como historia y no generan correos retroactivos. Los turnos omitidos después de esa línea base se reconcilian tras una caída del observador. Un éxito nuevo evita abrir posteriormente una alerta por un hueco histórico ya superado. Los fallos repetidos pertenecen al mismo incidente abierto, con una sola alerta; los cambios de causa se conservan en `runs`, sin modificar el mensaje ya preparado.

Una recuperación exige una nueva ejecución iniciada después de abrir el incidente y evidencia externa válida. El éxito sin hashes no cierra nada. Se genera una única recuperación y esta espera la aceptación de la alerta original, incluso si la conectividad se recuperó antes de notificar. Si la alerta queda pendiente de conciliación manual, su recuperación permanece retenida para conservar el orden.

### Resultado incierto y reintentos

La reclamación dura 180 segundos; el workflow tiene un límite de 60 segundos y sus solicitudes HTTP, diez segundos. Una reclamación vencida se considera incierta. Las siguientes reclamaciones conservan el mismo mensaje y `Idempotency-Key`; solo cambia el claim operativo. No hay reintentos automáticos en el nodo Resend.

La cola aplica backoff a resultados inciertos y un máximo de seis intentos, incluyendo reclamaciones cuyo resultado no llegó. Se reserva una holgura de 120 segundos antes del límite de 24 horas contado desde la primera reclamación: al alcanzarla, o al agotar intentos, queda `uncertain/manual_review=1`, sin más reenvíos automáticos. El plazo comienza antes del primer envío, de forma conservadora.

Un ACK aceptado es transaccional e idempotente; un claim incorrecto o vencido se rechaza. Si Resend acepta y se pierde el ACK, la siguiente ejecución vuelve a usar la misma clave. Esto reduce duplicados dentro de la ventana del proveedor; **no promete entrega exactamente una vez**. Los errores del nodo se tratan conservadoramente como inciertos, incluidos errores permanentes: requieren revisión al agotar el límite. La conciliación manual con el proveedor y su procedimiento operativo siguen pendientes de aprobación; no se ofrece un endpoint de reenvío forzado.

## Interfaz restringida

Escucha exclusivamente en `127.0.0.1:8766`. Autenticación `Authorization: Bearer ...` con secreto URL-safe de 32–128 caracteres, suministrado fuera de Git mediante `CAP_BACKUP_MONITOR_TOKEN`. No se genera, guarda ni muestra ninguna credencial en esta fase. El operador deberá crearla y vincularla posteriormente por un canal privado.

| POST | Cuerpo | Resultado |
|---|---|---|
| `/v1/claim` | `{}` | Alerta reclamada o `{"alert":null}` |
| `/v1/ack` | `event_id`, `claim_id`, `provider_id` | Confirmación de aceptación |
| `/v1/uncertain` | `event_id`, `claim_id` | Resultado pendiente con backoff |

Sin rutas arbitrarias, consultas SQL recibidas, comandos, dumps, recepción de logs ni acceso a archivos elegido por el cliente. Solo JSON de hasta 2 KiB; tiempo de lectura acotado; respuestas sin caché y errores sanitizados. No registra cabeceras ni cuerpos. No tiene CORS ni exposición por Nginx.

La ejecución futura deberá usar un directorio propio privado, archivo `monitor.sqlite`, permisos Unix restrictivos y ACL Windows equivalentes cuando corresponda. No apuntar a bases existentes. La CLI exige ese nombre y un directorio ya existente. La API y el observador deben compartir únicamente el almacenamiento del monitor. No se amplían grupos ni se concede a n8n lectura de dumps/rclone. La identidad del observador y el acceso mínimo a journald deben aprobarse y verificarse en Ubuntu; no se instala un servicio root ni se habilita sudo genérico.

## Workflow versionable

`n8n/workflows/monitoreo-respaldos-externos-v1.json`:

`Cada cinco minutos → Reclamar alerta → Preparar alerta → Enviar alerta por Resend → Confirmar aceptación`

La salida de error de Resend va a `Registrar resultado incierto`. Una cola vacía termina antes de Resend. Un fallo de render, de transporte API o de ACK deja vencer el lease; no pierde el evento. Está inactivo, sin versión publicada, sin ID productivo y sin referencias a credenciales concretas.

Destino privado: `CAP_BACKUP_ALERT_RECIPIENT`, suministrado fuera del repositorio al proceso API. No existe destinatario real ni fallback en el JSON. `alerts@example.invalid` se reserva para pruebas. From preparado: `CAP Prenatal <citas@notificaciones.hercor-nexus.com>`. Asuntos exactos `[CAP Prenatal][RESPALDOS][ALERTA] Google Drive` y `[CAP Prenatal][RESPALDOS][RECUPERADO] Google Drive`. Sin CC/BCC/adjuntos ni datos clínicos. HTML V2 reutilizado desde `components.cjs` sin modificar ese archivo; contraste `#5D727C`, tildes y ñ preservados, sin emojis. Se sustituye exclusivamente en esta plantilla nueva el aviso de maqueta por una leyenda técnica; no se afirma que los eventos reales sean ficticios.

`build-workflow.cjs` genera el JSON sin importar n8n ni ejecutar transporte; `--check` exige coincidencia exacta. Antes de una futura importación habrá que vincular la credencial `Resend account 2` y una Header Auth privada para los tres nodos API. No se copian IDs ni secretos de producción. La implementación del Code se prueba en VM; **no se declara verificado el workflow completo en el runtime de n8n**.

## Pruebas ejecutadas y límites

Desde la raíz del repositorio:

```text
python -B -m unittest discover -s operations/backup-monitor -p test_monitor.py -v
node operations/backup-monitor/build-workflow.cjs --check
node --test operations/backup-monitor/workflow.test.cjs
```

Se usan únicamente fixtures, bases SQLite temporales, respuestas systemd simuladas y un servidor loopback efímero que se cierra al finalizar. El ensayo de extremo a extremo reclama una alerta por HTTP, ejecuta el Code V2 en Node VM, simula Resend con deduplicación, simula respuesta perdida y confirma por HTTP; después procesa una recuperación. Nunca llama al proveedor ni consulta datos clínicos.

Se comprueba también: cero como evidencia insuficiente, autenticación/red/hash fallidos, ausencia/incompletitud, cambio de año y zona, recuperación válida, incidentes duplicados, transacciones, ACK repetido/vencido, exclusión entre conexiones, reinicios, reintentos finitos, margen de 24 horas, validación y ausencia de filtraciones/emojis. Los seis JSON clínicos y componentes se comparan byte a byte mediante SHA-256 contra `origin/main`.

El primer intento de Python quedó bloqueado por permisos del sandbox sobre directorios temporales/SQLite. Se repitió fuera de esa restricción con autorización de herramienta; el ensayo siguió limitado a fixtures y loopback. Los resultados finales constan en `evidence/`.

Resultado final: **31 pruebas Python + 9 pruebas Node = 40 exitosas, cero fallidas**. `verify.cjs` registra los hashes de los siete archivos protegidos y genera un manifiesto de los archivos nuevos. `evidence/alert.html` y `evidence/recovery.html` son vistas previas con eventos técnicos ficticios, no mensajes enviados ni evidencia de un incidente real.

## Pendiente de autorización

- Revisión del código, contrato, política de alertas históricas y límites de reintentos.
- Ensayo real del lector systemd/journald en un host autorizado y de las ramas del workflow en n8n aislado con transporte simulado; la Fase 2 no usa Ubuntu como laboratorio.
- Preparación de permisos mínimos, credencial local, directorio privado, unidades de servicio y supervisión independiente del observador/host. Si todo AWS cae, la cola no puede avisar hasta recuperar el host; se necesita un heartbeat externo autorizado para cubrir ese intervalo.
- Probar conciliación manual, durabilidad/recuperación del almacenamiento y operación tras disco lleno; el test de transacciones no equivale a un ensayo de corte eléctrico.
- Respaldo/rollback y ventana autorizada para instalar, importar y probar envío. Ninguno de esos pasos está ejecutado ni autorizado por este entregable.

No se actualizó la verificación remota productiva, no se instalaron servicios/timers ni se cambió rclone. Los seis workflows existentes no se importaron, ejecutaron o activaron. No se realizaron commits, push, merge ni despliegues. CPREN-91 se entrega para revisión, sin avanzar a otra fase.

## Revisión posterior de Fase 3

La validación real encontró que el nodo Resend puede devolver un error por la salida normal. El workflow incorpora ahora una condición explícita de ID válido antes del ACK; una respuesta sin ID queda incierta. El HTML V2 permanece idéntico. Las 40 pruebas anteriores son evidencia histórica de Fase 2; las regresiones y ejecuciones reales de Fase 3 se documentan separadamente en `phase3/README.md`.

## Corrección de privacidad Fase 5A

El destinatario se configura exclusivamente en el entorno privado de la API, mediante `CAP_BACKUP_ALERT_RECIPIENT`. El operador debe autorizar esa única dirección y proteger el archivo de configuración fuera del checkout (por ejemplo, EnvironmentFile privado, aún no instalado). La sintaxis válida no prueba propiedad del buzón: su autorización corresponde al operador. n8n recibe `recipient` solo en la respuesta de `/v1/claim` autenticada en loopback; Code valida forma, dirección única y contrato cerrado antes de Resend. No acepta destinatarios en eventos ni solicitudes. No configurar esta variable en el JSON ni usar fallback. La API no realiza envíos.

Si falta configuración o es inválida, claim devuelve HTTP503 sanitizado sin consumir intentos ni reclamar eventos. La ruta del destinatario queda fijada en la SQLite privada para cada evento en su primera reclamación HTTP; cambiarla con un envío pendiente bloquea el reintento y exige revisión, conservando payload y clave de idempotencia. No se modifica el HTML, remitente ni guardia de ID antes de ACK. Un actor con acceso de escritura a configuración privada o edición del workflow pertenece al límite de confianza del operador; no existe autorización de destinatario mediante parámetros públicos.

La instantánea anterior al IF contiene una redacción explícita del destinatario, conservando su original privado fuera de Git. Los reportes de Fases 2/3 se conservan como historia, no prueban esta nueva versión. Los hashes vigentes y resultados de Fase 5A están en `phase5a/`. `verify.cjs` es un generador histórico de Fase 2: no usarlo para reemplazar sus evidencias; usar el manifiesto de Fase 5A para el árbol actual.
