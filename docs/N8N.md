# Automatizaciones seguras con n8n

Esta guía define la arquitectura, los contratos y el comportamiento esperado de
las automatizaciones de CAP Prenatal. La operación diaria está en
[`N8N_OPERACION.md`](N8N_OPERACION.md), la configuración de correo en
[`RESEND.md`](RESEND.md) y el inventario importable en
[`../n8n/README.md`](../n8n/README.md).

## Estado observado el 24 de agosto de 2026

- Rama inspeccionada: `main`, HEAD inicial
  `dbd654323de03ae5dbd6960e31e9d59729502662`.
- n8n local: `2.34.4`, disponible en `http://127.0.0.1:5678` y ligado a
  loopback.
- Perfil persistente: `.n8n-local/`, ignorado por Git.
- Nodo Resend: `n8n-nodes-resend@2.8.0` instalado en el perfil persistente.
- Workflows locales: cuatro, con IDs estables, credenciales asignadas y
  `active=false`.
- Workflows versionados: inactivos, sin IDs de credenciales, sin claves y con
  direcciones `.invalid`.

La inspección del repositorio y de los metadatos locales no implica que el
dominio, una API key o la entrega productiva se hayan vuelto a validar en los
paneles externos durante esta sesión.

| ID local | Workflow | Programación | Resultado sin datos | Correo |
| --- | --- | --- | --- | --- |
| `NI4eHXsKQmcCB2Xg` | Recordatorio de citas | Diario 08:00 | Termina sin enviar | Resend, sin adjunto |
| `capCenso2625V1A1` | Censo 26 a 25 | Día 26, 06:00 | Envía aviso sin archivo | Resend, XLSX si hay datos |
| `capCensoMesV1A1` | Censo de mes cerrado | Día 3, 06:00 | Envía aviso sin archivo | Resend, XLSX si hay datos |
| `JJylxJ7YxtprYjDZ` | Seguimiento semanal de inasistencias | Lunes 08:00 | Termina sin enviar | Resend, tabla HTML |

Todos usan `America/Guatemala`. Activar un workflow es una decisión operativa
separada de importarlo o probar nodos individuales.

Las fechas visibles para el personal en asuntos, cuerpos y nombres de adjuntos
usan `DD-MM-YYYY`, el formato operativo de Guatemala. Los parámetros HTTP, los
contratos JSON y los cálculos internos conservan ISO `YYYY-MM-DD`; la conversión
ocurre únicamente al construir el mensaje.

## Responsabilidades y límites de confianza

```text
CAP Prenatal
    |
    | consulta privada autenticada
    v
API interna Express
    |
    | respuesta mínima / XLSX temporal
    v
n8n
    |
    | HTTPS saliente con credencial cifrada
    v
Resend
    |
    v
correo institucional autorizado
```

- **CAP Prenatal/PostgreSQL:** fuente clínica canónica.
- **API Express:** único punto autorizado para consultar datos de
  automatización y generar el XLSX. Aplica validación, allowlist, rate limit y
  minimización.
- **n8n:** agenda, valida contratos, decide ramas, forma el correo y adjunta el
  binario. No consulta PostgreSQL.
- **Resend:** entrega el correo usando un dominio verificado y una API key
  guardada como credencial de n8n.
- **Destinatario:** custodio del mensaje y de cualquier archivo clínico.

n8n no comparte la red `data_internal`, no recibe `DATABASE_URL`, contraseñas
de PostgreSQL, JWT, secretos de sesión ni hashes M2M. En producción solo
comparte `automation_internal` con el backend.

## Autenticación de máquina a máquina

Las rutas usan exclusivamente:

```text
X-CAP-Automation-Key: <valor aleatorio guardado en Header Auth>
```

La key original vive en una credencial `HTTP Header Auth` de n8n. El backend
recibe solo su SHA-256 en `N8N_API_KEY_HASH_CURRENT` y, durante una rotación,
en `N8N_API_KEY_HASH_NEXT`.

Además se exige:

