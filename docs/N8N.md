# Integracion segura con n8n

## Estado

Sprint 5B.2A agrega configuraciones local y productiva de ejemplo para separar
n8n, backend, PostgreSQL y el proxy. No se desplego esta topologia, no existe un
workflow funcional, no se configuraron credenciales reales, no se enviaron
correos y no hubo cambios de base de datos.

El endpoint anterior:

```text
GET /api/automatizaciones/proximas-citas
```

esta retirado y responde `404`. `AUTOMATION_SECRET` es obsoleto y el backend no
lo usa. No debe restaurarse ni redirigirse al contrato nuevo.

## Topologia

```text
Internet/navegador
        |
        v
proxy Nginx :80/:443  -- app_internal -->  backend :3001
                                                |
                                                +-- data_internal --> PostgreSQL :5432
                                                |
n8n :5678 -- automation_internal ---------------+
```

La configuracion productiva de ejemplo define:

- `proxy_public`: solo el proxy;
- `app_internal`: proxy y backend;
- `data_internal`: backend y PostgreSQL;
- `automation_internal`: n8n y backend.

Las tres redes internas usan `internal: true`. PostgreSQL, backend y n8n no
publican puertos al host; solo `proxy` publica `80`. TLS debe terminar en este
proxy o en un balanceador administrado antes de usar la configuracion.

Inventario:

| Servicio | Desarrollo local | Produccion de ejemplo | Redes productivas |
| --- | --- | --- | --- |
| Proxy/frontend | `127.0.0.1:8080` | publica `80`; `443` debe resolverse en proxy/balanceador | `proxy_public`, `app_internal` |
| Backend | `127.0.0.1:3001` | sin `ports`, solo `expose: 3001` | `app_internal`, `data_internal`, `automation_internal` |
| PostgreSQL | `127.0.0.1:5432` | sin `ports`, solo `expose: 5432` | `data_internal` |
| n8n | `127.0.0.1:5678` | sin `ports`, solo `expose: 5678` | `automation_internal` |

El backend recibe DB/JWT y hashes M2M; PostgreSQL recibe unicamente sus
variables propias; n8n recibe cifrado, retencion y URLs dedicadas; el proxy no
recibe secretos de backend o n8n.

n8n consulta directamente:

```text
http://backend:3001/api/automatizaciones/v1/proximas-citas
```

No usa el proxy publico. Nginx responde un `404` JSON uniforme para el prefijo
normalizado `/api/automatizaciones/` antes del bloque general `/api/`. La regla
es case-insensitive y se aplica con `merge_slashes on`, por lo que variantes
simples de mayusculas, barras duplicadas o URI normalizada tampoco se reenvian.
Las rutas humanas restantes conservan el proxy general.

En una llamada directa n8n -> backend, `req.socket.remoteAddress` es la IP del
contenedor n8n dentro de `172.30.30.0/24`. En una llamada humana, el socket del
backend observa al proxy dentro de `172.30.10.0/24` y Express solo acepta sus
headers reenviados porque esa subred esta en `TRUSTED_PROXY_CIDRS`. Una llamada
publica nunca llega al router de automatizaciones porque Nginx la corta.

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
no confia en `X-Forwarded-For`.

La validacion CIDR usa la dependencia explicita `ipaddr.js` porque implementa
parseo y comparacion mantenidos para IPv4, IPv6 e IPv4 mapeada; evita un parser
manual incompleto en un control de acceso de red.

Para trafico humano, Express configura `trust proxy` con una funcion CIDR
estricta basada en `TRUSTED_PROXY_CIDRS`. El ejemplo productivo confia solo en
`172.30.10.0/24`, la subred de `app_internal`; nunca usa `true`. Esta
configuracion permite interpretar los headers del proxy humano, pero no cambia
el origen del endpoint M2M, que siempre usa `req.socket.remoteAddress`.

## n8n, secretos y version

