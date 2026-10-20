# CPREN-91 — Fase 3: validación nativa aislada

Resultado: **APTO para revisión local con una corrección funcional de enrutamiento. No desplegado.** No se ejecutó ningún comando en Ubuntu, ni se utilizó la instalación habitual de n8n como laboratorio. No se importó, ejecutó, publicó o activó ninguno de los seis workflows clínicos. Sin Drive, dumps, correos reales, Docker, cambios en main, commits, push o merge.

## Qué se ejecutó realmente

Se reutilizó el ejecutable n8n **2.34.4** instalado, con un perfil y una SQLite nuevos bajo `phase3/runtime/run-4n3xwje4/`. No se instaló otra copia de n8n. El paquete estático ya instalado `n8n-nodes-resend` **2.8.0** se copió al perfil sintético, sin copiar configuración, bases o credenciales operativas. Las tres credenciales del perfil son ficticias e inválidas para servicios reales.

El CLI nativo importó dos copias de laboratorio, una normal y una negativa de autenticación. Ambas permanecieron `active=false`, `activeVersionId=null`. Las ejecuciones se realizaron mediante `n8n execute --id`, con disparador manual en lugar de calendario, sin iniciar el editor web ni publicar. Se mantuvieron el Code HTML y las conexiones del canónico corregido; las diferencias de laboratorio son identidad, entrada manual, puerto API y referencias a credenciales sintéticas.

Se ejecutaron **14 escenarios dentro del motor real**, con el **JavaScript Task Runner interno real**, el nodo HTTP Request, el nodo comunitario Resend y el nuevo IF. El motor de expresiones fue `legacy`, valor predeterminado confirmado en el código instalado de n8n 2.34.4. No se probó el motor alternativo `vm` ni el disparo automático de Schedule Trigger, porque las copias debían seguir inactivas.

| Escenario nativo | Resultado comprobado |
|---|---|
| Cola vacía | Code devuelve cero elementos; Resend no se alcanza |
| Transferencia fallida | Una aceptación del proveedor simulado y ACK persistido |
| Mismo fallo repetido | Ninguna nueva aceptación |
| Nueva copia externa verificada | Una recuperación y ACK persistido |
| API con credencial incorrecta | HTTP401 y fallo previsto en Reclamar alerta; no se alcanza Resend |
| Error del proveedor simulado | Se registra resultado incierto y no se confirma aceptación |
| Aceptación con ACK perdido | Error previsto del ACK; la alerta conserva su reclamación |
| Reclamación vencida | Reintento con mismo evento, payload y clave; el proveedor devuelve la aceptación anterior, sin duplicarla |
| Segunda recuperación | Nueva copia verificada cierra el segundo incidente |
| Reinicio de componentes | Observador por CLI, API y procesos n8n reiniciados conservan eventos y perfiles |
| Tercera recuperación | Se confirma después de la alerta pendiente del reinicio |
| Resultado incierto fuera de ventana | Revisión manual; ningún nuevo envío al proveedor |
| Ejecución programada ausente | Alerta de ausencia y ACK sobre una SQLite de escenario separada |
| Ejecución incompleta | Alerta al alcanzar el plazo y ACK sobre otra SQLite de escenario |

Total: **ocho aceptaciones únicas en el Resend simulado, cero correos reales**. Un workflow que falla por HTTP401 o ACK perdido es un resultado esperado del ensayo negativo, no una validación fallida. Los errores fueron examinados y asociados al nodo esperado.

## Qué fue simulado

Las observaciones systemd/journald, los fallos y las verificaciones de respaldos fueron fixtures. No se ejecutó el lector Linux real ni se comprobó Drive. La API sí fue la implementación real de `monitor.py`, en loopback; el proveedor fue un servidor HTTP ficticio con ledger SQLite de idempotencia.

El nodo Resend real preparó autenticación y payload. Una guardia precargada interceptó exclusivamente el POST a `/emails` antes de DNS/TLS y lo dirigió al proveedor local. Por tanto, se verifican compatibilidad del nodo y su contrato de transporte, **no TLS, permisos de una clave real, disponibilidad de Resend o entrega Gmail**.

Los vencimientos largos y el límite de 24 horas se ejercitaron ajustando fechas únicamente en las SQLite sintéticas, sin esperar 24 horas ni modificar el reloj de Windows. Las operaciones de fixtures usan un proceso nuevo del observador con `--fixture --once`. Cada ejecución CLI inicia otro proceso n8n contra la misma base sintética; además se detuvo y reinició la API/proveedor conservando su almacenamiento. No se simuló un corte eléctrico ni se probó systemd en Windows.

