# Sistema de Gestion de Expedientes Clinicos Prenatales - CAP El Chal

Aplicacion web fullstack para la gestion digital de expedientes clinicos prenatales del Centro de Atencion Permanente (CAP) El Chal, Peten, Guatemala.

El sistema permite registrar pacientes, embarazos, controles prenatales, riesgo obstetrico, laboratorios, vacunas, plan de parto, puerperio, morbilidad, referencias, reportes y documentos PDF alineados a formatos institucionales del MSPAS/CAP.

## Contexto

Este proyecto fue desarrollado como tesis de graduacion universitaria para la Universidad Mariano Galvez de Guatemala, Facultad de Ingenieria en Sistemas.

La solucion esta pensada para el flujo operativo del CAP El Chal. No es una plataforma multitenant ni un producto comercial generico.

## Lectura recomendada

- `docs/GUIA_TECNICA.md`: vision completa del sistema, arquitectura, flujos clinicos y reglas de mantenimiento.
- `docs/API.md`: resumen de endpoints, autenticacion, permisos y parametros importantes.
- `docs/BASE_DATOS.md`: modelo de datos, tablas principales, relacion con embarazos y scripts de base de datos.
- `backend/src/ARCHITECTURE.md`: patron interno del backend por capas.
- `backend/src/AUDITORIA.md`: politica de auditoria y trazabilidad.
- `DOCKER.md`: ejecucion con Docker y notas de despliegue.
- `docs/N8N.md`: integracion con n8n para automatizaciones.

## Tecnologias principales

| Capa | Tecnologia | Uso |
| --- | --- | --- |
| Frontend | React 19, Vite 8, React Router | Interfaz web |
| UI | CSS propio, Tailwind CSS, Lucide React | Estilos e iconos |
| Backend | Node.js, Express 4 | API REST |
| Seguridad | JWT en cookie httpOnly, CSRF, bcryptjs, permisos por codigo | Autenticacion y autorizacion |
| Base de datos | PostgreSQL 14+ | Persistencia clinica |
| Validacion | Zod | Validacion de body, params y query |
| PDF/reportes | pdf-lib, Puppeteer, ExcelJS, LibreOffice/Excel | Documentos institucionales y exportaciones |
| Automatizacion | n8n opcional | Recordatorios y flujos externos |

## Requisitos locales

- Node.js 20 LTS o superior.
- npm.
- PostgreSQL 14 o superior.
- Git.
- En Windows: PowerShell o Windows Terminal.

## Instalacion rapida

Instalar dependencias:

```bash
npm install
cd backend
npm install
cd ../frontend
npm install
```

Crear `backend/.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cap_prenatal
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false
JWT_SECRET=cambiar_por_una_clave_larga_y_segura
JWT_EXPIRES_IN=8h
PORT=3001
FRONTEND_URL=http://localhost:5173
COOKIE_SAMESITE=lax
AUTOMATION_SECRET=cambiar_por_un_secreto_largo_para_n8n
```

Crear base de datos:

```sql
CREATE DATABASE cap_prenatal;
```

Ejecutar migracion principal:

```bash
cd backend
npm run db:migrate
```

Opcional para datos iniciales:

```bash
npm run db:seed
```

## Desarrollo local

Terminal 1, backend:

```bash
cd backend
npm run dev
```

Backend:

```text
http://localhost:3001/api/health
```

Terminal 2, frontend:

```bash
cd frontend
npm run dev
```

Frontend:

```text
http://localhost:5173
```

## Scripts utiles

Raiz:

| Script | Descripcion |
| --- | --- |
| `npm run n8n:local` | Arranca n8n local con PowerShell. |
| `npm run db:migrate-bi` | Ejecuta migracion de vistas BI desde backend. |
| `npm run db:seed-bi` | Inserta datos demo para BI. |
| `npm run test:vistas-bi` | Valida vistas BI. |

Backend:

