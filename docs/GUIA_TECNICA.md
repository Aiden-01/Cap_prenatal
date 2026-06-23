# Guia tecnica del proyecto CAP Prenatal

Esta guia explica como esta armado el sistema, que decisiones importantes ya existen y como mantenerlo sin romper flujos clinicos.

## Resumen ejecutivo

CAP Prenatal es una aplicacion web para administrar expedientes clinicos prenatales. El nucleo del dominio es:

1. Una paciente se registra una vez.
2. Una paciente puede tener muchos embarazos.
3. Solo debe existir un embarazo `activo` por paciente.
4. Los registros clinicos se asocian al embarazo correspondiente.
5. El expediente puede consultarse por embarazo usando `?embarazo_id=`.
6. Los embarazos cerrados son historicos y deben tratarse como solo lectura.

## Arquitectura general

```text
React/Vite
   |
   | Axios con cookies y CSRF
   v
Express API /api
   |
   | routes -> controllers -> services -> repositories
   v
PostgreSQL
```

El frontend no accede directamente a la base de datos. Toda operacion clinica pasa por el backend.

## Backend

Ruta principal:

```text
backend/src/index.js
```

Responsabilidades:

- Cargar variables de entorno desde `backend/.env`.
- Configurar Helmet, CORS, JSON body limit y CSRF.
- Montar rutas bajo `/api`.
- Exponer `/api/health`.
- Delegar errores a `middleware/errorHandler.js`.

### Capas

El backend sigue este patron:

```text
routes -> controllers -> services -> repositories
```

- `routes`: define URL, middleware de autenticacion, permisos y validacion.
- `controllers`: traduce HTTP a llamadas de servicio y arma respuestas.
- `services`: aplica reglas de negocio, normaliza datos, coordina repositorios y auditoria.
- `repositories`: concentra SQL y acceso a PostgreSQL.
- `validations`: schemas Zod por modulo.

El documento canonico del patron esta en `backend/src/ARCHITECTURE.md`.

### Seguridad backend

Autenticacion:

- Login en `POST /api/auth/login`.
- JWT firmado con `JWT_SECRET`.
- Token guardado en cookie httpOnly `cap_prenatal_token`.
- Token CSRF guardado en cookie legible `cap_prenatal_csrf`.

CSRF:

- Aplica a `POST`, `PUT`, `PATCH` y `DELETE`.
- El frontend envia `X-CSRF-Token`.
- Login queda exceptuado porque aun no hay token.

Permisos:

- Se cargan con `cargarPermisos`.
- Se validan con `verificarPermiso("codigo.permiso")`.
- Algunos endpoints administrativos usan rol `director`.

Errores:

- Usar `AppError` o `HttpError` para errores esperados.
- El `errorHandler` convierte errores Zod, PostgreSQL y de negocio en JSON uniforme.

Respuesta de error esperada:

```json
{
  "ok": false,
  "message": "Mensaje claro",
  "code": "CODIGO_ERROR"
}
```

## Frontend

Ruta principal:

```text
frontend/src/App.jsx
```

El frontend usa:

- React Router para navegacion.
- `Layout.jsx` como shell autenticado.
- `api/axios.js` para llamadas HTTP.
- `useAuth` para sesion local.
- `useToast` y `ToastContext` para notificaciones.

### Cliente HTTP

Archivo:

```text
frontend/src/api/axios.js
```

Comportamiento:

- `baseURL` usa `VITE_API_URL` o `/api`.
- `withCredentials: true` permite cookies de sesion.
- Para escrituras agrega `X-CSRF-Token` desde cookie.
- Si recibe 401, limpia usuario local y redirige a `/login`, salvo que la request use `skipAuthRedirect`.

### Rutas frontend principales