La imagen y la dependencia local estan fijadas en `2.26.4`. Se eligio esta
version porque es la que ya resuelve el lockfile del proyecto; no se afirma que
sea la version mas reciente. No se usa `latest`, rango semver ni descarga
implicita mediante `npx`.

Para actualizar:

1. revisar las notas de version y cambios incompatibles;
2. respaldar y probar restauracion del volumen n8n;
3. verificar compatibilidad de nodos y credenciales en un entorno aislado;
4. actualizar a la vez Compose local, Compose productivo, `package.json` y lock;
5. ejecutar las pruebas de infraestructura y no saltar automaticamente de major.

n8n recibe solamente variables dedicadas. No recibe PostgreSQL clinico, JWT,
sesiones, SMTP, seed ni hashes CURRENT/NEXT. La API key original debe crearse
como credencial Header Auth dentro de n8n; el backend recibe unicamente los
hashes SHA-256.

`N8N_ENCRYPTION_KEY` es obligatoria, estable y secreta. Debe respaldarse en un
gestor independiente del volumen. Regenerarla despues de crear credenciales
puede impedir descifrarlas. El volumen `n8n_data` es persistente, se ejecuta con
UID/GID `1000:1000` y `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true`. El backup
debe cifrarse, tener acceso restringido e incluir una prueba periodica de
restauracion; la clave no debe guardarse dentro del mismo backup sin una
proteccion separada.

## Retencion

Produccion parte de una politica conservadora:

```env
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168
EXECUTIONS_DATA_PRUNE_MAX_COUNT=1000
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_ERROR=none
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
```

La retencion maxima inicial es siete dias y 1000 ejecuciones. Local conserva
errores y ejecuciones manuales sinteticas por hasta 24 horas/100 ejecuciones.
La configuracion reduce persistencia, pero no permite prometer que un workflow
futuro nunca guarde datos: ese workflow debera validar que sus nodos, errores y
expresiones no incorporen pacientes, payloads ni headers en logs.

## Acceso administrativo

En produccion n8n no publica `5678`. Su editor debe alcanzarse solo mediante
VPN, red administrativa o tunel autenticado, con HTTPS si cruza una red. La
cuenta propietaria y MFA, cuando la plataforma lo permita, se configuran fuera
de Git. No habilitar el tunel administrativo hasta confirmar autenticacion y
cuenta propietaria; una UI sin autenticacion no es aceptable. El Compose local
publica exclusivamente `127.0.0.1:5678`.

## Configuracion local

`scripts/start-n8n-local.ps1` lee unicamente `n8n/.env`, valida una lista cerrada
de variables, elimina del proceso variables clinicas heredadas y exige:

- `N8N_ENCRYPTION_KEY` de al menos 32 caracteres;
- `N8N_LISTEN_ADDRESS` en loopback;
- `GENERIC_TIMEZONE=America/Guatemala`;
- URLs dedicadas de backend y sistema;
- n8n local exactamente en `2.26.4`.

Copiar `n8n/.env.example` a `n8n/.env`; este ultimo esta ignorado por Git. La
integracion del backend permanece deshabilitada por defecto y solo deben usarse
datos sinteticos. El script no lee `backend/.env` y no inicia si falta la
configuracion minima o la dependencia local.

## Configuracion productiva de ejemplo

`docker-compose.production.example.yml` es un artefacto revisable, no un
despliegue. Exige secretos externos por interpolacion, usa redes y volumenes con
nombres explicitos, reinicio `unless-stopped` y health checks sin credenciales.
`deploy/.env.example` es solo inventario; los valores vacios deben inyectarse
desde un gestor de secretos o el entorno protegido, no desde Git.

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

## Pendiente para el workflow

- crear y revisar el workflow funcional en otro sprint;
- configurar la credencial Header Auth y cualquier proveedor/destinatario;
- validar que nodos y errores no persistan payloads;
- desplegar TLS, firewall, VPN/tunel y backups probados;
- comprobar en el host elegido que las subredes de ejemplo no colisionen;
- decidir un mecanismo de salida de red minimo para el proveedor futuro;
- probar la topologia con Docker en un entorno no productivo.