| Script | Descripcion |
| --- | --- |
| `npm run dev` | Servidor Express con nodemon. |
| `npm start` | Servidor Express sin recarga automatica. |
| `npm run db:migrate` | Aplica `backend/src/db/schema.sql`. |
| `npm run db:seed` | Crea datos iniciales de desarrollo. |
| `npm run db:seed-demo-patients` | Crea pacientes demo. |
| `npm run test:embarazo-activo` | Validacion manual del flujo de embarazo activo. |

Frontend:

| Script | Descripcion |
| --- | --- |
| `npm run dev` | Servidor Vite. |
| `npm run build` | Build de produccion. |
| `npm run lint` | ESLint. |
| `npm run preview` | Sirve el build localmente. |

## Estructura del proyecto

```text
cap_prenatal/
|-- backend/
|   |-- src/
|   |   |-- assets/          # Formularios oficiales, imagenes MSPAS y plantillas base
|   |   |-- config/          # Coordenadas y configuracion de documentos
|   |   |-- controllers/     # Traduccion HTTP -> servicios
|   |   |-- db/              # Pool PostgreSQL, schema, migraciones y seeds
|   |   |-- middleware/      # Auth, CSRF, permisos, validacion y errores
|   |   |-- repositories/    # SQL y acceso a datos
|   |   |-- routes/          # Rutas Express por modulo
|   |   |-- services/        # Reglas de negocio y auditoria
|   |   |-- templates/       # HTML e imagenes para documentos
|   |   |-- utils/           # Utilidades compartidas
|   |   |-- ARCHITECTURE.md  # Patron backend
|   |   `-- AUDITORIA.md     # Politica de auditoria
|   `-- package.json
|-- frontend/
|   |-- src/
|   |   |-- api/             # Cliente Axios
|   |   |-- components/      # Layout, sidebar, toast, chatbot, semaforo
|   |   |-- context/         # Contextos React
|   |   |-- hooks/           # Auth, toast y errores de campo
|   |   |-- pages/           # Vistas principales
|   |   `-- utils/           # Fechas, edad gestacional y errores
|   `-- package.json
|-- docs/                    # Documentacion operativa y tecnica
|-- docker-compose.yml
|-- DOCKER.md
`-- README.md
```

## Modulos funcionales

- Autenticacion, usuarios, roles y permisos.
- Pacientes y expediente clinico.
- Historial de embarazos por paciente.
- Controles prenatales.
- Ficha de riesgo obstetrico.
- Laboratorio.
- Vacunas.
- Plan de parto.
- Puerperio.
- Morbilidad.
- Referencias.
- Mapa de riesgo.
- Reportes y exportacion Excel.
- PDF institucional MSPAS/CAP.
- Chatbot de ayuda operativa.
- Automatizaciones para n8n.

## Conceptos clave

- La paciente puede tener varios embarazos, pero solo uno activo a la vez.
- El expediente se carga para un embarazo seleccionado. Si la URL trae `?embarazo_id=`, se consulta ese embarazo; si no, el backend resuelve el embarazo visible preferente.
- Los embarazos cerrados son de solo lectura.
- Los endpoints de escritura deben validar permisos y registrar auditoria cuando modifican estado.
- La auditoria no debe guardar contrasenas, tokens ni snapshots clinicos innecesariamente grandes.
- Los campos sensibles de VIH se filtran segun permisos.

## Docker

Para levantar PostgreSQL, backend, frontend y n8n:

```bash
docker compose up --build
```

Servicios:

```text
Frontend: http://localhost:8080
Backend:  http://localhost:3001/api/health
n8n:      http://localhost:5678
Postgres: localhost:5432
```

Mas detalles en `DOCKER.md`.

## Autor y uso

Autor: Hugo Corado.

Proyecto academico para la Universidad Mariano Galvez de Guatemala, con uso institucional previsto para el Centro de Atencion Permanente CAP El Chal, Peten, Guatemala.
