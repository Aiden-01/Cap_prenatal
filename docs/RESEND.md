# Resend en CAP Prenatal

Guía para instalar el nodo, verificar el dominio, crear la credencial y probar
correo sin exponer secretos o datos clínicos. La operación general de n8n está
en [`N8N_OPERACION.md`](N8N_OPERACION.md).

## Estado conocido

Evidencia local observada el 24 de agosto de 2026:

- paquete `n8n-nodes-resend@2.8.0` instalado;
- los workflows Resend locales usan `n8n-nodes-resend.resend`;
- todos los nodos Resend tienen una credencial asignada;
- los remitentes locales pertenecen a `notificaciones.hercor-nexus.com`;
- existe un destinatario configurado, omitido aquí por privacidad;
- los workflows están inactivos/sin publicar;
- los JSON versionados no contienen credenciales y usan direcciones
  `.invalid`.

Durante N8N-OPS-01A, una ejecución con datos exclusivamente sintéticos fue
aceptada por Resend y devolvió un ID de envío; no se comprobó de forma
independiente la recepción final en el buzón. Una segunda ejecución del mismo
período no volvió a ejecutar Resend.

Según la configuración previamente completada por el responsable, el dominio
de envío tiene Sending habilitado, Receiving deshabilitado y registros
DKIM/SPF/DMARC configurados en Namecheap; también se reportó una entrega de
prueba exitosa. Este estado externo no se revalidó en el panel de Resend durante
la presente auditoría y debe confirmarse antes de producción.

## Instalación reproducible

CAP fija el paquete mediante:

```env
N8N_COMMUNITY_PACKAGES_ENABLED=true
N8N_UNVERIFIED_PACKAGES_ENABLED=false
N8N_COMMUNITY_PACKAGES_MANAGED_BY_ENV=true
N8N_COMMUNITY_PACKAGES=[{"name":"n8n-nodes-resend","version":"2.8.0","checksum":"sha512-t5d9NJTd0dA+Zo0+Hs9lQ0UN2Mx5LQxccm52+j1yvOlHnx/xxvkV8tRS8bJFN+rbxBliFWPUJ9QI+pmAY7hKuA=="}]
```

Nombre, versión y checksum quedan fijados. Con el checksum presente, n8n puede
validar directamente la declaración y no necesita descargar el catálogo
paginado de nodos verificados durante cada inicio.

El lanzador local acepta estas variables y los Compose local/productivo
declaran la misma versión. n8n reconcilia el paquete al iniciar. La primera
instalación requiere salida al registro npm desde el entorno de n8n.

Para una instancia autogestionada donde no se use reconciliación:

1. entrar como propietario/administrador;
2. abrir el panel de nodos o **Settings > Community nodes**;
3. buscar `Resend` y comprobar que el paquete sea `n8n-nodes-resend`;
4. instalar la versión aprobada;
5. reiniciar n8n;
6. buscar el nodo **Resend** en un workflow vacío.