| Ruta | Vista | Uso |
| --- | --- | --- |
| `/login` | `Login.jsx` | Inicio de sesion |
| `/dashboard` | `Dashboard.jsx` | Panel principal |
| `/pacientes` | `Pacientes.jsx` | Busqueda/listado |
| `/nuevo` | `NuevaPaciente.jsx` | Crear paciente |
| `/pacientes/:id` | `ExpedientePaciente.jsx` | Expediente por embarazo |
| `/pacientes/:id/editar` | `NuevaPaciente.jsx` | Editar paciente |
| `/pacientes/:id/controles/nuevo` | `NuevoControl.jsx` | Crear control prenatal |
| `/pacientes/:id/riesgo` | `FichaRiesgo.jsx` | Ficha de riesgo |
| `/pacientes/:id/plan-parto` | `PlanPartoForm.jsx` | Plan de parto |
| `/pacientes/:id/puerperio/nuevo` | `PuerperioForm.jsx` | Puerperio |
| `/pacientes/:id/morbilidad/nuevo` | `MorbilidadForm.jsx` | Morbilidad |
| `/pacientes/:id/vacunas/nuevo` | `VacunaForm.jsx` | Vacunas |
| `/reportes` | `Reportes.jsx` | Reportes |
| `/mapa-riesgo` | `MapaRiesgo.jsx` | Mapa de riesgo |
| `/usuarios` | `Usuarios.jsx` | Administracion, solo director |

## Flujo de expediente y embarazo

El expediente se carga desde:

```text
GET /api/pacientes/:id/expediente
GET /api/pacientes/:id/expediente?embarazo_id=:embarazoId
```

Reglas:

- Sin `embarazo_id`, el backend selecciona el embarazo visible preferente: activo, luego puerperio, luego cerrado mas reciente.
- Con `embarazo_id`, el backend valida que el embarazo exista y pertenezca a la paciente.
- La respuesta incluye `embarazo_seleccionado`, `embarazo_actual`, `embarazo_activo`, `is_read_only` e `is_embarazo_actual`.
- El frontend debe comparar IDs como string porque la URL siempre entrega strings.
- Si el usuario selecciona el mismo embarazo, no debe limpiar estado ni recargar.
- Si selecciona otro embarazo, se actualiza `?embarazo_id=` y se recarga el expediente.
- Las escrituras clinicas asociadas a embarazo deben enviar `embarazo_id`; el backend lo exige con `requerirEmbarazoId` para controles, riesgo, plan de parto, puerperio, vacunas, morbilidad y cambios de estado del embarazo.

Estados de embarazo:

| Estado | Significado | Edicion |
| --- | --- | --- |
| `activo` | Embarazo en seguimiento prenatal | Editable |
| `puerperio` | Seguimiento posterior al parto o cierre prenatal | Editable para puerperio |
| `cerrado` | Historico | Solo lectura |

## Flujos clinicos principales

### Crear paciente

1. Frontend envia datos generales a `POST /api/pacientes`.
2. Backend normaliza fechas, edad, FUR/FPP y campos booleanos.
3. Se crea paciente.
4. Se crea embarazo inicial activo con FUR/FPP.
5. Se auditan paciente y embarazo.

### Actualizar paciente

1. Frontend envia `PUT /api/pacientes/:id`.
2. Backend filtra campos sensibles segun permisos.
3. Se actualizan campos permitidos.
4. Si cambia FUR/FPP, se sincronizan fechas del embarazo activo.
5. Se audita el cambio.

### Nuevo embarazo

1. `POST /api/pacientes/:id/embarazos`.
2. Se cierran embarazos en seguimiento.
3. Se valida que no quede otro embarazo activo.
4. Se crea un nuevo embarazo activo con numero consecutivo.
5. Se sincroniza FUR/FPP en paciente.
6. Se audita cierre anterior, nuevo embarazo y paciente actualizado.

### Pasar a puerperio

1. `POST /api/pacientes/:id/embarazo/puerperio?embarazo_id=:id`.
2. Requiere embarazo activo.
3. Cambia estado a `puerperio`.
4. Registra fecha de parto/cierre si aplica.
5. Audita cambio de estado.

### Cerrar embarazo

1. `POST /api/pacientes/:id/embarazo/cerrar?embarazo_id=:id`.
2. Requiere embarazo activo o puerperio.
3. Cambia estado a `cerrado`.
4. El expediente queda historico/solo lectura.
5. Audita cambio de estado.

### Vacunas y antecedentes

Las vacunas propias del embarazo seleccionado se leen desde:

```text
GET /api/pacientes/:pacienteId/vacunas?embarazo_id=:id
```

Los antecedentes de vacunacion se leen desde:

```text
GET /api/pacientes/:pacienteId/vacunas/antecedentes?excluir_embarazo_id=:id
```

Reglas:

- Las vacunas del embarazo seleccionado son editables solo si el embarazo esta `activo` o `puerperio`.
- Las vacunas de otros embarazos se muestran como antecedentes.
- Una vacuna sin `embarazo_id` se considera antecedente de solo lectura.
- Para crear, actualizar o eliminar vacunas, `embarazo_id` es obligatorio.

