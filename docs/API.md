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
| `GET` | `/:id/expediente` | `pacientes.ver` | Expediente completo de solo lectura. Acepta `embarazo_id` y nunca crea registros. |
| `GET` | `/:id/completitud` | `pacientes.ver` | Estado de completitud del embarazo actual. |
| `POST` | `/:id/embarazos` | `pacientes.editar` | Crea de forma explicita un embarazo activo solo si no existe otro activo o en puerperio. Requiere CSRF. |
| `POST` | `/:id/embarazo/puerperio` | `pacientes.editar` | Pasa embarazo activo a puerperio. Requiere `embarazo_id`. |
| `POST` | `/:id/embarazo/cerrar` | `pacientes.editar` | Cierra embarazo activo/puerperio. Requiere `embarazo_id`. |

Parametros importantes:

- `GET /pacientes?buscar=&pagina=1&limite=20`.
- `GET /pacientes/:id/expediente?embarazo_id=12`.
- En rutas clinicas anidadas de escritura, `embarazo_id` es obligatorio y evita escribir en el embarazo equivocado.

`GET /pacientes/:id/expediente` es idempotente. Si la paciente existe pero no
tiene embarazos, responde `200` con el siguiente estado estable, sin ejecutar
`INSERT`, `UPDATE` ni `DELETE`:

```json
{
  "paciente": { "id": 42 },
  "embarazos": [],
  "embarazo_seleccionado": null,
  "embarazo_actual": null,
  "embarazo_activo": null,
  "controles_prenatales": [],
  "controles_puerperio": [],
  "morbilidad": [],
  "ficha_riesgo": null,
  "plan_parto": null,
  "vacunas": [],
  "is_read_only": false,
  "is_embarazo_actual": false
}
```

La creacion requiere una accion del usuario mediante
`POST /pacientes/:id/embarazos`. El backend bloquea la fila de la paciente y
ejecuta comprobacion, insercion, sincronizacion y auditoria en una transaccion.
No cierra automaticamente embarazos activos ni en puerperio. Si existe uno
activo responde `409` con `ACTIVE_PREGNANCY_EXISTS`; si esta en puerperio,
responde `409` con `PUERPERIUM_PREGNANCY_EXISTS` y solicita completar y cerrar
el puerperio. Solo una paciente sin embarazos o con todos sus embarazos cerrados
puede iniciar otro.

El POST serializa la comprobacion con `SELECT ... FOR UPDATE` sobre la paciente.
El indice parcial existente `ux_embarazo_activo_paciente` solo cubre
`estado = 'activo'`; por ello la proteccion de `puerperio` depende de que todos
los escritores usen este flujo transaccional.

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

## Referencias clinicas

No existe un modulo ni endpoint independiente de referencias. El destino de una
referencia por riesgo se registra en
`fichas_riesgo_obstetrico.referida_a`; el tratamiento o referencia por
morbilidad se documenta en
`morbilidad_embarazo.tratamiento_referencia`.
`pacientes.viene_referida` y `pacientes.referida_de` conservan exclusivamente la
procedencia de la paciente.

Cualquier metodo enviado a
`/pacientes/:pacienteId/referencias` llega al manejador global y responde
`404` con `code: "ROUTE_NOT_FOUND"`, sin redireccion, sugerencias ni SQL. El
expediente completo no contiene una propiedad `referencias`.

## PDF institucional

Base: `/pacientes/:pacienteId`

