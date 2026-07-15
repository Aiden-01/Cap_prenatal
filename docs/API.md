# Resumen de API

Base local:

```text
http://localhost:3001/api
```

## Autenticacion

El login devuelve el usuario en JSON y crea una sesion revocable en PostgreSQL.
Escribe tres cookies:

- `cap_prenatal_token`: access JWT httpOnly, corto y con path `/`.
- `cap_prenatal_refresh`: valor aleatorio httpOnly, rotativo y con path `/api/auth`.
- `cap_prenatal_csrf`: token CSRF legible por frontend.

Para `POST`, `PUT`, `PATCH` y `DELETE`, enviar:

```text
X-CSRF-Token: <valor de cookie cap_prenatal_csrf>
```

Las rutas protegidas requieren access JWT y sesion vigente. El middleware carga
usuario y rol actuales desde PostgreSQL; `/auth/me` y refresh no cuentan como
actividad.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `POST` | `/auth/login` | Valida credenciales, crea sesion y cookies. |
| `POST` | `/auth/refresh` | Rota refresh y access sin extender inactividad ni limite absoluto. |
| `POST` | `/auth/activity` | Registra interaccion real con throttling; body estrictamente vacio. |
| `GET` | `/auth/me` | Usuario, rol, permisos y metadata no sensible actuales. |
| `POST` | `/auth/logout` | Revoca la sesion actual y limpia cookies. |
| `POST` | `/auth/logout-all` | Revoca solo todas las sesiones del usuario autenticado. |
| `POST` | `/auth/cambiar-password` | Cambia contraseña y revoca todas sus sesiones. |

Refresh, activity, logout y logout-all requieren `X-CSRF-Token`. Los codigos de
401 incluyen `ACCESS_TOKEN_EXPIRED`, `SESSION_REVOKED`, `SESSION_INACTIVE`,
`SESSION_EXPIRED`, `USER_INACTIVE` o `AUTHENTICATION_REQUIRED` sin exponer
credenciales ni detalles internos.

## Formato de error

```json
{
  "ok": false,
  "message": "Mensaje visible para el usuario",
  "code": "CODIGO_ERROR"
}
```

Si el error viene de Zod, puede incluir:

```json
{
  "details": [
    { "campo": "nombres", "mensaje": "Campo requerido" }
  ]
}
```

## Rutas globales

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/health` | Estado del backend. |

## Auth

Base: `/auth`

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `POST` | `/login` | Inicia sesion. |
| `POST` | `/logout` | Cierra sesion y limpia cookies. |
| `GET` | `/me` | Devuelve usuario autenticado. |
| `POST` | `/cambiar-password` | Cambia contrasena del usuario actual. |

## Usuarios y permisos

Base: `/usuarios`

| Metodo | Ruta | Permiso/rol | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/` | Rol `admin` o `director` | Lista usuarios. |
| `POST` | `/` | Rol `admin` o `director` | Crea usuario. |
| `PUT` | `/:id` | Rol `admin` o `director` | Actualiza usuario. |
| `DELETE` | `/:id` | Rol `admin` o `director` | Desactiva/elimina usuario segun implementacion. |
| `GET` | `/:id/permisos` | Rol `director` | Lista permisos de usuario. |
| `PUT` | `/:id/permisos` | Rol `director` | Actualiza permisos. |

Base: `/permisos`

| Metodo | Ruta | Permiso/rol | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/` | Rol `director` | Catalogo de permisos. |

## Pacientes

Base: `/pacientes`

| Metodo | Ruta | Permiso | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/` | `pacientes.ver` | Lista pacientes con busqueda y paginacion. |
| `POST` | `/` | `pacientes.crear` | Crea paciente y embarazo inicial. |
| `GET` | `/:id` | `pacientes.ver` | Obtiene paciente. |
| `PUT` | `/:id` | `pacientes.editar` | Actualiza paciente. |
| `GET` | `/:id/expediente` | `pacientes.ver` | Expediente completo. Acepta `embarazo_id`. |
| `GET` | `/:id/completitud` | `pacientes.ver` | Estado de completitud del embarazo actual. |
| `POST` | `/:id/embarazos` | `pacientes.editar` | Crea nuevo embarazo activo. |
| `POST` | `/:id/embarazo/puerperio` | `pacientes.editar` | Pasa embarazo activo a puerperio. Requiere `embarazo_id`. |
| `POST` | `/:id/embarazo/cerrar` | `pacientes.editar` | Cierra embarazo activo/puerperio. Requiere `embarazo_id`. |

Parametros importantes:

- `GET /pacientes?buscar=&pagina=1&limite=20`.
- `GET /pacientes/:id/expediente?embarazo_id=12`.
- En rutas clinicas anidadas de escritura, `embarazo_id` es obligatorio y evita escribir en el embarazo equivocado.

## Controles prenatales

Base: `/pacientes/:pacienteId/controles`