## PDF y reportes

PDF institucionales:

- Ficha MSPAS prenatal.
- Ficha de riesgo obstetrico.
- Plan de parto.
- Control prenatal individual.

La generacion usa una mezcla de:

- Assets oficiales en `backend/src/assets`.
- Coordenadas en `backend/src/config`.
- `pdf-lib`.
- Puppeteer.
- Excel/LibreOffice para ciertos flujos de formatos.

En Docker/Linux se recomienda:

```env
PDF_EXCEL_ENGINE=libreoffice
LIBREOFFICE_PATH=/usr/bin/soffice
```

En Windows con Excel instalado se puede usar:

```env
PDF_EXCEL_ENGINE=excel
```

## Automatizaciones y n8n

El backend expone endpoints de automatizacion bajo:

```text
/api/automatizaciones
```

El endpoint actual relevante:

```text
GET /api/automatizaciones/proximas-citas?dias=1
```

Requiere header:

```text
X-CAP-Prenatal-Secret: <AUTOMATION_SECRET>
```

En codigo el header se lee como `x-cap-prenatal-secret`.

Mas detalle operativo en `docs/N8N.md`.

## Pendientes y fuera de alcance

Pendientes tecnicos detectados:

- `backend/src/routes/laboratorio.js` existe, pero no esta montada como ruta publica en `index.js` ni bajo `routes/pacientes.js`. No consumir `/api/pacientes/:pacienteId/laboratorio` hasta definir y montar oficialmente esa ruta.

Fuera de alcance actual:

- Multitenancy para varios centros de salud.
- Diagnostico o seguimiento confirmado de VIH; el sistema solo registra tamizaje segun flujo prenatal.
- Gestion externa completa de n8n; el proyecto documenta la integracion y el endpoint, pero los workflows se administran aparte.
- Distribucion comercial del sistema.

## Convenciones de desarrollo

- Mantener cambios de backend en la capa correcta.
- No poner SQL nuevo en controllers.
- No duplicar reglas de embarazo en frontend; el backend es la fuente de verdad.
- En frontend, preservar `embarazo_id` al navegar hacia formularios clinicos.
- Comparar IDs de URL como string.
- Para escrituras clinicas, registrar auditoria.
- La auditoria es hibrida: algunos modulos usan `services/auditService.js` y otros utilidades compatibles en `utils/auditoria.js`; ambos caminos escriben en `auditoria_eventos`.
- No guardar tokens, contrasenas ni secretos en logs o auditoria.
- Usar Zod para nuevos endpoints.
- Preferir mensajes de error claros para el personal de salud.

## Variables de entorno importantes

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexion PostgreSQL completa. Alternativa a `DB_*`. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexion PostgreSQL por partes. |
| `DB_SSL` | Activa SSL para base de datos. |
| `DB_SSL_REJECT_UNAUTHORIZED` | Controla validacion de certificado SSL. |
| `JWT_SECRET` | Firma de JWT. Obligatoria. |
| `JWT_EXPIRES_IN` | Duracion de sesion. Default `8h`. |
| `PORT` | Puerto backend. Default `3001`. |
| `FRONTEND_URL` | Origenes permitidos por CORS, separados por coma. |
| `COOKIE_SAMESITE` | Politica SameSite de cookies. Default `lax`. |
| `JSON_BODY_LIMIT` | Limite del body JSON. Default `1mb`. |
| `AUTOMATION_SECRET` | Secreto para endpoints n8n. |
| `PDF_EXCEL_ENGINE` | `auto`, `excel` o `libreoffice`. |
| `LIBREOFFICE_PATH` | Ruta a `soffice` cuando se usa LibreOffice. |
| `VITE_API_URL` | Base URL del API en frontend. |

## Checklist para cambios futuros

Antes de entregar un cambio:

1. Confirmar que el flujo respeta el embarazo seleccionado.
2. Confirmar que los historicos cerrados no permiten escrituras.
3. Confirmar permisos necesarios.
4. Confirmar auditoria en cambios de estado o datos clinicos.
5. Ejecutar al menos `npm run build` en frontend si se toco UI.
6. Ejecutar `node --check` o carga de modulos si se toco backend.
7. Actualizar docs si cambia una ruta, tabla, variable de entorno o regla clinica.
