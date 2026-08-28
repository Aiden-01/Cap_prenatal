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

Al crear un control nuevo, el backend cumple la unica cita `programada` vigente
del mismo embarazo y, si existe `cita_siguiente`, crea despues la proxima cita.
El control, ambas operaciones y sus auditorias comparten transaccion.

`PUT /:id` admite excepcionalmente `cita_siguiente: null -> YYYY-MM-DD` para
corregir una cita omitida. El control debe ser el ultimo del embarazo, no puede
tener una cita estructurada de origen y el embarazo no puede tener otra cita
`programada` vigente. Actualizacion, insercion en `citas_prenatales` y ambas
auditorias se confirman o revierten juntas. Un control con controles posteriores
responde `409 CITA_CONTROL_NO_ES_ULTIMO`; una cita vigente,
`409 CITA_PROGRAMADA_VIGENTE`; y un origen ya utilizado,
`409 CITA_CONTROL_ORIGEN_EXISTENTE`. `fecha -> otra fecha` conserva
`409 CITA_REPROGRAMACION_REQUERIDA`; `fecha -> null` responde
`409 CITA_CANCELACION_REQUERIDA`.

## Citas prenatales

### Calendario mensual de UI

Base: `/citas`

| Metodo | Ruta | Permiso | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/calendario?from=YYYY-MM-DD&to=YYYY-MM-DD` | `pacientes.ver` | Lista las citas estructuradas incluidas en el rango visible del calendario. |

`from` y `to` son fechas ISO date-only obligatorias, inclusivas y con un maximo
de 62 dias. El rango puede incluir dias adyacentes al mes para completar las
seis filas de la cuadrícula y se resuelve con una sola consulta. Parametros
repetidos, fechas imposibles, orden invertido o un rango mayor responden `400`.

Respuesta:

```json
{
  "range": {
    "from": "2026-07-26",
    "to": "2026-09-05"
  },
  "items": [
    {
      "id": "701",
      "date": "2026-08-25",
      "status": "programada",
      "patient_id": 41,
      "pregnancy_id": 91,
      "patient_name": "Maria Lopez",
      "community": "Las Flores",
      "rescheduled_to": null,
      "editable": true
    }
  ]
}
```

Los IDs permiten reutilizar las operaciones anidadas, pero no se muestran en la
interfaz. `editable` describe si la cita y el embarazo admiten una mutacion; el
frontend exige ademas `controles.editar`. El contrato minimiza datos a nombre y
comunidad, devuelve los cuatro estados y consulta directamente
`citas_prenatales`, nunca `controles_prenatales.cita_siguiente`.

### Operaciones de una cita

Base: `/pacientes/:pacienteId/citas`

Todas las rutas exigen `embarazo_id` en query y verifican que paciente,
embarazo y cita correspondan entre si.

| Metodo | Ruta | Permiso | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/vigente?embarazo_id=:id` | `pacientes.ver` | Devuelve `{ cita }`, con cero o una programada vigente; inconsistencias multiples responden `409`. |
| `PATCH` | `/:id/reprogramar?embarazo_id=:id` | `controles.editar` | Recibe `{ "fecha_programada": "YYYY-MM-DD" }`, conserva la original como `reprogramada` y crea la hija. |
| `PATCH` | `/:id/cancelar?embarazo_id=:id` | `controles.editar` | Conserva la fila como `cancelada`; repetir sobre la misma cancelada es idempotente. |

La reprogramacion rechaza fecha pasada o sin cambio. Citas atendidas,
canceladas o ya reprogramadas son terminales. Las respuestas no permiten usar
un ID perteneciente a otro embarazo o paciente.

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

