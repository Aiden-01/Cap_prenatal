# Snapshot de evidencia V1

Solo `/run/cap-prenatal-backup-evidence/snapshot.json`, publicado por `publisher.py` sin argumentos. No se acepta ruta, unidad, comando ni destino desde CLI, eventos, API o variables de entorno del publicador. La inyección de directorios en funciones Python existe únicamente para pruebas; la entrada privilegiada siempre usa constantes y exige Linux/root.

## Estructura cerrada

| Campo | Regla |
|---|---|
| schema_version | Entero1; bool no aceptado |
| generated_at | Fecha UTC ISO8601 con +00:00; fecha de publicación, no del respaldo |
| window | start_at/end_at UTC, siete días exactos; corte end_at hasta30s antes de publicación |
| window.history_status | Exclusivamente retention_unproven; una consulta correcta no prueba retención continua |
| unit | run_id, started_at, finished_at, active_state, result, exit_status |
| executions | Hasta128 objetos; cada uno solo event/proof |

`unit.run_id` es un ID systemd hexadecimal de32 caracteres, o null junto con fechas null si no existe última invocación. active_state normaliza active/activating/deactivating/reloading como active; inactive y failed se conservan. result solo success/failed y exit_status entero0–255. Fechas coherentes y sin finalización para una unidad todavía activa. Esta normalización no cambia el servicio consultado.

`event` conserva el esquema actual de `event.schema.json`, restringiendo el destino a gdrive y el run_id a32hex; no admite MISSED_BACKUP proveniente del publicador. Sus fechas son las de ejecución, dentro de la ventana, no la fecha de generación del archivo. No se admiten IDs duplicados, ejecuciones posteriores a la última iniciada según systemd ni orden temporal regresivo.

`proof` contiene únicamente siete booleanos: start, local_validation, hash_match, finalize, existence, success y end. El publicador deriva estos campos de marcadores ordenados del journal; hash_match de event requiere coincidencia de SHA256 local/remoto encontrada en memoria. Solo con todas las etapas, hashes coincidentes y terminación conocida se permite external_verified=true. El lector revalida esa equivalencia y el método de verificación. La prueba es evidencia del script de respaldo: no es una llamada nueva a Drive ni una restauración.

El snapshot no exporta mensajes, nombres de archivos/dumps, checksums, cursores del journal, rutas de datos, destinatarios, tokens ni datos clínicos. El journal de entrada admite solo timestamp, MESSAGE e InvocationID, más los metadatos obligatorios de JSON de journalctl; estos últimos se validan y descartan. Mensajes del manager sin InvocationID se descartan y nunca verifican un respaldo. Campos desconocidos, arrays/null en lugar de texto, claves duplicadas y exceso de límites invalidan la publicación completa. No se intenta normalizar datos ambiguos para aparentar éxito.

## Límites y frescura

Compatibilidad journalctl255: se admiten además `__SEQNUM` (cadena decimal canónica ASCII de uint64,0–18446744073709551615) y `__SEQNUM_ID` (cadena de32 dígitos hexadecimales en minúscula). Son metadatos opcionales para conservar entradas/versiones sin esos campos; si aparecen, se validan antes de descartar el registro del manager o derivar eventos. No se aceptan números JSON, arrays, objetos, null, signos, espacios, desbordamientos o IDs de otro formato. No entran en snapshot/eventos ni cambian su contrato. Otros campos desconocidos siguen rechazados. Formato contrastado con el [serializador oficial de systemd v255](https://github.com/systemd/systemd/blob/v255/src/shared/logs-show.c#L1027) y [sd_journal_get_seqnum](https://www.freedesktop.org/software/systemd/man/latest/sd_journal_get_seqnum.html).

- Consulta fija a cap-prenatal-backup.service; dos lecturas de metadatos iguales, antes/después del journal. Si cambian, no se reemplaza el snapshot anterior.
- Deadline global del colector25s, con kill/wait de hijo al agotarse; unidad propuesta TimeoutStartSec30s. Sin shell, stdin ni stderr crudos, entorno del subproceso mínimo y ejecutables absolutos.
- Journal máximo2MiB,4096 registros y16KiB por línea; se solicita4097 para detectar truncamiento por cantidad. Sobrepasar un límite falla, no recorta silenciosamente.
- Snapshot máximo262144 bytes y128 ejecuciones. UTF8 estricto, sin NaN, Infinity, claves duplicadas ni campos extra.
- Antigüedad máxima180s y tolerancia futura5s. La última fecha aceptada se conserva en SQLite y se rechaza retroceso/replay anterior. Una publicación repetida con la misma fecha puede ser idempotente.
- La propuesta de publicación es cada60s después de terminar; el observador mantiene su intervalo300s. Una caída puede detectarse hasta un ciclo del observador más tarde; no se promete notificación instantánea.

## Historial y ausencia programada

No se declara que siete días de registros estén completos: puede haber rotación o pérdida de entradas intermedias. Los eventos positivos comprobables se aplican; las ausencias antiguas no se reconstruyen de un hueco. Si la última publicación previamente aceptada es anterior al inicio de la ventana nueva, `evidence_history_gap=REVIEW_REQUIRED` queda persistido para conciliación.

Se conserva `_check_slot` y las tolerancias5/35min, pero en modo snapshot solo se evalúa la ventana actual con evidencia independiente: metadatos systemd frescos cuya última ejecución iniciada es anterior al slot actual, o una ejecución actual activa/incompleta con marcador de inicio positivo. La identidad del último inicio procede de dos lecturas coherentes de la unidad; no de inferir que un journal vacío significa que no hubo respaldo. Sin última ejecución conocida no se infiere ausencia.

Si se pierden los mensajes de la invocación reciente, el publicador emite UNKNOWN/EVIDENCE_MISSING para esa ejecución, nunca verificado. Snapshot ausente, inaccesible, viejo, corrupto o replay no aplica eventos ni llama a comprobación de horarios; solo registra OBSERVATION_UNAVAILABLE en meta y salida sanitizada. Incidentes/outbox existentes permanecen intactos. Este estado de salud requiere supervisión independiente: no se añadió otro correo o contrato de despacho al workflow para avisar sobre él.

Este límite conservador puede dejar huecos históricos pendientes de revisión; no los presenta como comprobados. No añade política de reenvío, cambios a filtros de negocio ni una nueva prueba de disponibilidad externa.

## Frontera de archivos

En Linux se exigen directorio y ancestros root-owned sin escritura para grupo/otros, sin enlaces simbólicos. El lector exige archivo regular root-owned0640 y un solo enlace. Usa descriptores de directorio, O_NOFOLLOW y apertura no bloqueante para no seguir enlaces o quedar bloqueado en un FIFO. La publicación valida un destino preexistente, bloquea el descriptor de directorio, crea un temporal impredecible con O_EXCL/O_NOFOLLOW, escribe/fsync, reemplaza atómicamente y fsync del directorio. Ante fallo anterior al replace se conserva el archivo anterior y se retira solo el temporal propio. Un fallo del fsync final significa durabilidad incierta, aunque el nuevo snapshot visible sea válido.

Root no confiable queda fuera del modelo: quien controla código privilegiado o filesystem puede falsificar evidencia. No hay firma criptográfica que sustituya permisos de propietario. El modo portable sin comprobación de propietario solo se utiliza en directorios sintéticos de las pruebas Windows; la entrada productiva nunca lo permite.

Comportamiento de JSON contrastado con la [documentación oficial de journalctl](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html#--output-fields=). Esto no equivale a ejecutar el colector en Ubuntu255: el ensayo Linux de compatibilidad sigue pendiente.