| Metodo | Ruta | Permiso | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/` | `pacientes.ver` | Lista controles del embarazo seleccionado. |
| `POST` | `/` | `controles.crear` | Crea control prenatal. |
| `GET` | `/:id` | `pacientes.ver` | Obtiene control. |
| `PUT` | `/:id` | `controles.editar` | Actualiza control. |
| `DELETE` | `/:id` | `controles.editar` | Elimina control. |

PDF de control prenatal:

```text
GET /pacientes/:pacienteId/:controlId/pdf?embarazo_id=:id
```

## Plan de parto

Base: `/pacientes/:pacienteId/controles/plan-parto`

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/` | Obtiene plan de parto del embarazo. |
| `POST` | `/` | Crea o actualiza plan de parto. |

PDF:

```text
GET /pacientes/:pacienteId/plan-parto/pdf?embarazo_id=:id
```

## Puerperio

Base: `/pacientes/:pacienteId/controles/puerperio`

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/` | Lista atenciones de puerperio. |
| `POST` | `/` | Crea atencion de puerperio. |
| `GET` | `/:id` | Obtiene atencion. |
| `PUT` | `/:id` | Actualiza atencion. |
| `DELETE` | `/:id` | Elimina atencion. |

## Riesgo obstetrico

Base: `/pacientes/:pacienteId/riesgo`

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/` | Obtiene ficha de riesgo. |
| `POST` | `/` | Crea ficha. |
| `PUT` | `/` | Actualiza ficha. |
| `DELETE` | `/` | Elimina ficha. |

PDF:

```text
GET /pacientes/:pacienteId/riesgo/pdf?embarazo_id=:id
```

## Laboratorio

Los resultados de laboratorio forman parte de cada control prenatal y se gestionan mediante los endpoints de `/pacientes/:pacienteId/controles`. No existe un endpoint independiente de laboratorio.

La lectura se realiza dentro del expediente y la creacion o actualizacion desde el formulario de controles. Los campos sensibles de VIH conservan la proteccion del permiso `controles.ver_vih` tanto en backend como en frontend.

## Vacunas

Base: `/pacientes/:pacienteId/vacunas`

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/` | Lista vacunas del embarazo. |
| `POST` | `/` | Crea vacuna. |
| `GET` | `/antecedentes` | Lista antecedentes de vacunacion de otros embarazos o registros sin embarazo, excluyendo opcionalmente el embarazo actual. |
| `GET` | `/:id` | Obtiene vacuna. |
| `PUT` | `/:id` | Actualiza vacuna. |
| `DELETE` | `/:id` | Elimina vacuna. |

## Morbilidad

Base: `/pacientes/:pacienteId/morbilidad`

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/` | Lista eventos. |
| `POST` | `/` | Crea evento. |
| `GET` | `/:id` | Obtiene evento. |
| `PUT` | `/:id` | Actualiza evento. |
| `DELETE` | `/:id` | Elimina evento. |

## Referencias

Base: `/pacientes/:pacienteId/referencias`

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/` | Lista referencias. |
| `POST` | `/` | Crea referencia. |
| `PUT` | `/:id` | Actualiza referencia. |
| `DELETE` | `/:id` | Elimina referencia. |

## PDF institucional

Base: `/pacientes/:pacienteId`

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/mspas/pdf` | Ficha MSPAS prenatal completa. |
| `GET` | `/riesgo/pdf` | Ficha de riesgo obstetrico. |
| `GET` | `/plan-parto/pdf` | Plan de parto. |

Todos aceptan `embarazo_id`.

## Reportes

Base: `/reportes`

| Metodo | Ruta | Permiso | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/censo` | `reportes.ver` | Censo mensual. |
| `GET` | `/censo/primer-control` | `reportes.ver` | Censo basado en primer control. |
| `GET` | `/estadisticas` | `reportes.ver` | Indicadores generales. |
| `GET` | `/pacientes-riesgo` | `reportes.ver` | Pacientes con riesgo. |
| `GET` | `/censo/excel` | `reportes.exportar` | Exportacion Excel. |
| `GET` | `/censo/primer-control/excel` | `reportes.exportar` | Exportacion Excel de primer control. |
| `GET` | `/proximas-a-parir` | `reportes.ver` | Pacientes proximas a FPP. |
| `GET` | `/sin-control-reciente` | `reportes.ver` | Pacientes sin control reciente. |

## Mapa de riesgo

Base: `/mapa`

| Metodo | Ruta | Permiso | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/riesgo` | `mapa_riesgo.ver` | Datos geograficos/comunitarios de riesgo. |

## Chatbot

Base: `/chatbot`

Requiere sesion JWT/cookie valida. No usa permisos por codigo en la ruta actual.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `POST` | `/mensaje` | Envia pregunta al asistente local. |
| `POST` | `/feedback` | Registra feedback. |

## Automatizaciones

Base: `/automatizaciones`

Estas rutas no usan JWT. Usan header:

```text
X-CAP-Prenatal-Secret: <AUTOMATION_SECRET>
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/proximas-citas?dias=1` | Datos para recordatorios externos. |
