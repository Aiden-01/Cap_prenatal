# Sistema de Gestión de Expedientes Clínicos Prenatales — CAP El Chal

Aplicación web fullstack para la gestión digital de expedientes clínicos prenatales del Centro de Atención Permanente (CAP) El Chal, Petén, Guatemala.

El sistema permite registrar, consultar y dar seguimiento a la ficha de primera consulta prenatal y a los controles prenatales según formularios oficiales del Ministerio de Salud Pública y Asistencia Social de Guatemala (MSPAS). También integra gestión de riesgo obstétrico, laboratorios, vacunas, plan de parto, puerperio, morbilidad y generación de reportes en PDF fieles al formato institucional.

## Contexto institucional

Este proyecto fue desarrollado como tesis de graduación universitaria para la Universidad Mariano Gálvez de Guatemala (UMG), Facultad de Ingeniería en Sistemas.

La solución está orientada al personal de salud del CAP El Chal, con el propósito de apoyar la digitalización de expedientes clínicos prenatales, reducir la dependencia de registros manuales, facilitar la consulta histórica de pacientes embarazadas y mejorar la generación de reportes clínicos y administrativos.

El sistema es de uso exclusivo para el CAP El Chal. No está diseñado como plataforma multitenancy ni como producto comercial.

## 🧰 Tecnologías utilizadas

| Capa | Tecnología | Uso principal |
| --- | --- | --- |
| Frontend | React 19 + Vite 8 | Interfaz web de usuario |
| Estilos | Tailwind CSS 3 | Diseño responsivo y utilidades CSS |
| Iconos | Lucide React | Iconografía de la interfaz |
| Fuentes | Syne, DM Sans | Tipografía de encabezados y cuerpo |
| Backend | Node.js + Express 4 | API REST y lógica del sistema |
| Autenticación | JWT + bcryptjs | Inicio de sesión y protección de rutas |
| Base de datos | PostgreSQL 14+ | Persistencia de expedientes clínicos |
| Reportes | pdf-lib, Puppeteer, ExcelJS | Generación de PDF y reportes |

## 📦 Requisitos previos

### Windows

- Node.js 20 LTS o superior.
- npm incluido con Node.js.
- PostgreSQL 14 o superior.
- Git para Windows.
- Terminal recomendada: PowerShell o Windows Terminal.

Instalación sugerida:

```bash
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL
winget install Git.Git
```

### macOS

- Node.js 20 LTS o superior.
- npm incluido con Node.js.
- PostgreSQL 14 o superior.
- Git.
- Homebrew recomendado para instalación de paquetes.

Instalación sugerida:

```bash
brew install node
brew install postgresql@14
brew install git
```

### Linux

- Node.js 20 LTS o superior.
- npm.
- PostgreSQL 14 o superior.
- Git.

Ejemplo en distribuciones basadas en Debian/Ubuntu:

```bash
sudo apt update
sudo apt install nodejs npm postgresql postgresql-contrib git
```

> Nota: en algunos sistemas Linux, los repositorios oficiales pueden incluir una versión antigua de Node.js. Para desarrollo se recomienda usar NodeSource, nvm o el gestor de paquetes oficial de la distribución.

