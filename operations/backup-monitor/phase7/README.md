# CPREN-91 — Fase 7: publicador restringido y observador adaptado

Implementación para revisión, no desplegada. Base de comparación `fabc24af76c9f2b3da99f60cdd3d834e2ad39cd7`, rama `codex/cpren91-backup-alerts`, PR#3 Draft. El usuario autorizó finalizar/versionar el desarrollo y actualizar ese PR; no autorizó merge ni instalación. No se ejecutó SSH ni se consultó Ubuntu en este desarrollo. Las auditorías privadas de Fase6 y la propuesta cancelada de Fase8 permanecen locales, excluidas de Git. El resumen sanitizado de Fase6 se publica en `evidence/phase6-summary.json`.

## Arquitectura implementada

1. `publisher.py`: único componente privilegiado propuesto. Consulta solo journal/metadatos de la unidad fija del respaldo, con ejecutables absolutos y límites. Publica un snapshot validado y sanitizado en ruta fija, mediante `evidence_snapshot.py`. Sin argumentos de CLI, credenciales, SQL, rclone, Drive, Resend o ejecución del script de respaldo.
2. `monitor.py observe --snapshot`: consume el archivo protegido, valida todo el contrato antes de aplicar eventos y registra su frescura/estado en meta. El nombre Python histórico `read_systemd` es solo un adaptador al snapshot; ya no ejecuta comandos. La opción CLI directa `--systemd` se retiró, no se redirige silenciosamente a un journal sin permisos. `--fixture` sigue limitado a ensayos sintéticos y no aparece en las unidades propuestas.
3. API existente, misma identidad dedicada futura que el observador y SQLite común privada. Transporte/API, destinatario privado, deduplicación, recuperación, reclamaciones y guardia de ACK no cambian. El workflow V1 n8n, su remitente, HTML y conexiones son idénticos al commit aprobado.

El contrato completo, fechas, pruebas y límites están en `CONTRACT.md`. Una publicación correcta no demuestra un respaldo correcto. Una pérdida de observabilidad no constituye por sí sola un MISSED_BACKUP. El estado `observer_status=OBSERVATION_UNAVAILABLE` no modifica incidentes ni outbox previos, y permanece visible para supervisión operativa futura; no se añadió un nuevo envío automático.

## Configuraciones de referencia, no instaladas

Cuatro archivos en `systemd/`: publisher oneshot+timer, observer y API. Requieren instalación revisada bajo `/opt/cap-prenatal-backup-monitor`, código/schema root-owned no escribibles por el usuario del monitor; ninguna propuesta modifica servicios existentes.

| Componente | Identidad/red | Lectura y escritura propuestas |
|---|---|---|
| Publicador | root:cap-backup-monitor, NoNewPrivileges, capacidades vacías, red privada y AF_UNIX | Journal/systemd y código de solo lectura; escritura únicamente runtime de evidencia; ni respaldos ni perfiles n8n |
| Observador | cap-backup-monitor, sin grupos privilegiados, sin red IP | Snapshot de solo lectura; estado0700 y SQLite/WAL/SHM0600 con umask0077 |
| API | Mismo UID/GID, loopback compartido con n8n, AF_INET/UNIX; bind fijo127.0.0.1:8766 en código | Mismo estado; EnvironmentFile privado separado; no journald ni dumps |

El publicador crea RuntimeDirectory root:grupo-monitor0750, preservado entre ejecuciones; archivo0640. Como la unidad usa Group=cap-backup-monitor, el temporal hereda el grupo efectivo y se ajusta a0640 después de UMask0077. El monitor solo puede leer ese directorio; no reemplazar snapshots. El código y sus imports deben estar bajo propiedad root, nunca en un checkout escribible por cap-backup-monitor. Python usa -E -s -B para ignorar variables Python/user-site y no generar bytecode en instalaciones de solo lectura.

Observer/API comparten una identidad estática futura y StateDirectory0700. No se concede acceso a cap-n8n, adm o systemd-journal. No se crean cuentas en esta fase. La identidad compartida no proporciona separación de secretos entre sus procesos; siguen en el mismo dominio de confianza. El archivo `/etc/cap-prenatal-backup-monitor/api.env` debe ser root0600 y contener solo configuración privada autorizada; no se preparó un archivo real ni se incluyó un destinatario personal. La configuración privada existente continúa sin cambios.

La API conserva PrivateNetwork=no: cambiarla a yes la separaría del loopback de n8n. IPAddressDeny/Allow y sandboxing son propuestas que requieren soporte/validación Linux; el bind y la autenticación se mantienen en el código. Los límites128M/TasksMax/NOFILE y el hardening no se declaran dimensionados para producción: hay que verificar picos, helpers de systemctl y concurrencia. NoNewPrivileges se mantiene sin excepciones sudo; el publicador se inicia como servicio propio, no desde el observador.

## Pruebas y evidencia

`evidence/results.json` registra resultados actuales, omisiones y comparaciones. `files.json` contiene rutas/hashes de la lista cerrada de desarrollo publicable; omite su propio hash para evitar circularidad. `verify.cjs` funciona desde un checkout limpio de esta rama con la base aprobada disponible y no depende de rutas privadas de la PC. Los reportes históricos de Fases2/3/5A no se sobrescriben para aparentar que probaron este código.

Resultado final: **67 pruebas Python:65 correctas,2 omitidas,0 fallidas;11 pruebas Node correctas**. Generador reproducible, comparación AST de Store/API y reglas previas idéntica, cuatro unidades comprobadas estáticamente. No se ejecutó systemd-analyze ni n8n real en esta fase; las pruebas de Code utilizan el JSON exacto en VM Node con API loopback real y aceptación de proveedor simulada.

