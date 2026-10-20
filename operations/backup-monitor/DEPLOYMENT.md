# CPREN-91 — Instalación directa controlada en Ubuntu

**Procedimiento preparado, no ejecutado.** La decisión del usuario elimina el requisito de crear otra VM o laboratorio Linux. No elimina las comprobaciones Linux: las dos pruebas POSIX siguen pendientes y las propuestas systemd no se han ejecutado. Se realizarán en una ventana productiva expresamente autorizada, con componentes nuevos sin correos, sin habilitación automática y con parada ante cualquier fallo. Publicar este PR Draft no autoriza merge o instalación.

## Alcance y puntos de parada

Se instalan únicamente cuatro archivos Python/SQL del monitor y cuatro unidades nuevas. No se modifica `cap-prenatal-backup.service`, su timer, `cap-prenatal-n8n`, PostgreSQL, Nginx, backend, rclone o los seis workflows clínicos. No se crean respuestas de respaldo ficticias para sustituir evidencia real; los ensayos sintéticos se limitan a directorios temporales de comprobación del nuevo componente, separados de su estado operativo.

Cada etapa requiere registrar resultado y detenerse si hay drift, conflicto, permiso inesperado, error de systemd/lector o impacto en servicios existentes. No relajar hardening, añadir grupos privilegiados, instalar paquetes o reiniciar otro componente automáticamente. No ejecutar de corrido todos los bloques. Los comandos son referencias para la futura ventana, **ninguno se ejecutó al preparar este documento**.

## A. Preflight de la futura ventana — solo lectura

1. Confirmar autorización de instalación y SHA exacto revisado del PR. Si aún no hay merge, no usar `main` como si contuviera estos cambios: preparar un paquete inmutable de ese SHA por un canal autorizado, sin hacer pull sobre el checkout productivo ni instalar otra aplicación.
2. Confirmar host CAP Prenatal con la conexión SSH existente y verificación del host. Repetir fecha/zona, versión Ubuntu/systemd/Python, estados/PIDs/arranques y hashes de las unidades existentes; comparar con el inicio de la ventana. Los datos de auditoría Fase6 son históricos, no prueba del estado actual.
3. Inspeccionar, sin valores de Environment, las unidades existentes y puerto8766 con `systemctl show`, `ss -ltn`, `stat`. El puerto debe estar libre y no tener proxy en Nginx. No abrir reglas de red ni modificar Nginx.
4. Confirmar ausencia de los nombres nuevos: usuario/grupo cap-backup-monitor, prefijo `/opt/cap-prenatal-backup-monitor`, estado `/var/lib/cap-prenatal-backup-monitor`, configuración `/etc/cap-prenatal-backup-monitor` y las cuatro unidades de `phase7/systemd/`. Comprobar también enlaces simbólicos colgantes. Si algo existe, detenerse y reconciliar su propietario/versión; no reutilizarlo o sobrescribirlo indiscriminadamente.
5. Verificar espacio/inodos/memoria, filesystem local y rutas reales de secretos/dumps que deben permanecer inaccesibles. No leer dumps, rclone.conf ni .env existentes. No crear cuentas hasta completar estos controles.

Comandos de consulta de ejemplo, con salida acotada:

```bash
date -Is
timedatectl show -p Timezone -p NTPSynchronized
systemctl --version
python3 --version
systemctl show cap-prenatal-backup.service cap-prenatal-backup.timer cap-prenatal-n8n.service nginx.service postgresql.service -p ActiveState -p SubState -p MainPID -p ExecMainStartTimestamp -p NRestarts
ss -ltn '( sport = :8766 )'
getent passwd cap-backup-monitor
getent group cap-backup-monitor
df -h /var/lib /run
df --output=target,itotal,iused,iavail,ipcent /var/lib
```

La ausencia de usuario/grupo da un código distinto de cero esperado; no interpretarla como fallo del servidor. No consultar `systemctl show -p Environment`, `/proc/*/environ`, credenciales n8n o datos clínicos.

## B. Respaldo y registro privado antes de escribir

Crear, solo con la autorización de la ventana, un directorio nuevo root0700 bajo `/var/backups/cap-prenatal-backup-monitor/<VENTANA_UNICA>`. No reutilizar un respaldo anterior. Registrar SHA del paquete, hashes/propietarios/permisos, recursos nuevos inicialmente ausentes y estados/arranques de servicios existentes. Guardar evidencia de cada cambio nuevo para poder retirarlo sin tocar otros recursos. No llevar esos archivos a Git/Jira.

