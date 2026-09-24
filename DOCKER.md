# Docker para desarrollo local

`docker-compose.yml` es exclusivamente una comodidad de desarrollo. Publica
PostgreSQL, backend, frontend y n8n, y no debe exponerse directamente a Internet
ni utilizarse como plantilla de produccion.

El proyecto incluye:

- `backend/Dockerfile`: API Node.js con Chromium para Puppeteer y LibreOffice Calc para conversiones PDF.
- `frontend/Dockerfile`: build de Vite servido con Nginx.
- `docker-compose.yml`: PostgreSQL, backend, n8n y frontend para pruebas locales.

## Preparacion local

Copiar `.env.example` a `.env` en la raiz y completar los valores vacios.
`POSTGRES_PASSWORD`, `JWT_SECRET` y `N8N_ENCRYPTION_KEY` no tienen fallback:
Compose falla antes de crear contenedores si falta cualquiera de ellos. Genere
un valor aleatorio diferente para cada variable con uno de los comandos indicados
en `.env.example`.

El `.env` local esta ignorado por Git. No lo adjunte a incidencias ni lo copie a
documentacion.

## Uso local

Preparar la base y aplicar las migraciones antes del primer arranque del backend:

```bash
docker compose build backend
docker compose up -d postgres
docker compose run --rm backend npm run db:migrate
docker compose up --build
```

En arranques posteriores, con el esquema al día:

```bash
docker compose up --build
```

Servicios locales:

```text
Frontend: http://localhost:8080
Backend:  http://localhost:3001/api/health
Postgres: localhost:5432
n8n UI:   http://127.0.0.1:5678
```

Todos los puertos locales se ligan a `127.0.0.1`. Los servicios usan redes
separadas: frontend/backend, backend/PostgreSQL y n8n/backend. n8n no comparte
red con PostgreSQL y la integracion M2M del backend permanece deshabilitada.
Los datos de PostgreSQL y la configuración de n8n persisten en los volúmenes
`cap_prenatal_local_postgres_data` y `cap_prenatal_local_n8n_data`.

Con el backend ya saludable, también se pueden aplicar migraciones pendientes
dentro del contenedor:

```bash
docker compose exec backend npm run db:migrate
```

El comando aplica las migraciones pendientes hasta
`017_citas_inasistencias.sql`; el backend comprueba al iniciar que el esquema
requerido está aplicado. Respalde el volumen antes de migrar datos existentes.

Crear la cuenta director inicial, solo cuando sea necesaria:

1. Completar en el `.env` de la raiz `SEED_DIRECTOR_NAME`,
   `SEED_DIRECTOR_USERNAME` y `SEED_DIRECTOR_PASSWORD`.
2. Ejecutar:

```bash
docker compose exec backend npm run db:seed
```

El seed no modifica la contrasena de una cuenta existente. En produccion queda
bloqueado salvo que se proporcione tambien la confirmacion explicita descrita en
`docs/ROTACION_SECRETOS.md`.

## Produccion

`docker-compose.production.example.yml` documenta la topologia endurecida, pero
no es un despliegue listo para ejecutar. No contiene secretos, publica solo el
proxy y separa las redes de aplicacion, datos y automatizacion. Debe revisarse
para el host concreto, TLS, firewall, subredes, backups, permisos y gestor de
secretos.

No usar el Compose local en servidores. El archivo `deploy/.env.example` es un
inventario; no debe convertirse en almacen de secretos productivos. El backend
acepta `DATABASE_URL` o todas las variables `DB_*`, pero valida la configuracion
antes de cargar rutas.

La imagen n8n está fijada en `2.34.4` y el paquete comunitario
`n8n-nodes-resend` en `2.8.0`. Revisar notas de versión, respaldar el volumen
`n8n_data` junto con `N8N_ENCRYPTION_KEY` y probar restauración antes de
actualizarlos.

Ningún Compose importa ni activa workflows automáticamente. Los seis JSON Resend
de `n8n/workflows/` son los artefactos operativos actuales y requieren importar,
asignar credenciales Header Auth y Resend y configurar remitente y destinatario
autorizados. `proximas-citas-v1.json` es un artefacto SMTP heredado. La
configuración productiva limita la concurrencia global a 1 con
`N8N_CONCURRENCY_PRODUCTION_LIMIT=1`. Las URLs de CAP se configuran como
variables de proyecto n8n; el acceso global a `$env` queda bloqueado.

No agregar n8n a `data_internal`, no darle credenciales PostgreSQL y no publicar
5678. El flujo actual envía correo mediante Resend por HTTPS saliente; el
ejemplo productivo requiere configurar y limitar ese egreso antes de desplegar.

Consulte `docs/ROTACION_SECRETOS.md` antes de preparar cualquier entorno nuevo.

## Nota sobre PDF

Los PDF basados en Puppeteer quedan cubiertos por el contenedor porque instala Chromium y define `PUPPETEER_EXECUTABLE_PATH`. La imagen termina con `USER node`: Node y Chromium no se ejecutan como root y Chromium conserva su sandbox, sin `--no-sandbox` ni `--disable-setuid-sandbox`.

Los reportes basados en plantillas Excel tambien son compatibles con Docker/AWS mediante LibreOffice headless. El backend elige el motor con `PDF_EXCEL_ENGINE`:

```env
PDF_EXCEL_ENGINE=auto
```

Valores disponibles:

- `auto`: usa Excel COM en Windows y LibreOffice en Linux.
- `excel`: fuerza Microsoft Excel mediante PowerShell/COM. Requiere Windows con Excel instalado.
- `libreoffice`: fuerza LibreOffice headless. Es el modo usado por Docker/AWS.

En Docker se define:

```env
PDF_EXCEL_ENGINE=libreoffice
LIBREOFFICE_PATH=/usr/bin/soffice
```

Las conversiones externas de LibreOffice y PowerShell/Excel tienen un timeout interno de 120 segundos. Si se excede, el backend termina solo el arbol de procesos creado por esa conversion, elimina su directorio temporal y devuelve un error generico. En Windows la terminacion usa el PID de la instancia creada; nunca finaliza globalmente `Excel.exe`.

Esta configuracion y sus pruebas aisladas no equivalen a una validacion real de
Docker. Siguen pendientes el build y arranque de la imagen, el usuario efectivo,
el healthcheck y las conversiones reales con Chromium y LibreOffice en un host
que tenga Docker disponible.
