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
npm run test:appointments
npm run analyze:bundle
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
|-- components/           # Layout, calendario, selectores de impresion/exportacion, Chatbot, Toast
|-- context/
|   `-- ToastContext.js
|-- hooks/
|   |-- useAuth.js        # Sesion local y /auth/me
|   |-- useToast.js       # Notificaciones
|   `-- useFieldErrors.js # Errores de validacion por campo
|-- pages/                # Vistas principales
|-- utils/                # Fechas, citas, reportes, edad gestacional y errores
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
| `/pacientes/:id/controles/:controlId/editar` | `NuevoControl.jsx` |
| `/pacientes/:id/riesgo` | `FichaRiesgo.jsx` |
| `/pacientes/:id/plan-parto` | `PlanPartoForm.jsx` |
| `/pacientes/:id/puerperio/nuevo` | `PuerperioForm.jsx` |
| `/pacientes/:id/puerperio/:puerperioId/editar` | `PuerperioForm.jsx` |
| `/pacientes/:id/morbilidad/nuevo` | `MorbilidadForm.jsx` |
| `/pacientes/:id/morbilidad/:morbilidadId/editar` | `MorbilidadForm.jsx` |
| `/pacientes/:id/vacunas/nuevo` | `VacunaForm.jsx` |
| `/pacientes/:id/vacunas/:vacunaId/editar` | `VacunaForm.jsx` |
| `/reportes` | `Reportes.jsx` |
| `/mapa-riesgo` | `MapaRiesgo.jsx` |
| `/usuarios` | `Usuarios.jsx` |
| `/comunidades` | `Comunidades.jsx` |
| `/404` y rutas desconocidas | `NotFoundPage.jsx` |

`App.jsx` deja Login y Dashboard en el paquete inicial. Las demas paginas se
cargan por ruta con `React.lazy` y `Suspense`, con un estado de carga breve.
La pagina 404 ofrece volver al inicio o regresar a la vista anterior. Las
rutas clinicas requieren sesion; Usuarios acepta administrador o director y
Comunidades requiere director.

## Modulo de reportes

`/reportes` abre de forma predeterminada **Captadas en primer control** con el
primer dia del mes y la fecha actual calculados en `America/Guatemala`. La
pantalla ofrece seis vistas sin mezclar resultados entre cambios:

- captadas en primer control;
- embarazos activos al momento de consultar;
- FPP en los proximos 30 dias;
- sin control o con mas de 28 dias;
- ficha de riesgo obstetrico positiva;
- resumen por comunidad.

La tabla principal incluye expediente, CUI, nombre, edad al primer control,
etnia, comunidad, FUR, FPP, fecha y semanas del primer control, antecedentes,
riesgo y estado actual. Sus indicadores alto/medio/bajo se calculan sobre las
mismas filas. Excel y PDF solo se muestran si el usuario tiene
`reportes.exportar`; ambos se descargan con el nombre seguro enviado por el
backend. Los formatos usan oficio 8.5 x 13 horizontal y una sola pagina de
ancho. El censo de activos es actual, no una reconstruccion historica.

Las seis vistas permiten exportar Excel o PDF desde `ReportExportModal`, con
seleccion de columnas. La descarga solo se habilita si el reporte consultado
tiene registros y el usuario posee `reportes.exportar`; los cambios de vista o
filtro invalidan el resultado anterior. Los contratos del backend estan en
`../docs/API.md`.

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

El boton de impresion del expediente abre `PrintDocumentsModal`. Permite
descargar expediente MSPAS, plan de parto y ficha de riesgo por separado, o un
unico PDF combinado cuando los tres estan disponibles. La descarga de PDF
comprueba el tipo de respuesta y muestra el error del backend cuando falla.

El Dashboard incluye calendario mensual de citas y una lista de embarazos sin
proxima cita; desde el expediente se pueden asignar citas y dar seguimiento a
inasistencias. La vista movil muestra el mes compacto y las citas del dia
seleccionado.

## Convenciones UI

- Los formularios clinicos deben mostrar errores por campo cuando el backend devuelve `details`.
- Las acciones clinicas deben usar toasts claros.
- No ocultar errores de carga: detener loading y mostrar mensaje visible.
- Las pantallas historicas de embarazo cerrado deben ser solo lectura.
- Formularios y tablas se adaptan a pantallas estrechas; las acciones clinicas
  usan una barra inferior `sticky` con espacio para el area segura movil.
- El selector de impresion se presenta como dialogo y ocupa el ancho movil
  cuando la pantalla es estrecha.