La primera instalación no debe tener estado previo. Para una actualización futura del monitor, detener solo sus procesos nuevos en una ventana autorizada y respaldar conjuntamente el directorio de estado antes de sustituir código, o usar Backup API de SQLite si los procesos continúan activos. No copiar una SQLite viva ignorando WAL/SHM. El respaldo debe poder abrirse y pasar integrity_check en una copia privada independiente, sin enviar correos. Preservar siempre eventos y aceptaciones inciertas.

Esta etapa **no requiere copiar o modificar n8n**. Antes de una importación posterior sí deberá autorizarse un respaldo consistente de su instancia, credenciales cifradas, material de cifrado y archivos necesarios; una exportación del workflow no basta. No restaurar toda n8n como primer remedio de un fallo del monitor.

## C. Identidad y código nuevos — únicamente tras autorización

Después de confirmar que no hay colisiones, crear la identidad estática sin shell y sin grupos adicionales:

```bash
sudo groupadd --system cap-backup-monitor
sudo useradd --system --gid cap-backup-monitor --no-create-home --home-dir /var/lib/cap-prenatal-backup-monitor --shell /usr/sbin/nologin cap-backup-monitor
sudo install -d -o root -g root -m 0755 /opt/cap-prenatal-backup-monitor
sudo install -d -o cap-backup-monitor -g cap-backup-monitor -m 0700 /var/lib/cap-prenatal-backup-monitor
sudo install -d -o root -g root -m 0700 /etc/cap-prenatal-backup-monitor
```

Definir `CPREN91_SRC` como la raíz de un paquete revisado y verificado. No contiene `.git`, .env, SQLite, claves, perfiles, backups ni auditorías privadas. El paquete de código debe conservar los bytes del commit aprobado. Ejemplo de instalación explícita de archivos:

```bash
sudo install -o root -g root -m 0644 "$CPREN91_SRC/operations/backup-monitor/monitor.py" /opt/cap-prenatal-backup-monitor/monitor.py
sudo install -o root -g root -m 0644 "$CPREN91_SRC/operations/backup-monitor/evidence_snapshot.py" /opt/cap-prenatal-backup-monitor/evidence_snapshot.py
sudo install -o root -g root -m 0644 "$CPREN91_SRC/operations/backup-monitor/publisher.py" /opt/cap-prenatal-backup-monitor/publisher.py
sudo install -o root -g root -m 0644 "$CPREN91_SRC/operations/backup-monitor/schema.sql" /opt/cap-prenatal-backup-monitor/schema.sql
```

Comparar SHA256 de cada archivo con el paquete. Código y ancestros root-owned sin escritura para grupo/otros; nunca ejecutar código privilegiado desde un checkout escribible por el usuario del monitor. No usar pip/npm install. El runtime Python/SQLite de Ubuntu debe pasar la comprobación de versiones sin añadir dependencias.

El usuario compartido permite WAL/SHM0600 con UMask0077. No separa secretos entre API y observador: es el mismo dominio de confianza. No añadir cap-n8n a ese grupo ni a adm/systemd-journal/postgres.

## D. Configuración privada y verificación de unidades

Crear mediante canal privado/edición protegida `/etc/cap-prenatal-backup-monitor/api.env`, root:root0600, dentro del directorio0700. El operador suministra exclusivamente `CAP_BACKUP_MONITOR_TOKEN` y `CAP_BACKUP_ALERT_RECIPIENT` autorizados. Token URL-safe de32–128 caracteres y una dirección única válida; sin CC/BCC ni nombre de presentación. No hay valores reales de ejemplo en Git. No pasar secretos como argumentos, pegarlos en registros, usar N8N_ENCRYPTION_KEY o leer claves de SQLite. No configurar Resend todavía.

Verificar solo propietario/modo de ese archivo. systemd lo lee e inyecta al API; el usuario no necesita leerlo directamente. No añadir EnvironmentFile al publicador. Probar sintaxis de las cuatro unidades con rutas y usuario ya preparados:

```bash
sudo systemd-analyze verify "$CPREN91_SRC/operations/backup-monitor/phase7/systemd/cap-prenatal-backup-evidence.service" "$CPREN91_SRC/operations/backup-monitor/phase7/systemd/cap-prenatal-backup-evidence.timer" "$CPREN91_SRC/operations/backup-monitor/phase7/systemd/cap-prenatal-backup-observer.service" "$CPREN91_SRC/operations/backup-monitor/phase7/systemd/cap-prenatal-backup-monitor-api.service"
```