## ⚙️ Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
cd cap_prenatal
```

### 2. Instalar dependencias del backend

```bash
cd backend
npm install
```

### 3. Instalar dependencias del frontend

```bash
cd ../frontend
npm install
```

### 4. Configurar variables de entorno del backend

Crear un archivo `.env` dentro de la carpeta `backend`:

```bash
cd ../backend
```

Ejemplo de archivo `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/cap_prenatal
JWT_SECRET=clave_segura_para_firmar_tokens
PORT=3001
```

### 5. Crear la base de datos

Ingresar a PostgreSQL y crear la base de datos:

```sql
CREATE DATABASE cap_prenatal;
```

También puede hacerse desde terminal:

#### Windows

```bash
createdb -U postgres cap_prenatal
```

#### macOS / Linux

```bash
createdb cap_prenatal
```

### 6. Ejecutar el script SQL de migración

El esquema principal se encuentra en:

```text
backend/src/db/schema.sql
```

Ejecutar el script manualmente en PostgreSQL:

#### Windows

```bash
psql -U postgres -d cap_prenatal -f backend/src/db/schema.sql
```

#### macOS / Linux

```bash
psql -d cap_prenatal -f backend/src/db/schema.sql
```

También existe un script de apoyo en el backend:

```bash
cd backend
npm run db:migrate
```

### 7. Ejecutar el proyecto

El proyecto se ejecuta con dos procesos separados: backend y frontend.

## 🚀 Desarrollo local

### Terminal 1: backend

```bash
cd backend
npm start
```

El backend quedará disponible en:

```text
http://localhost:3001
```

Para desarrollo con recarga automática:

```bash
npm run dev
```

### Terminal 2: frontend

```bash
cd frontend
npm run dev
```

El frontend quedará disponible en:

```text
http://localhost:5173
```

## 📁 Estructura de carpetas

```text
cap_prenatal/
├── backend/
│   ├── src/
│   │   ├── assets/          # Recursos para formularios oficiales y PDF MSPAS
│   │   ├── config/          # Configuración general del backend
│   │   ├── controllers/     # Controladores de la API
│   │   ├── db/              # Conexión, esquema SQL, migraciones y semillas
│   │   ├── middleware/      # Middlewares de autenticación y seguridad
│   │   ├── routes/          # Rutas Express por módulo
│   │   ├── services/        # Servicios de negocio y generación de documentos
│   │   ├── templates/       # Plantillas utilizadas para reportes
│   │   ├── utils/           # Utilidades compartidas
│   │   └── index.js         # Punto de entrada del servidor
│   ├── package.json
│   └── .env                 # Variables de entorno locales
├── frontend/
│   ├── public/              # Archivos públicos del frontend
│   ├── src/
│   │   ├── api/             # Cliente HTTP y consumo de API
│   │   ├── assets/          # Recursos estáticos del frontend
│   │   ├── components/      # Componentes reutilizables
│   │   ├── context/         # Contextos globales de React
│   │   ├── hooks/           # Hooks personalizados
│   │   ├── pages/           # Vistas principales del sistema
│   │   └── utils/           # Funciones auxiliares
│   ├── package.json
│   └── vite.config.js       # Configuración de Vite
├── package.json
└── README.md
```

## 🔐 Variables de entorno

| Variable | Descripción | Ejemplo |
| --- | --- | --- |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL utilizada por el backend. | `postgresql://postgres:password@localhost:5432/cap_prenatal` |
| `JWT_SECRET` | Clave secreta para firmar y validar tokens JWT. Debe mantenerse privada. | `cambiar_por_una_clave_segura` |
| `PORT` | Puerto donde se ejecuta el servidor Express. Si no se define, se usa `3001`. | `3001` |

## 🗂️ Módulos del sistema

| No. | Módulo | Función principal |
| --- | --- | --- |
| 1 | Autenticación | Permite el inicio de sesión del personal autorizado mediante usuario, contraseña y token JWT. |
| 2 | Panel principal | Presenta una vista general del sistema, accesos rápidos e indicadores para el seguimiento operativo. |
| 3 | Pacientes y ficha prenatal | Registra y consulta datos generales de la paciente, antecedentes y ficha de primera consulta prenatal. |
| 4 | Controles prenatales | Gestiona el seguimiento clínico de cada consulta prenatal, incluyendo evaluación materna y fetal. |
| 5 | Riesgo obstétrico | Registra factores de riesgo, clasificación y criterios de seguimiento según la condición de la paciente. |
| 6 | Laboratorios y vacunas | Administra resultados de laboratorio, estudios requeridos y registro de vacunación asociada al control prenatal. |
| 7 | Plan de parto, puerperio y morbilidad | Documenta el plan de parto, controles posteriores y eventos de morbilidad relacionados. |
| 8 | Reportes y PDF MSPAS | Genera reportes, censo mensual y documentos PDF alineados al formato oficial del MSPAS. |

## 🖼️ Capturas de pantalla

### Inicio de sesión

[imagen aquí]

### Panel principal

[imagen aquí]

### Expediente clínico prenatal

[imagen aquí]

### Reporte PDF MSPAS

[imagen aquí]

## 📝 Notas de implementación

- La aplicación está orientada a un equipo pequeño del CAP El Chal, por lo que utiliza autenticación simple y no implementa multitenancy.
- Las fechas se muestran en formato local de Guatemala mediante `toLocaleDateString("es-GT")`.
- El backend utiliza CommonJS.
- El frontend se ejecuta con Vite en el puerto `5173`.
- El backend se ejecuta por defecto en el puerto `3001`.
- PostgreSQL 14 o superior es requerido para la base de datos.

## 🎓 Autor y contexto académico

| Campo | Información |
| --- | --- |
| Autor | Hugo Yondani Corado Hernández |
| Carné | 690-21-10427 |
| Universidad | Universidad Mariano Gálvez de Guatemala |
| Facultad | Facultad de Ingeniería en Sistemas |
| Tipo de proyecto | Tesis de graduación universitaria |
| Institución beneficiaria | Centro de Atención Permanente (CAP) El Chal, Petén, Guatemala |

## 📄 Licencia

Este proyecto fue desarrollado con fines académicos como parte de una tesis de graduación universitaria.

Su uso está autorizado exclusivamente para el Centro de Atención Permanente (CAP) El Chal, Petén, Guatemala. Queda restringida su distribución, modificación o implementación fuera del contexto institucional y académico correspondiente sin autorización del autor y de la institución beneficiaria.
