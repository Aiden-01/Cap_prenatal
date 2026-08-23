# Automatizaciones seguras con n8n

Esta guía define la arquitectura, los contratos y el comportamiento esperado de
las automatizaciones de CAP Prenatal. La operación diaria está en
[`N8N_OPERACION.md`](N8N_OPERACION.md), la configuración de correo en
[`RESEND.md`](RESEND.md) y el inventario importable en
[`../n8n/README.md`](../n8n/README.md).

## Estado observado el 22 de agosto de 2026

- Rama inspeccionada: `main`, HEAD `bc99a6cacaced5b635794d697bd4919c2f23d49e`.
- n8n local: `2.34.4`, disponible en `http://127.0.0.1:5678` y ligado a
  loopback.
- Perfil persistente: `.n8n-local/`, ignorado por Git.
- Nodo Resend: `n8n-nodes-resend@2.8.0` instalado en el perfil persistente.
- Workflows locales: tres, con IDs estables, credenciales asignadas y
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

Todos usan `America/Guatemala`. Activar un workflow es una decisión operativa
separada de importarlo o probar nodos individuales.

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

La consulta considera embarazos activos y únicamente la `cita_siguiente` del
control más reciente de cada embarazo. Una cita antigua no reaparece si el
último control ya no tiene una fecha futura.

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
HTML. Un contrato inesperado falla antes de Resend.

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

Los tres JSON fijan:

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

Los tres workflows cargados utilizan `n8n-nodes-resend.resend`. El archivo
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
8. probar con payload sintético, rama vacía y un XLSX no clínico;
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
node --test backend/test/automatizaciones.test.js
```

Estas pruebas no envían correo ni requieren una base clínica real.