Si falla, detenerse antes de instalar unidades. No silenciar advertencias sobre privilegios, rutas, User/Group o restricciones incompatibles. Instalar explícitamente cada uno de esos cuatro archivos root:root0644 en `/etc/systemd/system/`, sin reemplazar nombres preexistentes. La posterior operación `systemctl daemon-reload` para cargar solo estas definiciones requiere autorización de la ventana; no reinicia servicios existentes. **No ejecutar enable, enable --now ni iniciar el timer**.

Las restricciones necesitan comprobación efectiva: publicador/observador tienen red privada y AF_UNIX; API conserva PrivateNetwork=no, solo loopback permitido y bind127.0.0.1:8766. NoNewPrivileges, capacidades vacías, ProtectSystem/Home, RuntimeDirectory/StateDirectory, memoria y límites de tareas son propuestas no probadas en Ubuntu. Un fallo no autoriza ampliar permisos en forma automática.

## E. Comprobación inicial sin correos ni automatización habilitada

**Punto de parada autorizado antes de iniciar cualquier unidad nueva.** El workflow n8n permanece sin importar y no hay transporte Resend en estos componentes.

1. Ejecutar manualmente una sola vez `systemctl start cap-prenatal-backup-evidence.service`. Este comando consulta el journal real y escribe solo evidencia nueva; no ejecuta el servicio de respaldo. El timer de evidencia permanece inactivo/disabled. Si falla el helper, no modificar el respaldo ni el journal para obtener un éxito: detener la prueba y revisar el resultado sanitizado.
2. Verificar `/run/cap-prenatal-backup-evidence` root:cap-backup-monitor0750 y snapshot root:cap-backup-monitor0640/un solo enlace. Comprobar ancestros sin symlinks ni escritura de grupo/otros. El grupo puede leer, no reemplazar el archivo o directorio. El lector debe aceptar el snapshot como UID cap-backup-monitor y rechazar una prueba de escritura por ese UID. cap-n8n no debe poder leer el estado SQLite ni la configuración privada.
3. La publicación expira en180s; ejecutar otra publicación **manualmente** si se necesita continuar después de ese plazo, sin activar el timer. Usar la API Python del lector bajo el UID del monitor para validar el contrato y mostrar solo versión, freshness y conteos; no volcar JSON o eventos completos. La fecha de publicación y la de ejecución del respaldo deben seguir siendo distintas.
4. Comprobar los dos casos Linux omitidos y las defensas adicionales de archivos en un directorio temporal privado de esta comprobación, nunca sobre snapshot/estado reales. Desde una copia de pruebas revisada con su fixture journal sintético, seleccionar únicamente los tests POSIX de test_snapshot.py: `test_posix_actual_symlink_rejected` y `test_posix_rejects_untrusted_tmp_ancestor`. Sus resultados no equivalen a validar todo el sandbox; además comprobar root/grupo y denegación de lectura/escritura con identidades reales, FIFO/hardlink/ancestros y atomicidad/fsync. No crear otra instalación Linux o servicio de laboratorio. Si no es seguro ejecutar un caso en el host existente, dejarlo pendiente, no simular que pasó.
5. Iniciar **manualmente** solo observer y API nuevos para una comprobación supervisada breve. Ninguno queda enabled. Verificar UMask0077, mismo UID/GID y propietario0600 de SQLite/WAL/SHM mientras los procesos viven; confirmar que StateDirectory no cambia propietarios entre los dos servicios. Confirmar el proceso del publicador ya terminado y ningún timer nuevo activo.
6. Verificar HTTP401 sin token y HTTP400 con token correcto y cuerpo inválido antes de reclamar una alerta. Para estos requests usar el token desde un archivo privado, nunca argumentos de curl/ps ni logs. Para probar HTTP200 de claim, confirmar previamente cola vacía mediante consulta agregada privada. Si hay una alerta real pendiente, detenerse: no consumir intentos o first_attempt para una comprobación técnica. No hay endpoint GET de salud en esta API; un GET no sustituye los controles POST.
7. Comprobar listener exclusivamente127.0.0.1:8766 y ausencia de ruta Nginx. El test desde el UID cap-n8n prueba conectividad local, no una ejecución Code real. No publicar el API, abrir firewall o iniciar el n8n existente con otra configuración.
8. Realizar concurrencia/WAL, BUSY y error de almacenamiento en otra SQLite **sintética y temporal**, bajo el mismo UID y en directorio propio de la comprobación; no bloquear, corromper o llenar el estado operativo ni el filesystem raíz. ENOSPC real solo mediante un recurso acotado expresamente autorizado; si no, conservarlo como simulación pendiente. No aplicar fixtures a la SQLite operativa. Mantener separados resultados simulados y evidencia del journal real.
9. Detener observer/API nuevos al concluir el checkpoint, sin deshabilitar o reiniciar ningún servicio existente. Comparar estados/PIDs/arranques/hashes existentes con el preflight; dejar las cuatro unidades nuevas sin habilitación automática. Registrar estado de los nuevos componentes, archivos de estado y cualquier alerta pendiente. Conservar evidencia privada para el siguiente paso.

