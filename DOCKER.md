# Docker y despliegue

El proyecto incluye contenedores para probar un entorno parecido a produccion:

- `backend/Dockerfile`: API Node.js con Chromium instalado para Puppeteer.
- `frontend/Dockerfile`: build de Vite servido con Nginx.
- `docker-compose.yml`: PostgreSQL, backend y frontend para pruebas locales.

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
```

Ejecutar migracion dentro del contenedor:

```bash
docker compose exec backend npm run db:migrate
```

Crear usuarios demo, solo para pruebas:

```bash
docker compose exec backend npm run db:seed
```

## Variables para AWS/RDS

```env
DB_HOST=<endpoint-rds>
DB_PORT=5432
DB_NAME=cap_prenatal
DB_USER=<usuario>
DB_PASSWORD=<password>
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
JWT_SECRET=<clave-larga-y-segura>
NODE_ENV=production
FRONTEND_URL=https://<dominio-frontend>
COOKIE_SAMESITE=lax
```

Tambien se puede usar `DATABASE_URL` en lugar de las variables `DB_*`.

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