- `N8N_INTEGRATION_ENABLED=true`;
- producción, o desarrollo con `N8N_INTEGRATION_LOCAL_ENABLED=true`;
- origen incluido en `N8N_ALLOWED_CIDRS`;
- ausencia de `Origin` de navegador;
- rate limit disponible.

El opt-in local admite únicamente `127.0.0.1/32` y/o `::1/128`. JWT, cookies,
CSRF, `Authorization`, query strings y `X-Forwarded-For` no sustituyen estos
controles. La ruta legacy `/api/automatizaciones/proximas-citas` permanece
retirada y responde `404`.

## API interna

### Seguimiento de inasistencias (`N8N-OPS-01A`)

CITAS-01B completó en código el prerrequisito operativo: reprogramar conserva la
cita original y crea una hija, cancelar conserva la fila, y el siguiente control
válido cumple la única cita vigente del embarazo. La migración 014 garantiza
una raíz por control, una hija por cita y una sola `programada` por embarazo.
No reconstruye citas históricas.

N8N-OPS-01A implementa la semana calendario anterior completa y propone su
ejecución los lunes a las 08:00 en `America/Guatemala`. Una inasistencia es una
fila de `citas_prenatales` cuya `fecha_programada` está dentro del lunes-domingo
solicitado, permanece `estado = 'programada'`, no tiene
`control_cumplimiento_id` y pertenece a un embarazo activo. Las citas
`atendida`, `cancelada` y `reprogramada` quedan excluidas por el backend.

El corte seguro es el `applied_at` versionado de
`014_citas_prenatales.sql`: además del período, la consulta exige
`citas_prenatales.created_at >= corte`. No usa, infiere ni reconstruye
`controles_prenatales.cita_siguiente`. La migración 015 agrega solo el estado
técnico de despacho; debe aplicarse mediante el flujo oficial antes de iniciar
esta versión del backend. El workflow fue importado y probado, pero permanece
sin publicar y `active=false`.

Vista previa explícita, de solo lectura:

```text
GET /api/automatizaciones/v1/inasistencias?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
```

Preparación idempotente de la semana anterior:

```text
POST /api/automatizaciones/v1/inasistencias/preparar
```

Contrato sintético de una preparación lista:

```json
{
  "schema_version": 1,
  "generated_at": "2026-08-24T14:00:00.000Z",
  "timezone": "America/Guatemala",
  "report_type": "weekly_missed_appointments",
  "range": { "from": "2026-08-17", "to": "2026-08-23" },
  "cutoff_at": "2026-08-01T16:30:00.000Z",
  "dispatch": { "status": "ready", "token": "<token efimero>" },
  "total": 1,
  "appointments": [
    {
      "date": "2026-08-19",
      "first_name": "Nombre",
      "last_name": "Apellido",
      "phone": "0000-0000",
      "community": "Comunidad"
    }
  ]
}
```

`no_results` y `already_processed` siempre llevan `total=0`, lista vacía y no
incluyen token. `ready` es el único estado que permite avanzar a Resend. Tras
la aceptación del correo, n8n confirma una sola vez:

```text
POST /api/automatizaciones/v1/inasistencias/confirmar
{"dispatch_token":"<token efimero recibido en preparar>"}
```

La migración `015_automatizacion_despachos.sql` conserva por tipo y período
solo estado técnico, hash SHA-256 del token, total, número de intento y marcas
de tiempo. No guarda citas, pacientes, destinatarios ni HTML. Una reserva sin
confirmación se considera ambigua y otro `preparar` responde `409
AUTOMATION_DISPATCH_UNCERTAIN`; n8n no debe reintentar Resend. Después de
comprobar el evento en Resend, personal técnico autorizado puede resolverla:

```text
POST /api/automatizaciones/v1/inasistencias/resolver
{
  "desde": "2026-08-17",
  "hasta": "2026-08-23",
  "resolucion": "enviado | reintentar",
  "confirmacion": "REINTENTAR_INASISTENCIAS_SEMANALES",
  "motivo_codigo": "entrega_confirmada_en_resend | entrega_no_realizada_confirmada"
}
```

