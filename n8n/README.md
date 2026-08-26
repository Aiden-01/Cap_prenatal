# Artefactos n8n de CAP Prenatal

Este directorio contiene configuración de ejemplo, workflows importables y
plantillas. No contiene SQLite, credenciales, ejecuciones, API keys,
destinatarios reales ni datos clínicos. La operación completa está en
[`../docs/N8N_OPERACION.md`](../docs/N8N_OPERACION.md).

## Inventario

| Archivo | Propósito | Agenda | Correo sin datos |
| --- | --- | --- | --- |
| `workflows/recordatorio-citas-resend-v1.json` | Citas de mañana con nombre operativo, teléfono y comunidad | Diario 08:00 | No envía |
| `workflows/censo-primer-control-26-25-resend-v1.json` | Censo del mes logístico 26 a 25 | Día 26, 06:00 | Aviso sin archivo |
| `workflows/censo-primer-control-mes-cerrado-resend-v1.json` | Censo del mes calendario anterior | Día 3, 06:00 | Aviso sin archivo |
| `workflows/seguimiento-inasistencias-resend-v1.json` | Citas vencidas de la semana lunes-domingo anterior | Lunes 08:00 | No envía |
| `workflows/seguimiento-tdap-el-chal-resend-v1.json` | Nuevas oportunidades y pendientes Tdap de El Chal, en un XLSX de dos hojas | Lunes 08:00 | No envía |
| `workflows/proximas-citas-v1.json` | Diseño SMTP heredado y endurecido | Diario 06:00 | No envía |

Los cinco primeros son el camino Resend actual. El último no está cargado en la
instancia local y no debe importarse para la operación nueva; se conserva como
referencia heredada cubierta por pruebas hasta autorizar su retiro.

