# Docker para desarrollo local

`docker-compose.yml` es exclusivamente una comodidad de desarrollo. Publica
PostgreSQL, backend, frontend y n8n, y no debe exponerse directamente a Internet
ni utilizarse como plantilla de produccion.

El proyecto incluye:

- `backend/Dockerfile`: API Node.js con Chromium instalado para Puppeteer.
- `frontend/Dockerfile`: build de Vite servido con Nginx.
- `docker-compose.yml`: PostgreSQL, backend y frontend para pruebas locales.

## Preparacion local

Copiar `.env.example` a `.env` en la raiz y completar los valores vacios.
`POSTGRES_PASSWORD`, `JWT_SECRET` y `N8N_ENCRYPTION_KEY` no tienen fallback:
Compose falla antes de crear contenedores si falta cualquiera de ellos. Genere
un valor aleatorio diferente para cada variable con uno de los comandos indicados
en `.env.example`.

El `.env` local esta ignorado por Git. No lo adjunte a incidencias ni lo copie a
documentacion.

## Uso local

Levantar todo:

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

Ejecutar migracion dentro del contenedor:

```bash
docker compose exec backend npm run db:migrate
```

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

La imagen n8n y la dependencia local estan fijadas en `2.26.4`. Revisar notas de
version, respaldar el volumen y probar restauracion antes de cualquier
actualizacion.

Consulte `docs/ROTACION_SECRETOS.md` antes de preparar cualquier entorno nuevo.

## Nota sobre PDF

Los PDF basados en Puppeteer quedan cubiertos por el contenedor porque instala Chromium y define `PUPPETEER_EXECUTABLE_PATH`.

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