| Metodo | Ruta | Permiso | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/?embarazo_id=:id` | `pacientes.ver` | Lista vacunas del embarazo seleccionado. |
| `POST` | `/?embarazo_id=:id` | `controles.crear` | Crea una aplicacion nueva. Influenza nunca reemplaza otra fila. |
| `GET` | `/antecedentes?excluir_embarazo_id=:id` | `pacientes.ver` | Lista antecedentes de otros embarazos o filas sin embarazo. |
| `GET` | `/:id?embarazo_id=:id` | `pacientes.ver` | Obtiene una aplicacion del embarazo seleccionado. |
| `PUT` | `/:id?embarazo_id=:id` | `controles.editar` | Actualiza exclusivamente el ID solicitado y revalida la historia. |
| `DELETE` | `/:id?embarazo_id=:id` | `controles.editar` | Elimina exclusivamente el ID solicitado. |

Body de creacion:

```json
{
  "tipo_vacuna": "td | tdap | influenza | spr_sr",
  "momento": "previo_embarazo | durante_embarazo | postparto_aborto",
  "numero_dosis": 1,
  "fecha_dosis": "YYYY-MM-DD"
}
```

`embarazo_id`, momento y fecha son obligatorios para escribir. Influenza usa
internamente `numero_dosis = 1`, pero el frontend no muestra selector de dosis.
TD admite posiciones 1 a 5 y SR/SPR 1 a 2; sus primeras filas locales pueden
ser posiciones posteriores. Tdap usa posicion interna 1 y una Tdap previa no
consume la aplicacion durante/postparto del embarazo relacionado.

El backend aplica intervalos calendario, 20 semanas para Tdap durante embarazo,
prohibicion de SR/SPR durante embarazo, coherencia del momento y solo lectura
para embarazos cerrados. Conflictos clinicos responden `409` con `code` y
`details`; validaciones de body responden `400`. La ausencia de permiso responde
`403` aun si se manipula directamente la URL o el payload.

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

La automatizacion mensual no llama estas rutas humanas con un JWT fijo. Primero
usa `GET /automatizaciones/v1/censo-primer-control?desde=...&hasta=...`,
protegido por la frontera M2M de n8n, para decidir si hay registros. Cuando el
total es mayor que cero descarga el mismo Excel mediante
`GET /automatizaciones/v1/censo-primer-control/excel?desde=...&hasta=...` y lo
adjunta al correo institucional. Si el total es cero envia solo un aviso, sin
archivo. Ambas respuestas se sirven con `no-store`; el workflow no persiste
ejecuciones ni binarios.

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
| `GET` | `/v1/proximas-citas?offset_days=1&window_days=1` | Citas por fecha con un nombre, un apellido, telefono y comunidad. |
| `GET` | `/v1/censo-primer-control?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` | Conteo de primeros controles del periodo. |
| `GET` | `/v1/censo-primer-control/excel?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` | Excel nominal del mismo periodo para adjunto institucional. |
| `GET` | `/v1/inasistencias?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` | Vista previa de una semana calendario anterior completa. |
| `POST` | `/v1/inasistencias/preparar` | Calcula y reserva idempotentemente la semana lunes-domingo anterior. |
| `POST` | `/v1/inasistencias/confirmar` | Confirma mediante token efímero que Resend aceptó el despacho. |
| `POST` | `/v1/inasistencias/resolver` | Resolución técnica manual de una reserva ambigua. |
| `POST` | `/v1/tdap/preparar` | Deriva y reserva el seguimiento semanal Tdap de El Chal. |
| `GET` | `/v1/tdap/xlsx` | Descarga el XLSX de la reserva; exige además `X-CAP-Dispatch-Token`. |
| `POST` | `/v1/tdap/confirmar` | Confirma la aceptación del único correo Tdap. |
| `POST` | `/v1/tdap/resolver` | Resolución técnica manual de una reserva Tdap ambigua. |
| `POST` | `/v1/calidad-datos/preparar` | Resume y reserva el watchdog de la semana calendario anterior. |
| `POST` | `/v1/calidad-datos/confirmar` | Confirma la aceptación del correo agregado de calidad. |
| `POST` | `/v1/calidad-datos/resolver` | Resolución técnica manual de una reserva de calidad ambigua. |
| `GET` | `/proximas-citas` | Endpoint legacy retirado; siempre `404`. |

La key original vive solo en n8n. El backend compara su SHA-256 contra
`N8N_API_KEY_HASH_CURRENT` o el hash NEXT de rotacion. La ruta exige allowlist
CIDR y tiene rate limit propio. La respuesta de citas contiene version, fecha
de generacion, zona horaria, rango, total, resumen por fecha, `/dashboard` y el
detalle minimo solicitado: `first_name`, `last_name`, `phone` y `community`.
No incluye IDs, CUI, expediente, direccion ni informacion clinica.
La fuente interna es `citas_prenatales`: solo `programada`, sin cumplimiento y
en embarazo activo. El contrato y los parametros permanecen iguales para no
modificar el workflow n8n de recordatorio.

El proxy publico Nginx no reenvia este prefijo: responde `404` antes del bloque
general `/api/`. Solo n8n puede usar la ruta directa
`http://backend:3001/api/automatizaciones/v1/proximas-citas` dentro de
`automation_internal`.