## Aislamiento y cierre

El proceso n8n recibe un entorno construido desde lista cerrada: perfil, HOME y temporales sintéticos, sin cargar `.env`. Node limita la lectura a módulos instalados, guardia y laboratorio; escritura solo al laboratorio. Se probaron rechazos de lectura de `.env` y SQLite operativos sin obtener bytes.

La guardia permite sockets únicamente a 127.0.0.1/::1 en los puertos de fixtures **18866/18867** y broker **18869**, y permite escuchar al broker solo en 127.0.0.1. Rechaza los demás destinos, DNS externos, UDP, HTTP2, fetch y subprocesos arbitrarios. Solo se permite el proceso JavaScript Task Runner exacto, al que se inyectan las mismas barreras. Los lookups de IP literales loopback no requieren DNS externo. Las sondas negativas rechazaron Resend externo, el n8n habitual y el backend.

n8n intenta sondear `python --version`; esa invocación se deniega explícitamente y el aviso de runner Python ausente es esperado. El workflow solo usa JavaScript. El aviso de MCP se debe a la lista cerrada de nodos cargados; MCP no forma parte del grafo probado.

Las banderas de Node para addons nativos y procesos hijos tienen límites conocidos. Se autorizaron para el SQLite y Task Runner instalados, reforzadas por la guardia. **No es un namespace Linux, un firewall de Windows ni una garantía para código malicioso o addons no confiables.** No se cambió el firewall ni se ampliaron permisos operativos. Se ejecutaron solamente el motor conocido y fixtures propios; no se afirma una captura global de paquetes.

Cierre comprobado: los tres puertos temporales quedaron libres; las dos copias sintéticas siguen inactivas/sin publicar; cero ejecuciones vigentes en su SQLite. Los procesos de fixtures terminaron. Los perfiles se conservan ignorados como evidencia privada; no se borraron los intentos anteriores.

## Hallazgo funcional y corrección controlada

En el escenario de error del proveedor, `n8n-nodes-resend` 2.8.0 devolvió un objeto de error por su **salida normal**. `onError=continueErrorOutput` no bastó para conducirlo a la salida de error, porque el propio nodo manejó la excepción. El V1 aprobado intentaba ejecutar el ACK sin `provider_id`; la API lo rechazó con HTTP400. No se perdió la alerta, pero la rama de incertidumbre no se ejecutó como estaba diseñada.

Se conserva el canónico anterior en `evidence/workflow-before-response-guard.json`. La única corrección funcional agrega **¿Resend aceptó el envío?**: una respuesta normal con ID válido va al ACK; cualquier respuesta sin ID válido va a incertidumbre. La salida de error original continúa conectada a incertidumbre. Todos los nodos anteriores, su HTML/Code, remitente, destinatario, idempotencia, configuración y credenciales sin vincular permanecen iguales. El auditor verifica esta diferencia por estructura, no acepta cambios generales.

Se agregó una regresión para errores retornados por la salida normal. El nuevo canónico reproduce exactamente su generador. Los seis JSON clínicos y `components.cjs` permanecen byte a byte idénticos a Fase 2/origin/main.

## Intentos anteriores y otros ajustes

- El primer arranque agotó 100 segundos cargando nodos. Se limitó la carga a los tipos requeridos por el laboratorio, sin ampliar acceso de red ni modificar el canónico.
- Una primera guardia bloqueó el lookup de la IP loopback al escuchar el broker. Se permitió solo lookup de 127.0.0.1/::1; los nombres externos siguen prohibidos.
- Se distinguió la sonda Python denegada de un intento inesperado. No se permitió ejecutar Python desde n8n.
- El harness Python leyó inicialmente UTF-8 con la codificación local de Windows: algunas tildes se convirtieron en caracteres U+00A9 y el detector de emojis bloqueó la alerta. Una copia diagnóstica del laboratorio registró solo los códigos Unicode. Se corrigió el harness para leer UTF-8 explícito; **no se cambió el detector ni el diseño del canónico**.
- El harness trataba todo exit1 del CLI como fallo del ensayo. Ahora inspecciona el resultado estructurado y exige el nodo esperado en pruebas negativas; sigue rechazando timeouts y fallos de arranque.
- `verify.cjs` ahora excluye `runtime/` de su recorrido: el laboratorio introdujo perfiles privados que nunca deben entrar en manifiestos públicos.
- El reporte legible de Node de Fase 2 contenía marcadores Unicode automáticos. Se conservó su original local en `runtime/phase2-workflow-tests-original.txt` y se normalizaron únicamente esos marcadores a PASS/INFO en la copia candidata a Git, sin cambiar sus nueve resultados históricos. El manifiesto original de Fase 2 conserva los hashes históricos; el reporte y hashes vigentes se revisan en esta carpeta.