`enviado` y `sin_resultados` no pueden reabrirse. `reintentar` solo deja una
autorización; el siguiente `preparar` crea un token nuevo e incrementa el
intento.

### Citas de mañana

```text
GET /api/automatizaciones/v1/proximas-citas?offset_days=1&window_days=1
```

La respuesta raíz contiene exactamente:

```json
{
  "schema_version": 1,
  "generated_at": "2026-01-01T12:00:00.000Z",
  "timezone": "America/Guatemala",
  "range": { "from": "2026-01-02", "to": "2026-01-02" },
  "total": 1,
  "summary_by_date": [{ "date": "2026-01-02", "total": 1 }],
  "appointments": [
    {
      "date": "2026-01-02",
      "first_name": "Nombre",
      "last_name": "Apellido",
      "phone": "0000-0000",
      "community": "Comunidad"
    }
  ],
  "secure_path": "/dashboard"
}
```

El ejemplo es sintético. Cada cita expone solo fecha, primer nombre, primer
apellido, teléfono y comunidad. No devuelve IDs, CUI, expediente, dirección,
riesgo, diagnóstico, observaciones ni otros datos clínicos.

La consulta considera embarazos activos y la agenda estructurada de
`citas_prenatales`; no consulta `cita_siguiente` para decidir la agenda vigente.

### Censo de primer control

Resumen agregado:

```text
GET /api/automatizaciones/v1/censo-primer-control?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
```

Archivo nominal, solo cuando el resumen indica `total > 0`:

```text
GET /api/automatizaciones/v1/censo-primer-control/excel?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
```

El período es inclusivo y no puede superar 31 días. El resumen solo contiene
versión, generación, zona, tipo, rango, total y `/reportes`. La ruta binaria
responde un XLSX con `Content-Disposition: attachment` y
`Cache-Control: private, no-store`. n8n lo maneja temporalmente como propiedad
binaria `data`.

## Workflow de recordatorio diario

Archivo: `n8n/workflows/recordatorio-citas-resend-v1.json`.

```text
Schedule diario 08:00
    -> GET próximas citas (offset_days=1, window_days=1)
    -> ¿total > 0?
       ├─ no: fin, ningún correo
       └─ sí: validar contrato y escapar HTML
              -> un correo Resend con tabla operativa
```

La tabla contiene un nombre, un apellido, teléfono y comunidad por cita. El
nodo Code exige la lista cerrada de campos, longitudes máximas y ausencia de
caracteres de control; todos los valores se escapan antes de interpolarse en
HTML. La fuente backend ahora es `citas_prenatales` con estado `programada` y
sin cumplimiento; el contrato del endpoint, el Schedule y Resend no cambiaron.
Un contrato inesperado falla antes de Resend.

## Workflow semanal de inasistencias

Archivo: `n8n/workflows/seguimiento-inasistencias-resend-v1.json`.

```text
Schedule lunes 08:00
    -> POST preparar semana anterior
    -> validar contrato y reserva
    -> ¿dispatch=ready y total>0?
       ├─ no: fin, ningún correo
       └─ sí: construir tabla HTML mínima
              -> Resend
              -> POST confirmar despacho
```

El correo incluye fecha de la cita como dato operativo no clínico, primer
nombre, primer apellido, teléfono y comunidad. Excluye IDs, CUI, expediente,
dirección, VIH, laboratorios, diagnósticos, riesgo, morbilidad, vacunas y otros
datos clínicos. La fecha evita ambigüedad al coordinar el seguimiento.

Una API no disponible, timeout, `401`, `409`, respuesta inválida o fallo de
Resend deja la ejecución fallida; nunca se transforma en “no hay
inasistencias”. Si Resend acepta el correo pero falla la confirmación, revisar
primero el evento del proveedor y usar el resolver manual. No ejecutar de nuevo
el workflow completo mientras el despacho esté reservado.

Errores HTTP, `401`, `404`, `429`, contrato inválido o credencial ausente no se
convierten en un correo aparentemente exitoso. La rama falsa del IF no tiene
conexión al nodo Resend.

## Workflows mensuales del censo

### Mes logístico 26 a 25

