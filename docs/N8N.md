# Integracion segura con n8n

## Estado

Sprint 5B.1 implementa solamente el endpoint interno del backend. Todavia no
existe un workflow n8n productivo, no se envian correos y no se habilita la
integracion en desarrollo.

El endpoint anterior:

```text
GET /api/automatizaciones/proximas-citas
```

esta retirado y responde `404`. `AUTOMATION_SECRET` es obsoleto y el backend no
lo usa. No debe restaurarse ni redirigirse al contrato nuevo.

## Endpoint v1

```text
GET /api/automatizaciones/v1/proximas-citas
X-CAP-Automation-Key: <API_KEY_ALEATORIA>
```

Parametros opcionales:

- `offset_days`: entero de 0 a 30; default `1`.
- `window_days`: entero de 1 a 7; default `1`.

No se permiten parametros repetidos, desconocidos, negativos o decimales. La
zona horaria unica de esta version es `America/Guatemala`.

El endpoint existe funcionalmente solo cuando:

- `NODE_ENV=production`;
- `N8N_INTEGRATION_ENABLED=true`;
- el hash CURRENT esta configurado;
- el origen pertenece a `N8N_ALLOWED_CIDRS`;
- la API key es valida;
- el rate limit permite la solicitud.

En desarrollo, test o con la integracion deshabilitada responde `404`. JWT,
cookies, CSRF, `Authorization` y credenciales en query string no autentican esta
ruta. Las solicitudes de navegador con header `Origin` se rechazan.

## Respuesta

```json
{
  "schema_version": 1,
  "generated_at": "2026-01-01T12:00:00.000Z",
  "timezone": "America/Guatemala",
  "range": {
    "from": "2026-01-02",
    "to": "2026-01-02"
  },
  "total": 3,
  "summary_by_date": [
    {
      "date": "2026-01-02",
      "total": 3
    }
  ],
  "secure_path": "/dashboard"
}
```

`range.to` es la ultima fecha incluida. Una consulta sin citas responde
`total: 0` y `summary_by_date: []`.

La respuesta nunca contiene paciente, embarazo, nombre, CUI, telefono,
expediente, direccion, comunidad, territorio, riesgo, diagnostico, controles,
observaciones, HTML, Markdown ni SQL.

## Seleccion de citas

La consulta:

- usa la fecha de PostgreSQL en `America/Guatemala`;
- incluye solo embarazos `activo`;
- exige que control y embarazo pertenezcan a la misma paciente;
- particiona por `embarazo_id`;
- elige `fecha DESC, numero_control DESC, id DESC`;
- considera solo `cita_siguiente` del control mas reciente;
- no revive una cita de un control anterior si el ultimo no tiene fecha;
- excluye fechas fuera del rango;
- agrega el resultado por fecha.

No realiza escrituras ni requiere cambios de base de datos.

## Configuracion del backend

```env
N8N_INTEGRATION_ENABLED=false
N8N_API_KEY_HASH_CURRENT=
N8N_API_KEY_HASH_NEXT=
N8N_ALLOWED_CIDRS=
APPOINTMENT_NOTIFICATION_START_OFFSET_DAYS=1
APPOINTMENT_NOTIFICATION_WINDOW_DAYS=1
APPOINTMENT_NOTIFICATION_TIMEZONE=America/Guatemala
AUTOMATION_RATE_LIMIT_WINDOW_MS=900000
AUTOMATION_RATE_LIMIT_MAX=6
```

CURRENT y NEXT son hashes SHA-256 hexadecimales de 64 caracteres. La API key
original existe unicamente en la credencial Header Auth de n8n. Los hashes se
tratan como configuracion sensible y no se escriben en Git, tickets o logs.

En produccion habilitada la allowlist no puede estar vacia. Soporta IPv4, IPv6
y direcciones IPv4 mapeadas como IPv6. El backend usa la direccion del socket;
no confia en `X-Forwarded-For`. La configuracion exacta de `trust proxy`, proxy
reverso y red Docker queda para Sprint 5B.2.

La validacion CIDR usa la dependencia explicita `ipaddr.js` porque implementa
parseo y comparacion mantenidos para IPv4, IPv6 e IPv4 mapeada; evita un parser
manual incompleto en un control de acceso de red.

## Generacion y rotacion

En una terminal administrativa segura puede generarse una key base64url y su
hash:

```text
node -e "const c=require('crypto');const k=c.randomBytes(32).toString('base64url');console.log('KEY='+k);console.log('SHA256='+c.createHash('sha256').update(k).digest('hex'))"
```

Procedimiento:

1. Guardar `KEY` solamente como credencial `X-CAP-Automation-Key` en n8n.
2. Guardar `SHA256` como `N8N_API_KEY_HASH_CURRENT` en el gestor de secretos del backend.
3. Para rotar, colocar el hash nuevo en `N8N_API_KEY_HASH_NEXT`.
4. Cambiar la credencial de n8n a la key nueva.
5. Promover NEXT a CURRENT y vaciar NEXT al terminar la ventana.

Nunca copiar la key original al entorno del backend.

## Rate limit y errores

El limite predeterminado es 6 solicitudes por 15 minutos y tiene un contador
independiente por origen validado. No comparte estado con login, reportes ni
rutas clinicas.

Codigos controlados:

- `400 AUTOMATION_INVALID_RANGE`;
- `401 AUTOMATION_UNAUTHORIZED`;
- `404 ROUTE_NOT_FOUND`;
- `429 AUTOMATION_RATE_LIMITED`;
- `500 AUTOMATION_INTERNAL_ERROR`.

Las respuestas y logs no incluyen key, hash, IP permitida, headers, query
completa, SQL o stack de automatizacion.

## Auditoria

Una consulta autorizada registra best effort:

```text
categoria: automatizaciones
entidad: proximas_citas
evento: consultar
accion: consultar
```

Solo conserva tipo, resultado, motivo controlado, cantidad, rango y
`politica_version: 1`. IP y user-agent quedan `null`. Un fallo de esta auditoria
informativa no convierte una consulta valida en error. Los intentos con key
incorrecta no crean filas de auditoria.

## Pendiente para Sprint 5B.2

- crear y versionar el workflow;
- configurar credenciales y destinatario;
- endurecer n8n, retencion y cifrado;
- terminar red Docker, firewall, HTTPS, proxy y `trust proxy`;
- impedir la exposicion publica del prefijo de automatizaciones;
- retirar la referencia obsoleta a `AUTOMATION_SECRET` del Compose local.