No instalar paquetes con nombres parecidos. No habilitar paquetes no
verificados como atajo. La guía oficial de la integración está en
[Resend: n8n integration](https://resend.com/docs/knowledge-base/n8n-integration).

## Dominio de envío

Resend recomienda un subdominio dedicado para aislar la reputación de envío.
CAP usa `notificaciones.hercor-nexus.com`.

Conceptualmente:

- **SPF:** autoriza la infraestructura que puede enviar por el dominio;
- **DKIM:** publica claves para comprobar autenticidad e integridad;
- **DMARC:** define política y reportes cuando SPF/DKIM no alinean;
- **MX de receiving:** solo es necesario si se habilita recepción; CAP no lo
  necesita para estos workflows salientes.

Los nombres, valores y tokens DNS deben copiarse directamente del panel de
Resend al proveedor DNS. No guardar esos valores en Git, Notion, capturas o
logs. La documentación oficial de dominio está en
[Managing Domains](https://resend.com/docs/dashboard/domains/introduction) y
[DMARC](https://resend.com/docs/dashboard/domains/dmarc).

Antes de enviar:

1. confirmar estado **Verified** para envío;
2. comprobar SPF y DKIM;
3. revisar DMARC y sus reportes antes de endurecer la política;
4. verificar que el `From` use exactamente el dominio aprobado;
5. confirmar que el destinatario sea institucional y esté autorizado.

## Credencial Resend API

1. crear en Resend una API key con el alcance mínimo de envío necesario;
2. copiarla una sola vez;
3. en n8n abrir **Credentials > Add credential > Resend API**;
4. pegar la key en la credencial, no en el nodo;
5. usar un nombre operativo sin incluir el token;
6. asignar la credencial a los siete nodos Resend actuales;
7. guardar y eliminar cualquier copia temporal del portapapeles/notas.

La credencial queda cifrada por n8n con `N8N_ENCRYPTION_KEY`. No exportar la
credencial descifrada ni compartir SQLite/backups sin cifrado.

Para rotar:

1. crear una key nueva;
2. actualizar la credencial n8n;
3. ejecutar una prueba sintética controlada;
4. revocar la key anterior;
5. registrar fecha/resultado, nunca el valor.

## Configuración de los nodos

Todas las fechas visibles enviadas por Resend —asunto, cuerpo y nombre de un
adjunto— se presentan como `DD-MM-YYYY`. n8n conserva `YYYY-MM-DD` para consultar
la API y validar contratos, y solo transforma la etiqueta destinada al correo.

### Recordatorio diario

- **Transporte:** `POST https://api.resend.com/emails` desde el nodo HTTP
  Request con la credencial predefinida `Resend API`; la API key no aparece en
  el workflow.
- **From:** nombre CAP y buzón del subdominio verificado.
- **To:** destinatario autorizado; su valor real no se documenta.
- **Subject/HTML:** expresiones producidas por `Construir detalle operativo`.
- **Adjuntos:** ninguno.

### Censos

Cada workflow tiene dos nodos:

- `Enviar aviso sin datos`: sin adjuntos;
- `Enviar correo con Excel`: adjunta la propiedad binaria `data`, MIME
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y nombre
  `.xlsx` calculado por el workflow.

### Seguimiento semanal de inasistencias

- **Resource:** Email.
- **Operation:** Send.
- **From:** `CAP Prenatal` y el buzón de citas del subdominio verificado.
- **To:** un destinatario institucional autorizado, omitido de Git y esta guía.
- **Subject/HTML:** expresiones de `Construir mensaje operativo`.
- **Adjuntos:** ninguno; usa una tabla HTML compacta.
- **Después de Resend:** `Confirmar despacho en CAP` registra la aceptación
  para impedir reenvíos del mismo lunes-domingo.

Si Resend devuelve éxito pero la confirmación falla o expira, no ejecutar de
nuevo Resend. Revisar el ID/evento del proveedor y resolver el despacho como
`enviado` o autorizar `reintentar` únicamente con evidencia explícita de que
no hubo entrega.

### Seguimiento oportuno Tdap de El Chal

- **Resource:** Email.
- **Operation:** Send.
- **From:** `CAP Prenatal <citas@notificaciones.hercor-nexus.com>` en la
  instancia autorizada; el JSON versionado usa `.invalid`.
- **To:** un destinatario institucional autorizado, omitido de Git.
- **Subject:** `CAP Prenatal | Seguimiento oportuno Tdap - El Chal`.
- **HTML:** semana visible en `DD-MM-YYYY`, conteo de nuevas oportunidades,
  conteo de pendientes y dos tablas con primer nombre, primer apellido y
  comunidad; las listas son mutuamente excluyentes y no contienen otro detalle
  nominal ni clínico.
- **Adjunto:** `binary.data` se materializa con el nodo nativo **Move File to
  Base64 String** y se envía como `attachments[].content`, con nombre
  `Seguimiento_Tdap_El_Chal_DD-MM-YYYY.xlsx`.
- **Después de Resend:** `Confirmar despacho en CAP` registra la aceptación.

CAP Prenatal genera el archivo de dos hojas. n8n no calcula edad gestacional,
no consulta vacunas y no construye filas del XLSX. Si ambos conteos son cero o
la preparación devuelve `already_processed`, el nodo Resend no se ejecuta.
Ante `AUTOMATION_DISPATCH_UNCERTAIN` o timeout después del envío, revisar el ID
en Resend antes de resolver manualmente; no repetir el workflow.

`n8n-nodes-resend 2.8.0` no debe usarse para este adjunto mientras la instancia
almacene binarios como `filesystem-v2`: la versión observada copia el
localizador interno en `attachments[].content`. El síntoma es un adjunto de
pocos bytes que Excel reporta como corrupto. El transporte HTTP predefinido
evita ese defecto sin copiar ni exponer la credencial.

No activar **Use Template** mientras el contenido se construya en n8n. No
pegar HTML con información clínica fija. Las plantillas de referencia son:

- [`../n8n/templates/recordatorio-citas.md`](../n8n/templates/recordatorio-citas.md);
- [`../n8n/templates/censo-mensual.md`](../n8n/templates/censo-mensual.md).

## Prueba controlada

1. mantener el workflow inactivo;
2. usar un destinatario de prueba expresamente autorizado;
3. usar payload sintético, sin pacientes reales;
4. ejecutar primero el constructor y revisar asunto/HTML;
5. ejecutar un único nodo Resend;
6. comprobar entrega, remitente, asunto y formato;
7. para censo, adjuntar un XLSX sintético sin datos clínicos;
8. revisar Resend Events sin copiar direcciones o contenido a tickets;
9. borrar ejecución local si contiene evidencia innecesaria.

La prueba de la rama `total=0` del recordatorio y de inasistencias no debe
enviar correo. En Tdap, `new_opportunities.total=0` y `pending.total=0` tampoco
envía. En los censos sí debe enviar un aviso, pero sin adjunto.

## Errores frecuentes

### `Forbidden by access permissions`

Si el detalle contiene `connect EACCES <IP>:443`, el proceso no tiene salida
HTTPS. Revisar firewall, sandbox, proxy/DNS y egress desde el mismo host o
contenedor de n8n. Cambiar permisos de la API key no corrige un `EACCES` de red.

Si la conexión llega a Resend pero devuelve `403`, comprobar el alcance de la
key, el dominio del `From` y el estado de verificación.

### Dominio o remitente no permitido

El `From` debe pertenecer al dominio verificado. No usar un Gmail personal como
remitente ni el dominio de prueba de Resend para destinatarios externos.

### Nodo no encontrado

Confirmar nombre y versión del paquete, variables declarativas, volumen
persistente y reinicio. Revisar logs de arranque por fallos de checksum, npm o
compatibilidad.

### Límite, rebote o destinatario inválido

Revisar el evento en Resend, cuota y dirección autorizada. No reintentar en
bucle un rebote permanente. Mantener una política institucional para bajas,
rebotes y quejas antes de activar envíos recurrentes.

### XLSX no adjunto

Confirmar que el resumen sea mayor que cero, que la descarga responda binario
en `data`, que el nodo correcto sea el de envío con archivo y que el nombre
termine en `.xlsx`.

## Controles de producción

- Restringir el acceso al editor de n8n y usar HTTPS.
- Limitar egress a los destinos necesarios de Resend/registro npm.
- Usar una API key propia del entorno productivo.
- Definir destinatario institucional, suplencia y revisión periódica.
- Minimizar retención de ejecuciones y logs.
- Respaldar volumen y clave de cifrado por separado.
- Monitorear fallos, rebotes y cuotas sin registrar contenido clínico.
- Probar restauración y rollback del paquete.
- Publicar workflows solo con autorización documentada.