### Contrato semanal de inasistencias

El período de `GET /v1/inasistencias` debe ser exactamente lunes-domingo,
completo y anterior al día actual en `America/Guatemala`. El backend incluye
solo `citas_prenatales` con:

```text
fecha_programada BETWEEN desde AND hasta
estado = programada
control_cumplimiento_id IS NULL
embarazo.estado = activo
created_at >= schema_migrations.applied_at de 014_citas_prenatales.sql
```

No consulta `cita_siguiente`. Atendidas, canceladas, reprogramadas, citas fuera
de ventana, previas al corte o de embarazos no activos quedan excluidas.

La respuesta de vista previa y preparación usa `schema_version=1`, zona, tipo,
rango, `cutoff_at`, estado de despacho, total y `appointments`. Cada elemento
contiene exactamente `date`, `first_name`, `last_name`, `phone` y `community`.
No devuelve IDs ni información clínica.

Estados de preparación:

- `ready`: `total > 0`, detalle exacto y token efímero para confirmación;
- `no_results`: `total=0`, lista vacía y período cerrado sin correo;
- `already_processed`: período ya enviado o cerrado sin resultados;
- una reserva pendiente responde HTTP `409` con
  `AUTOMATION_DISPATCH_UNCERTAIN`.

Confirmación:

```json
{ "dispatch_token": "<token efimero de preparar>" }
```

El token se devuelve una sola vez y en PostgreSQL solo se conserva su hash.
Confirmar otra vez el mismo token es idempotente. El resolver manual exige una
semana explícita, la confirmación literal
`REINTENTAR_INASISTENCIAS_SEMANALES`, una resolución `enviado` o `reintentar`
y el motivo coherente `entrega_confirmada_en_resend` o
`entrega_no_realizada_confirmada`. No permite reabrir `enviado` ni
`sin_resultados`.

### Contrato semanal de calidad de datos

`POST /v1/calidad-datos/preparar` calcula en `America/Guatemala` la semana
lunes-domingo anterior y el corte del lunes siguiente. No acepta fechas,
filtros ni SQL suministrados por n8n. El backend evalúa únicamente invariantes
objetivas: campos obligatorios vacíos, relaciones prenatales sin embarazo,
discordancias paciente-embarazo, embarazos abiertos concurrentes, controles
con fecha futura y citas programadas en embarazos cerrados. Una vacuna
`previo_embarazo` sin embarazo es válida. No aplica reglas clínicas ni
heurísticas de FUR, FPP, riesgo, vacuna, laboratorio o diagnóstico.

```json
{
  "schema_version": 1,
  "generated_at": "2026-08-31T15:00:00.000Z",
  "timezone": "America/Guatemala",
  "report_type": "weekly_data_quality_watchdog",
  "range": { "from": "2026-08-24", "to": "2026-08-30" },
  "as_of": "2026-08-31",
  "dispatch": { "status": "ready", "token": "<token efimero>" },
  "total": 3,
  "categories": [
    {
      "code": "future_prenatal_control",
      "label": "Controles prenatales con fecha futura",
      "description": "Hay controles con una fecha posterior al dia operativo actual.",
      "count": 3
    }
  ],
  "secure_path": "/dashboard"
}
```

