# Frontend CAP Prenatal

Aplicacion React/Vite para el sistema de expedientes clinicos prenatales del CAP El Chal.

## Stack

- React 19.
- Vite 8.
- React Router.
- Axios.
- Lucide React.
- Leaflet y React Leaflet para mapa de riesgo.
- CSS global en `src/index.css`.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
npm run preview
```

## Variables

| Variable | Descripcion |
| --- | --- |
| `VITE_API_URL` | Base URL del backend. Si no existe, usa `/api`. |

En desarrollo local con backend directo:

```env
VITE_API_URL=http://localhost:3001/api
```

En Docker/Nginx normalmente se usa:

```env
VITE_API_URL=/api
```

## Estructura

```text
src/
|-- api/
|   `-- axios.js          # Cliente HTTP con cookies y CSRF
|-- assets/               # Imagenes estaticas
|-- components/           # Layout, Sidebar, Toast, Chatbot, Semaforo, Timeline
|-- context/
|   `-- ToastContext.js
|-- hooks/
|   |-- useAuth.js        # Sesion local y /auth/me
|   |-- useToast.js       # Notificaciones
|   `-- useFieldErrors.js # Errores de validacion por campo
|-- pages/                # Vistas principales
|-- utils/                # Fechas, edad gestacional y mensajes de error
|-- App.jsx               # Rutas
|-- main.jsx              # Bootstrap React
`-- index.css             # Tema visual global
```

## Rutas principales

| Ruta | Componente |
| --- | --- |
| `/login` | `Login.jsx` |
| `/dashboard` | `Dashboard.jsx` |
| `/pacientes` | `Pacientes.jsx` |
| `/nuevo` | `NuevaPaciente.jsx` |
| `/pacientes/:id` | `ExpedientePaciente.jsx` |
| `/pacientes/:id/editar` | `NuevaPaciente.jsx` |
| `/pacientes/:id/controles/nuevo` | `NuevoControl.jsx` |
| `/pacientes/:id/riesgo` | `FichaRiesgo.jsx` |
| `/pacientes/:id/plan-parto` | `PlanPartoForm.jsx` |
| `/pacientes/:id/puerperio/nuevo` | `PuerperioForm.jsx` |
| `/pacientes/:id/morbilidad/nuevo` | `MorbilidadForm.jsx` |
| `/pacientes/:id/vacunas/nuevo` | `VacunaForm.jsx` |
| `/reportes` | `Reportes.jsx` |
| `/mapa-riesgo` | `MapaRiesgo.jsx` |
| `/usuarios` | `Usuarios.jsx` |

## Autenticacion en frontend

El backend guarda el JWT en cookie httpOnly. El frontend no lee ese token.

`src/api/axios.js` hace lo siguiente:

- Usa `withCredentials: true`.
- Lee `cap_prenatal_csrf` desde cookies.
- Envia `X-CSRF-Token` en `POST`, `PUT`, `PATCH` y `DELETE`.
- Si recibe 401, limpia el usuario local y redirige a `/login`.

## Expediente y embarazo seleccionado

`ExpedientePaciente.jsx` es una pantalla central. Debe preservar estas reglas:

- Carga `GET /pacientes/:id/expediente`.
- Si la URL trae `?embarazo_id=`, lo envia al backend.
- Si no hay `embarazo_id`, el backend decide el embarazo visible.
- El embarazo actualmente mostrado es `embarazo_seleccionado` o `embarazo_activo`.
- Si no existe embarazo, el GET devuelve un expediente de solo lectura con campos de embarazo en `null`; la pantalla muestra un estado vacio y no crea datos.
- `Iniciar embarazo` o `Nuevo embarazo` ejecuta el POST explicito solo para usuarios con `pacientes.editar`; Axios adjunta CSRF.
- La accion no se muestra si existe cualquier embarazo activo o en puerperio. En puerperio se solicita completarlo y cerrarlo; nunca se cierra automaticamente.
- Al navegar a formularios clinicos se debe incluir `embarazo_id`.
- No se deben renderizar acciones clinicas ni construir URLs con un `embarazo_id` ausente.
- Comparar IDs como string, porque los query params son string.
- Si el usuario clickea el embarazo ya seleccionado, no se debe limpiar estado ni recargar.

## Convenciones UI

- Los formularios clinicos deben mostrar errores por campo cuando el backend devuelve `details`.
- Las acciones clinicas deben usar toasts claros.
- No ocultar errores de carga: detener loading y mostrar mensaje visible.
- Las pantallas historicas de embarazo cerrado deben ser solo lectura.