Ejecutar localmente:

```text
python -B -m unittest discover -s operations/backup-monitor -p "test*.py" -v
node --test --test-reporter=tap operations/backup-monitor/workflow.test.cjs
node operations/backup-monitor/build-workflow.cjs --check
```

El ensayo Python cubre publicación/lectura atómica en directorio temporal Windows, contrato/frescura, metadatos systemd simulados, datos corruptos/manipulados, permisos denegados simulados, prueba de enlaces por metadatos, límites/timeouts de subproceso simulados, rotación/historial incompleto, SQLite real sintética bloqueada/corrupta, ENOSPC simulado, reinicio/deduplicación/recuperación, caída de publicador sin pérdida de cola y proveedor simulado. Las regresiones existentes incluyen API loopback autenticada real, Code n8n en VM Node y ACK simulado. No son envíos ni una nueva ejecución del motor n8n.

Se actualizó una prueba heredada del lector: el propósito nuevo es comprobar ausencia de consultas directas a journald y delegación al snapshot, no exigir los comandos que se retiraron. Las demás reglas clínicas, store/API y pruebas de privacidad se conservan. Dos pruebas POSIX se omiten en Windows; el informe no las cuenta como correctas.

## Validación Linux pendiente y decisión vigente

El usuario **canceló expresamente el requisito de otra VM o laboratorio Linux**. No se creará ni utilizará Docker. Las comprobaciones que no se realizaron en Windows se trasladan a una ventana de instalación directa, supervisada y reversible del Ubuntu existente, todavía sin autorizar su ejecución. El [procedimiento operativo vigente](../DEPLOYMENT.md) sustituye las propuestas anteriores de laboratorio.

Pendiente para los checkpoints iniciales de esa ventana, antes de autorizar operación automática o correos:

1. Verificar parseo real de systemctl255/journalctl, JSON obligatorio y eventos manager, resultado del servicio oneshot activo y carreras durante terminación. El publicador solo leerá evidencia real de la unidad fija; no se reemplazará ni ejecutará el respaldo para forzar resultados.
2. Verificar unidades con systemd-analyze verify y preparar únicamente rutas/identidades de los componentes nuevos bajo autorización de la ventana. No habilitar servicios/timer al arranque ni modificar los existentes.
3. Probar RuntimeDirectory root:grupo0750, temporal/snapshot0640, ancestros, archivo FIFO/symlink/hardlink, directorio con symlink, carreras, locks de directorio, fsync y terminación a mitad de publicación. El propietario real de snapshot y WAL no se valida mediante un mock de Windows.
4. Validar dos procesos bajo el mismo UID dedicado: SQLite/WAL/SHM, recreación, SQLITE_BUSY, disco lleno real acotado y recuperación. Verificar que otro UID puede leer evidencia únicamente con grupo autorizado y no escribirla, y que cap-n8n no puede acceder a estado/configuración.
5. Comprobar API manualmente sin transporte de correo, HTTP401/400 y conectividad loopback; ausencia de listeners externos y sin salida IP del publicador/observador. No ejecutar workflows oficiales. Probar los filtros systemd reales y sus límites de recursos.
6. Probar reinicios del publicador, observer/API y host, expiración del snapshot, cola/ACK inciertos, monotonicidad y discontinuidad temporal. Los huecos antiguos de journal requieren conciliación, no un éxito o ausencia inventados.

Estos puntos no se consideran completados ni se exige crear otro laboratorio para integrarlos. Son puertas de parada de la instalación controlada: si fallan, no avanzar a automatización, importación o correo. Las dos pruebas POSIX continúan omitidas en los resultados Windows. La garantía de propietario no cubre un host/root comprometido y los marcadores del journal no sustituyen una restauración.

## Plan futuro y rollback

Tras revisión/autorización separada: seguir `DEPLOYMENT.md`, aprobar modelo de confianza/recursos y plan de supervisión externa, respaldar lo afectado y preparar recuperación verificable. Instalar solo componentes nuevos root-owned y cuentas/permisos aprobados, sin modificar respaldo diario, n8n existente, PostgreSQL, Nginx o Drive. La vinculación/importación inactiva del workflow nuevo y cualquier correo/activación son pasos independientes.

Antes de sustituir código/configuración del monitor, obtener copia consistente de SQLite por Backup API o con sus procesos detenidos en ventana aprobada, conservar WAL/SHM y eventos inciertos; no copiar una SQLite activa de forma aislada. Para el snapshot, validar el contrato de la nueva versión antes de reemplazar componentes y no volver a archivos viejos para eludir frescura. Si falla la instalación futura, detener solo las unidades nuevas y preservar estado/evidencia para conciliación; restaurar su código/configuración compatibles. No resetear outbox ni reenviar con nuevas claves. No revertir toda la SQLite n8n ni tocar servicios de respaldo como respuesta automática a un fallo del monitor.

## Alcance Git

Se modifican monitor.py, la prueba heredada test_monitor.py, README y las exclusiones documentadas. Se añaden evidence_snapshot.py, publisher.py, test_snapshot.py, esta carpeta phase7/ y DEPLOYMENT.md. Los archivos locales phase6/ y phase8/ se conservan sin publicar; no son entradas de instalación. Se versiona únicamente la lista cerrada indicada en checks.json. No se alteran schema.sql, lógica Store/API/credenciales/destinatario, workflow n8n V1, seis JSON clínicos ni components.cjs. Los nuevos commits y push se limitan a esta rama y el PR permanece Draft; no se modifica main ni se despliega. Temporales, SQLite, perfiles, respaldos y auditorías privadas permanecen fuera de Git.
