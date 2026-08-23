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
| `workflows/proximas-citas-v1.json` | Diseño SMTP heredado y endurecido | Diario 06:00 | No envía |

Los tres primeros son el camino Resend actual. El último no está cargado en la
instancia local y no debe importarse para la operación nueva; se conserva como
referencia heredada cubierta por pruebas hasta autorizar su retiro.

En el diseño heredado, la concurrencia operativa del workflow debe permanecer en 1:
su deduplicación con static data es de mejor esfuerzo y no constituye
una garantía transaccional.

Todos los JSON:

- se exportan con `active=false`;
- usan `America/Guatemala`;
- deshabilitan guardado de ejecuciones y exposición MCP;
- omiten credenciales y resultados;
- usan direcciones `.invalid` como bloqueo previo a producción.

## Correspondencia local observada

| ID | Nombre |
| --- | --- |
| `NI4eHXsKQmcCB2Xg` | `CAP Prenatal | Recordatorio de citas | Resend | v1` |
| `capCenso2625V1A1` | `CAP Prenatal | Censo 26 a 25 | Resend | v1` |
| `capCensoMesV1A1` | `CAP Prenatal | Censo mes cerrado | Resend | v1` |

Los tres estaban inactivos al auditarse. Los nodos HTTP y Resend tenían
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
fija n8n `2.34.4` y reconcilia `n8n-nodes-resend@2.8.0`; mantiene deshabilitados
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
- `Descargar Excel del censo`.

La key no debe pegarse como header fijo del nodo. El backend conserva solo su
hash. Las URLs reales son:

```text
/api/automatizaciones/v1/proximas-citas
/api/automatizaciones/v1/censo-primer-control
/api/automatizaciones/v1/censo-primer-control/excel
```

En ejecución programada se usa `http://backend:3001` dentro de Docker; una
ejecución manual local usa `http://127.0.0.1:3001`. La ruta sin `/v1/` está
retirada.

## Credencial y nodos Resend

Crear una credencial **Resend API** y asignarla a:

- `Enviar recordatorio por Resend`;
- ambos `Enviar aviso sin datos`;
- ambos `Enviar correo con Excel`.

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