Inicio y cierre manuales de ejemplo, **solo dentro de esa ventana autorizada**:

```bash
sudo systemctl start cap-prenatal-backup-evidence.service
# Verificar primero snapshot y permisos. No continuar si falla.
sudo systemctl start cap-prenatal-backup-observer.service cap-prenatal-backup-monitor-api.service
# Realizar el checkpoint; no habilitar timer ni importar n8n.
sudo systemctl stop cap-prenatal-backup-observer.service cap-prenatal-backup-monitor-api.service
systemctl show cap-prenatal-backup-evidence.timer -p ActiveState -p UnitFileState
```

## F. Puertas posteriores independientes

- **Importación inactiva:** requiere revisión de E, respaldo consistente n8n autorizado y registro privado de su material de recuperación. Usar mecanismo nativo compatible2.34.4, comprobar que no hay duplicado y crear/vincular únicamente el workflow nuevo. No sustituir los seis clínicos. Mantener active=false y sin publicar; asociar Header Auth y credencial Resend autorizadas sin extraer claves. No pulsar Execute ni activar/publicar para verificar un guardado.
- **Observación programada:** habilitar el timer nuevo, observer/API al arranque y cualquier automatización n8n necesita autorización explícita posterior. No se incluye en el checkpoint manual. Verificar baseline sin avisos históricos, frescura y cola antes de esa decisión.
- **Correo real:** autorización separada con destinatario confirmado, límite de envíos y resultado de proveedor. La configuración privada no constituye autorización de envío por sí sola.

## G. Rollback limitado a CPREN-91

Ante un fallo: detener las escrituras y solamente observer/API/timer de evidencia nuevos. Si el oneshot está en curso, detener solo ese nuevo publicador. No utilizar comodines que puedan incluir `cap-prenatal-backup.service` o su timer. Conservar SQLite/WAL/SHM y obtener copia consistente antes de cambios posteriores; conservar claims/ACK inciertos y las claves originales, sin resetear la cola.

Restaurar únicamente código/configuración del monitor respaldados y compatibles con su esquema. En primera instalación, donde esos recursos no existían, dejar las unidades nuevas detenidas y retirar sus archivos de carga **solo con manifest y autorización**, poniéndolos en cuarentena privada en lugar de borrar recursivamente. No eliminar cuentas/grupos hasta probar que son exclusivos y que el estado/evidencia están preservados. Runtime snapshots viejos no deben reutilizarse para eludir frescura.

Si se importó posteriormente el workflow nuevo, aplicar el rollback específico autorizado a ese ID, inactivo; no restaurar toda la instancia n8n ante un error HTTP aislado ni borrar los seis workflows. Cualquier recuperación global de n8n exige una evaluación independiente para no revertir cambios legítimos posteriores.

Al cerrar, repetir lectura de estados/arranques/hashes, salud n8n y PostgreSQL sin consultas clínicas; confirmar que el respaldo y su timer siguen intactos. Una incidencia de componente nuevo no permite tocar rclone/Drive, archivos de respaldo, Nginx, credenciales existentes o backend.

## Riesgos aceptados como pendientes, no aprobados como resultados

Dos pruebas POSIX omitidas en Windows; systemd255 real y su hardening no ejecutados; permisos efectivos root/grupo, flock/fsync, API compartiendo loopback, recursos, WAL y errores de disco aún requieren E. Los snapshots declaran retención no probada; huecos históricos y caída del host requieren conciliación/supervisión externa. API/observador comparten confianza y acceso a estado, no aislamiento de secretos entre sus procesos. La evidencia del script no sustituye comprobar restaurabilidad. Si cualquier requisito esencial falla, parar y volver a revisión: cancelar otra VM no convierte los mocks en validación productiva.