`N8N-OPS-01A · Seguimiento de inasistencias` usa el modelo explícito de
`citas_prenatales` y la idempotencia transaccional de CAP Prenatal. n8n no
calcula inasistencias, no consulta `cita_siguiente` y no conserva una segunda
base de deduplicación. El detalle del contrato y la recuperación manual está en
[`../docs/N8N.md`](../docs/N8N.md#seguimiento-de-inasistencias-n8n-ops-01a).

`N8N-VAX-01 · Seguimiento oportuno Tdap` es un solo workflow con dos conjuntos
lógicos. CAP Prenatal filtra municipio, embarazo activo, umbral de 20 semanas y
Tdap del embarazo actual; n8n solo valida conteos, descarga el XLSX, lo adjunta,
envía y confirma. La regla de 20 semanas es institucional/operativa para este
proyecto y requiere validación clínica autorizada antes de producción.

En el diseño heredado, la concurrencia operativa del workflow debe permanecer en 1:
su deduplicación con static data es de mejor esfuerzo y no constituye
una garantía transaccional.

Todos los JSON:

- se exportan con `active=false`;
- usan `America/Guatemala`;
- deshabilitan guardado de ejecuciones y exposición MCP;
- omiten credenciales y resultados;
- usan direcciones `.invalid` como bloqueo previo a producción;
- presentan fechas de correo y nombres de adjuntos como `DD-MM-YYYY`, mientras
  los contratos y parámetros HTTP permanecen en ISO `YYYY-MM-DD`.

## Correspondencia local observada

| ID | Nombre |
| --- | --- |
| `NI4eHXsKQmcCB2Xg` | `CAP Prenatal | Recordatorio de citas | Resend | v1` |
| `capCenso2625V1A1` | `CAP Prenatal | Censo 26 a 25 | Resend | v1` |
| `capCensoMesV1A1` | `CAP Prenatal | Censo mes cerrado | Resend | v1` |
| `JJylxJ7YxtprYjDZ` | `CAP Prenatal | Seguimiento semanal de inasistencias | Resend | v1` |

Los cuatro estaban inactivos/sin publicar al auditarse. Los nodos HTTP y Resend tenían
credenciales locales asignadas; sus identificadores, secretos y destinatarios
se omiten deliberadamente y no aparecen en estos archivos.

## Preparar el entorno

Desde `C:\cap_prenatal`:

```powershell
npm install
Copy-Item n8n\.env.example n8n\.env
npm run n8n:local
```

Completar una `N8N_ENCRYPTION_KEY` propia antes de iniciar. La configuración
fija n8n `2.34.4` y reconcilia `n8n-nodes-resend@2.8.0` con su checksum oficial,
sin descargar el catálogo paginado en cada arranque; mantiene deshabilitados
los paquetes no verificados.

Detalles de backup, recuperación de acceso y actualización:
[`../docs/N8N_OPERACION.md`](../docs/N8N_OPERACION.md).

## Importación

1. instalar/reconciliar Resend y reiniciar n8n;
2. importar un JSON desde **Workflows > Import from file**;
3. confirmar nombre, agenda, zona y `active=false`;
4. no publicar todavía;
5. asignar credenciales según la sección siguiente;
6. reemplazar únicamente dentro del entorno los valores `.invalid`;
7. probar nodos con información sintética;
8. revisar diferencias entre el workflow configurado y el JSON versionado;
9. publicar solo con autorización institucional.

Importar no equivale a publicar ni activar.

## Credencial Header Auth

Crear una credencial genérica:

```text
Name:  X-CAP-Automation-Key
Value: <API key aleatoria>
```

Asignarla a:

- `Consultar citas de mañana`;
- `Consultar resumen agregado`;
- `Descargar Excel del censo`;
- `Preparar semana anterior`;
- `Preparar seguimiento Tdap`;
- `Descargar XLSX Tdap`;
- `Confirmar despacho en CAP`.

La key no debe pegarse como header fijo del nodo. El backend conserva solo su
hash. Las URLs reales son:

```text
/api/automatizaciones/v1/proximas-citas
/api/automatizaciones/v1/censo-primer-control
/api/automatizaciones/v1/censo-primer-control/excel
/api/automatizaciones/v1/inasistencias
/api/automatizaciones/v1/inasistencias/preparar
/api/automatizaciones/v1/inasistencias/confirmar
/api/automatizaciones/v1/inasistencias/resolver
/api/automatizaciones/v1/tdap/preparar
/api/automatizaciones/v1/tdap/xlsx
/api/automatizaciones/v1/tdap/confirmar
/api/automatizaciones/v1/tdap/resolver
```

En ejecución programada se usa `http://backend:3001` dentro de Docker; una
ejecución manual local usa `http://127.0.0.1:3001`. La ruta sin `/v1/` está
retirada.

## Credencial y nodos Resend

Crear una credencial **Resend API** y asignarla a:

- `Enviar recordatorio por Resend`;
- ambos `Enviar aviso sin datos`;
- ambos `Enviar correo con Excel`;
- `Enviar seguimiento por Resend`.
- `Enviar seguimiento por Resend` del workflow Tdap.

Configurar un remitente de `notificaciones.hercor-nexus.com` y un destinatario
institucional aprobado. No guardar el destinatario real en el JSON.

Guía completa: [`../docs/RESEND.md`](../docs/RESEND.md).

## Lógica de los workflows

### Recordatorio

```text
Schedule -> HTTP citas -> ¿total > 0?
                         ├─ no: fin
                         └─ sí: HTML seguro -> Resend
```

El correo es único e incluye por cita solo primer nombre, primer apellido,
teléfono y comunidad. El nodo Code valida contrato y escapa HTML.

### Censos

```text
Schedule -> período -> resumen -> ¿total > 0?
                                  ├─ no: Resend sin adjunto
                                  └─ sí: descargar binary.data
                                         -> Resend con XLSX
```

El resumen no contiene filas nominales. El XLSX solo se solicita en la rama
con datos y nunca se almacena en el repositorio.

### Seguimiento semanal de inasistencias

```text
Schedule lunes 08:00 -> POST preparar -> validar contrato
                                      -> ¿ready y total > 0?
                                         ├─ no: fin
                                         └─ sí: HTML mínimo -> Resend
                                                               -> POST confirmar
```

CAP Prenatal calcula la semana anterior, filtra la agenda estructurada y
reserva el período. El correo contiene solo fecha de cita, primer nombre,
primer apellido, teléfono y comunidad. `total=0`, `no_results` y
`already_processed` terminan sin correo. Una reserva ambigua bloquea el replay
automático hasta que personal autorizado revise Resend.

### Seguimiento oportuno Tdap de El Chal

```text
Schedule lunes 08:00 -> POST preparar -> validar contrato
                                      -> ¿ready y algún conteo > 0?
                                         ├─ no: fin
                                         └─ sí: descargar binary.data
                                                -> base64 real + leer dos hojas
                                                -> tablas HTML + POST Resend
                                                -> POST confirmar
```

El backend calcula la semana calendario anterior y el estado al lunes siguiente
en `America/Guatemala`. `new_opportunities` cuenta embarazos activos de El Chal
que cruzaron exactamente el umbral durante esa semana; `pending` cuenta el
stock al lunes excluyendo las nuevas oportunidades del mismo reporte. Las dos
hojas son mutuamente excluyentes: una embarazada nueva no se repite en
pendientes.

El archivo `Seguimiento_Tdap_El_Chal_DD-MM-YYYY.xlsx` tiene siempre las hojas
`Nuevas oportunidades Tdap` y `Pendientes de Tdap`; cada una contiene
exclusivamente `Primer nombre`, `Primer apellido` y `Comunidad`. Si ambos
conteos son cero, `no_results` termina sin correo. Una huella incluida en el
token de reserva impide descargar un archivo cuyo contenido haya cambiado
entre la preparación y la descarga, sin guardar filas nominales en
`automatizacion_despachos`.

El workflow no pasa `binary.data.data` directamente al nodo comunitario
Resend. n8n 2.34.4 guarda el archivo como `filesystem-v2`, por lo que primero
usa **Move File to Base64 String** y luego el HTTP Request autenticado con la
credencial predefinida `Resend API`. Las dos hojas también se leen con nodos
nativos para mostrar en el cuerpo exactamente las mismas tres columnas, sin
duplicar reglas de elegibilidad.

## Plantillas

- [`templates/recordatorio-citas.md`](templates/recordatorio-citas.md): campos,
  asunto y HTML genérico del recordatorio.
- [`templates/censo-mensual.md`](templates/censo-mensual.md): mensajes con y
  sin adjunto para mes logístico y calendario.

Las plantillas son documentación. El comportamiento ejecutable sigue estando
en los JSON y sus pruebas.

## Pruebas

Desde la raíz:

```powershell
node --test backend/test/n8nInfrastructure.test.js
node --test backend/test/n8nResendDailyWorkflow.test.js
node --test backend/test/n8nCensusWorkflow.test.js
node --test backend/test/n8nMissedAppointmentsWorkflow.test.js
node --test backend/test/inasistenciasSemanales.test.js
node --test backend/test/seguimientoTdap.test.js
node --test backend/test/n8nTdapWorkflow.test.js
node --test backend/test/automatizaciones.test.js
```

Las pruebas no envían correo. La verificación manual debe detenerse antes del
nodo Resend hasta que exista un destinatario de prueba autorizado.

## Seguridad antes de exportar

- eliminar referencias a IDs/nombres de credenciales;
- restaurar remitente y destinatario `.invalid`;
- eliminar `pinData` y resultados de ejecución;
- no incluir exports de `.n8n-local/`;
- buscar direcciones reales, API keys, dominios internos no públicos y datos de
  pacientes;
- confirmar `active=false`.

Los errores y soluciones conocidas están en la sección **Diagnóstico rápido**
de [`../docs/N8N_OPERACION.md`](../docs/N8N_OPERACION.md).