`categories` contiene únicamente código controlado, etiqueta, descripción
operativa y cantidad; no existe `items` ni detalle nominal. `no_results` y
`already_processed` llevan total cero y arreglo vacío. `ready` es el único
estado con token y reutiliza `automatizacion_despachos` bajo el tipo
`weekly_data_quality_watchdog`. Una reserva pendiente responde `409
AUTOMATION_DISPATCH_UNCERTAIN`; no se reintenta correo automáticamente. El
resolver exige `REINTENTAR_WATCHDOG_CALIDAD_DATOS` y los mismos pares
resolución/motivo documentados para inasistencias.

### Contrato semanal de seguimiento Tdap

`POST /v1/tdap/preparar` calcula la semana calendario lunes-domingo anterior en
`America/Guatemala`; no acepta rango suministrado por n8n. El backend consulta
solo embarazos `activo`, exige que `pacientes.municipio` normalizado sea El Chal
y usa `NOT EXISTS` de Tdap por `vacunas_paciente.embarazo_id` actual. No infiere
municipio desde comunidad y una Tdap de otro embarazo no excluye el actual.

La clasificación reutiliza `gestationalAgeAtDate(fur, fecha)` y el umbral de
`VACCINE_RULES.tdap.minimumGestationalDays` (140 días). La regla de 20 semanas
es institucional/operativa del proyecto y requiere validación clínica final
antes de activación productiva. Si una candidata sin Tdap carece de FUR válida,
la ruta responde `409 AUTOMATION_TDAP_GESTATIONAL_SOURCE_INCOMPLETE` y no
produce un reporte parcial.

Contrato de preparación:

```json
{
  "schema_version": 1,
  "generated_at": "2026-08-31T14:00:00.000Z",
  "timezone": "America/Guatemala",
  "report_type": "seguimiento_tdap_el_chal",
  "range": { "from": "2026-08-24", "to": "2026-08-30" },
  "as_of": "2026-08-31",
  "new_opportunities": { "total": 2 },
  "pending": { "total": 4 },
  "has_information": true,
  "xlsx": {
    "available": true,
    "download_path": "/api/automatizaciones/v1/tdap/xlsx",
    "filename": "Seguimiento_Tdap_El_Chal_31-08-2026.xlsx"
  },
  "dispatch": { "status": "ready", "token": "<token efimero>" }
}
```

`new_opportunities` es el flujo que cruzó el umbral en el período;
`pending` es el stock al lunes `as_of` excluyendo a quienes ya aparecen en
`new_opportunities` para ese reporte. Las listas son mutuamente excluyentes y
la respuesta solo contiene conteos.

La descarga exige los dos headers:

```text
X-CAP-Automation-Key: <credencial M2M>
X-CAP-Dispatch-Token: <token de preparar>
```

El token contiene una huella no reversible del snapshot y PostgreSQL solo
guarda su SHA-256. Antes de generar el XLSX, el backend vuelve a derivar las
listas dentro de una transacción; una diferencia responde `409
AUTOMATION_DISPATCH_SNAPSHOT_CHANGED`. El archivo tiene exactamente dos hojas
y tres columnas (`Primer nombre`, `Primer apellido`, `Comunidad`).

Estados y errores de idempotencia siguen el patrón de inasistencias:

- `ready`: se permite una descarga y un envío;
- `no_results`: ambos conteos cero, período cerrado sin correo;
- `already_processed`: no se permite otro correo;
- reserva pendiente: `409 AUTOMATION_DISPATCH_UNCERTAIN`;
- confirmación repetida del mismo token: éxito idempotente.

El resolver Tdap exige la confirmación literal
`REINTENTAR_SEGUIMIENTO_TDAP_EL_CHAL` y los mismos pares coherentes de
resolución/motivo que inasistencias.