Archivo: `n8n/workflows/censo-primer-control-26-25-resend-v1.json`.

Cada día 26 a las 06:00 calcula el último período completo que inicia el 26 del
mes anterior y termina el 25 del mes actual. Ejemplo: el 26 de febrero procesa
del 26 de enero al 25 de febrero.

### Mes calendario cerrado

Archivo: `n8n/workflows/censo-primer-control-mes-cerrado-resend-v1.json`.

Cada día 3 a las 06:00 procesa desde el día 1 hasta el último día del mes
calendario anterior.

### Comportamiento común

```text
Schedule
    -> calcular período
    -> GET resumen agregado
    -> validar contrato y período exacto
    -> ¿total > 0?
       ├─ no: Resend con aviso, sin archivo
       └─ sí: GET XLSX como binary.data
              -> Resend con adjunto .xlsx
```

El archivo solo se descarga después de comprobar que hay registros. El
workflow no serializa el XLSX dentro del JSON versionado ni lo guarda como
archivo del repositorio.

## Persistencia, retención y privacidad

Los cuatro JSON Resend fijan:

```text
saveDataSuccessExecution=none
saveDataErrorExecution=none
saveManualExecutions=false
saveExecutionProgress=false
availableInMCP=false
```

Producción aplica poda y no guarda payloads exitosos, fallidos, manuales o en
progreso. Local puede conservar errores/manuales por hasta 24 horas para
diagnóstico; por eso solo deben usarse datos sintéticos o el mínimo operativo
autorizado y se debe limpiar la evidencia temporal después de probar.

No copiar a Git:

- `n8n/.env`;
- `.n8n-local/` ni su SQLite;
- exports locales con IDs de credenciales o destinatarios;
- API keys, valores DKIM/SPF/DMARC, claves de cifrado o backups;
- capturas o payloads con pacientes.

## Resend y artefacto SMTP heredado

Los cuatro workflows cargados utilizan `n8n-nodes-resend.resend`. El archivo
`n8n/workflows/proximas-citas-v1.json` conserva un diseño endurecido de 40
nodos con `n8n-nodes-base.emailSend`; no está cargado en la instancia local y
no es el camino operativo actual. Se mantiene como artefacto heredado cubierto
por pruebas hasta que una decisión separada autorice retirarlo.

No existen variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` o
`SMTP_PASS` en los `.env.example` del proyecto ni consumo SMTP en el backend.
Las menciones SMTP restantes pertenecen al artefacto heredado, pruebas de
privacidad o documentación histórica; no deben usarse para configurar los
workflows Resend.

## Preparación productiva

Antes de publicar:

1. respaldar el volumen/perfil de n8n y custodiar aparte la misma
   `N8N_ENCRYPTION_KEY`;
2. desplegar n8n `2.34.4` y reconciliar
   `n8n-nodes-resend@2.8.0` desde configuración;
3. verificar propietario, acceso administrativo HTTPS y MFA si está disponible;
4. importar los JSON y confirmar `active=false`;
5. asignar Header Auth y Resend sin pegar secretos en nodos o variables de
   proyecto;
6. sustituir `.invalid` por el remitente verificado y el destinatario
   institucional aprobado;
7. confirmar red privada hacia Express y egress HTTPS limitado a Resend;
8. probar con payload sintético, rama vacía, idempotencia y un XLSX no clínico;
9. revisar retención, concurrencia, monitoreo de fallos y política de adjuntos;
10. publicar solo con autorización institucional.

El ejemplo `docker-compose.production.example.yml` no es un despliegue listo:
faltan TLS, firewall/egress, gestor de secretos, backups restaurables,
observabilidad y autorización formal.

## Validación del repositorio

```powershell
node --test backend/test/n8nInfrastructure.test.js
node --test backend/test/n8nResendDailyWorkflow.test.js
node --test backend/test/n8nCensusWorkflow.test.js
node --test backend/test/n8nMissedAppointmentsWorkflow.test.js
node --test backend/test/inasistenciasSemanales.test.js
node --test backend/test/automatizaciones.test.js
```

Estas pruebas no envían correo ni requieren una base clínica real.