## Regresiones y evidencias públicas

**31 pruebas Python y 10 pruebas Node: 41 correctas, cero fallidas.** Se conservan en `evidence/python-regression.txt` y `workflow-regression.tap`; TAP evita marcadores gráficos en material nuevo. `build-workflow.cjs --check` pasó.

`evidence/runtime-results.json` contiene los 14 escenarios y las trazas sanitizadas de las guardias. `persistence.json` resume SQLite, estados de outbox, integridad, claves foráneas y el payload inmutable después de perder el ACK. `protected-files.json` registra hashes y alcance exacto de la corrección. `git-review.json` enumera los archivos candidatos y exclusiones.

Para reproducir localmente, con autorización para procesos desechables y puertos exclusivos:

```text
python -B operations/backup-monitor/phase3/runtime-test.py
python -B -m unittest discover -s operations/backup-monitor -p test_monitor.py -v
node --test --test-reporter=tap operations/backup-monitor/workflow.test.cjs
node operations/backup-monitor/build-workflow.cjs --check
node operations/backup-monitor/phase3/audit.cjs run-4n3xwje4
```

Cada corrida crea una carpeta nueva; no se reutiliza un perfil operativo. El ensayo requiere Windows/Node nativo instalado y el paquete Resend existente. No descarga paquetes ni crea una instalación permanente. El comando de auditoría recibe la carpeta concreta de la corrida aprobada; debe sustituirse por la nueva al repetir el ensayo.

## Git, permisos Linux y pendientes

Rama `codex/cpren91-backup-alerts`, base `8c36954172c3bbe998fdefb4ccd2435d2087e1ea`. Se preservaron todos los archivos previos. No se hizo pull porque ya había cambios locales; no se actualizó main. No hay staged ni commits de esta fase. El inventario exacto incluye los archivos aún no versionados de Fase 2 y los de Fase 3, sin confundirlos con cambios a fuentes clínicas.

Se excluye **todo `phase3/runtime/**`**: perfiles n8n, SQLite/WAL/SHM, credenciales ficticias, copias del paquete Resend, salidas crudas del CLI, fixtures de ejecución, tokens temporales nativos y snapshots privados. También se excluyen __pycache__, archivos privados y las categorías ya ignoradas del repositorio: `.env`, perfiles habituales, dependencias, respaldos y evidencia histórica privada. El auditor inspecciona la lista candidata cerrada, no exporta los contenidos ignorados ni los añade a Git.

`LINUX-PERMISSIONS.md` prepara la revisión de identidades, lectura mínima de journald, acceso al almacenamiento compartido y autenticación. **No se verificaron esos permisos en Ubuntu.** Queda por aprobar el mecanismo de lectura restringida de journald y, si API/observador usan usuarios distintos, ajustar y ensayar permisos de grupo/WAL, pues la CLI actual aplica umask0077. No se instala el helper ni se concede sudo/grupos en esta fase.

La validación local no autoriza despliegue. Siguen pendientes las comprobaciones Linux autorizadas, identidades/permisos, secreto local y vinculación de credenciales, supervisión externa, conciliación manual, respaldo/rollback y ventana de instalación/importación. Cualquier prueba con correo real requiere autorización separada.

## Redacción posterior de privacidad — Fase 5A

La copia pública `evidence/workflow-before-response-guard.json` sustituye únicamente el destinatario personal por `alerts@example.invalid`. Es evidencia histórica redactada, no un workflow destinado a instalarse. El original exacto, manifiestos y commits anteriores se preservan en el respaldo privado ignorado. Los hashes históricos de Fase 2/3 siguen identificando los originales; el manifiesto vigente de Fase 5A identifica los bytes redactados. La versión actual añade destinatario desde configuración privada y exige repetir las verificaciones pertinentes; estos 14 escenarios históricos por sí solos no validan el nuevo contrato.