| Metodo | Ruta | Permiso | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/mspas/pdf` | `pacientes.ver` | Ficha MSPAS prenatal completa. |
| `GET` | `/riesgo/pdf` | `pacientes.ver` | Ficha de riesgo obstetrico. |
| `GET` | `/plan-parto/pdf` | `pacientes.ver` | Plan de parto. |
| `GET` | `/:controlId/pdf` | `pacientes.ver` | Control prenatal individual. |

Todos aceptan `embarazo_id`. Antes de iniciar `pdf-lib`, Chromium, Excel o
LibreOffice se valida la sesion, el permiso, la existencia de la paciente y la
pertenencia de cada identificador. El PDF oficial no exige
`controles.ver_vih`: por politica confirmada del CAP conserva el resultado de
VIH y el resto del contenido clinico oficial completo.

Las respuestas exitosas usan `application/pdf`, un nombre de archivo
sanitizado y las cabeceras `Cache-Control: private, no-store, max-age=0`,
`Pragma: no-cache`, `Expires: 0` y `X-Content-Type-Options: nosniff`.
Se permiten 20 inicios de generacion PDF por usuario autenticado cada 5 minutos
mediante memoria de la instancia. El contador se incrementa inmediatamente
antes de invocar el generador, despues de autenticacion, permiso, existencia y
pertenencia: los rechazos previos no consumen, pero cualquier intento que ya
inicio el generador conserva el consumo aunque termine con error. El intento 21
responde `429` sin invocar el generador. Los archivos auxiliares de los
formatos Excel se crean con nombres aleatorios fuera del repositorio y se
eliminan tanto en exito como en error.

## Reportes

Base: `/reportes`

| Metodo | Ruta | Permiso | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/censo/primer-control?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` | `reportes.ver` | Censo mensual principal: un registro por embarazo cuyo primer control cae en el periodo inclusivo. |
| `GET` | `/censo/primer-control/excel?desde=...&hasta=...` | `reportes.exportar` | Excel oficio horizontal del censo principal. |
| `GET` | `/censo/primer-control/pdf?desde=...&hasta=...` | `reportes.exportar` | PDF oficio horizontal del censo principal. |
| `GET` | `/censo` | `reportes.ver` | Fotografia actual de embarazos con `estado = activo`; no reconstruye cortes historicos. |
| `GET` | `/censo/excel` | `reportes.exportar` | Excel del censo actual de embarazos activos. |
| `GET` | `/proximas-a-parir` | `reportes.ver` | Embarazos activos con FPP en los proximos 30 dias. |
| `GET` | `/sin-control-reciente` | `reportes.ver` | Embarazos activos sin controles o con mas de 28 dias desde el ultimo. |
| `GET` | `/pacientes-riesgo` | `reportes.ver` | Embarazos activos cuya ficha obstetrica tiene `tiene_riesgo = true`. |
| `GET` | `/resumen-comunidades` | `reportes.ver` | Totales de embarazos activos, riesgo, FPP proxima y falta de control por comunidad. |
| `GET` | `/estadisticas` | `reportes.ver` | Dashboard: embarazos activos, pacientes historicas, riesgo, controles del mes y citas. |

`desde` y `hasta` son obligatorios solo en el censo por primer control y sus
exportaciones. Deben ser fechas reales con formato estricto `YYYY-MM-DD`, no se
aceptan valores repetidos, `desde` no puede superar `hasta` y el periodo
inclusivo maximo es de 366 dias. La zona horaria operativa es
`America/Guatemala`.

La captacion se determina exclusivamente con la fecha del control numero 1. Si
existieran duplicados historicos se elige primero por fecha y luego por ID, sin
fusionar embarazos diferentes de una misma paciente. Edad y semanas se calculan
en la fecha del primer control. El censo activo, los plazos de 30/28 dias y el
dashboard usan la fecha actual de Guatemala.

Excel y PDF usan papel oficio/folio de 8.5 x 13 pulgadas, orientacion horizontal,
una pagina de ancho y tantas paginas verticales como sean necesarias. El PDF
responde con `private, no-store`, `nosniff` y nombre de descarga sanitizado.

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

La integracion esta deshabilitada por defecto y el endpoint v1 solo se monta
funcionalmente en produccion habilitada. No usa JWT, cookies ni sesiones
humanas. Usa:

```text
X-CAP-Automation-Key: <API_KEY_ALEATORIA>
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/proximas-citas?offset_days=1&window_days=1` | Conteo agregado de citas por fecha. |
| `GET` | `/proximas-citas` | Endpoint legacy retirado; siempre `404`. |

La key original vive solo en n8n. El backend compara su SHA-256 contra
`N8N_API_KEY_HASH_CURRENT` o el hash NEXT de rotacion. La ruta exige allowlist
CIDR y tiene rate limit propio. La respuesta solo contiene version, fecha de
generacion, zona horaria, rango, total, resumen por fecha y `/dashboard`.

El proxy publico Nginx no reenvia este prefijo: responde `404` antes del bloque
general `/api/`. Solo n8n puede usar la ruta directa
`http://backend:3001/api/automatizaciones/v1/proximas-citas` dentro de
`automation_internal`.
