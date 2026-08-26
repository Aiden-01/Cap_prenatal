# Operación de n8n para CAP Prenatal

Runbook para instalar, iniciar, respaldar, recuperar y actualizar la instancia
de n8n. Los contratos funcionales están en [`N8N.md`](N8N.md) y el correo en
[`RESEND.md`](RESEND.md).

## Inventario reproducible

| Componente | Valor fijado |
| --- | --- |
| n8n | `2.34.4` |
| Nodo Resend | `n8n-nodes-resend@2.8.0` |
| Script local | `scripts/start-n8n-local.ps1` |
| Configuración local | `n8n/.env` |
| Plantilla segura | `n8n/.env.example` |
| Datos persistentes locales | `.n8n-local/` |
| Zona horaria | `America/Guatemala` |
| Editor local | `http://127.0.0.1:5678` |

`n8n/.env` y `.n8n-local/` están ignorados por Git. El lanzador acepta una
lista cerrada de variables, elimina variables heredadas que no necesita y
rechaza una versión distinta de n8n.

## Preparación inicial en Windows

Desde la raíz:

```powershell
cd C:\cap_prenatal
npm install
Copy-Item n8n\.env.example n8n\.env
```

Generar una sola `N8N_ENCRYPTION_KEY` aleatoria de al menos 32 caracteres,
guardarla en `n8n/.env` y custodiar una copia en un gestor seguro separado. No
usar la key de ejemplo, una contraseña humana ni un secreto del backend.

No regenerar esta clave después de crear credenciales. Una nueva key no puede
descifrar credenciales protegidas con la anterior.

## Inicio y parada local

Iniciar siempre desde la raíz:

```powershell
cd C:\cap_prenatal
npm run n8n:local
```

No ejecutar `npm run n8n:local` desde `backend`; ese paquete no contiene el
script. El proceso ocupa la terminal. Para una parada normal usar `Ctrl+C` y
esperar a que vuelva el prompt.

Comprobar salud sin autenticarse:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5678/healthz
```

El resultado esperado es HTTP `200`. Para CAP Express:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/api/health
```

## Configuración declarativa del nodo Resend

La plantilla y ambos Compose fijan:

```env
N8N_COMMUNITY_PACKAGES_ENABLED=true
N8N_UNVERIFIED_PACKAGES_ENABLED=false
N8N_COMMUNITY_PACKAGES_MANAGED_BY_ENV=true
N8N_COMMUNITY_PACKAGES=[{"name":"n8n-nodes-resend","version":"2.8.0","checksum":"sha512-t5d9NJTd0dA+Zo0+Hs9lQ0UN2Mx5LQxccm52+j1yvOlHnx/xxvkV8tRS8bJFN+rbxBliFWPUJ9QI+pmAY7hKuA=="}]
```

El checksum coincide con el registro oficial de nodos verificados de n8n y con
la integridad del paquete instalado. Declararlo evita que cada arranque recorra
el catálogo remoto completo antes de reconciliar Resend.

Al arrancar, n8n reconcilia el paquete aprobado en su perfil persistente. La
lista declarativa evita depender de recordar una instalación manual y mantiene
deshabilitados los paquetes no verificados. El host/contenedor necesita salida
al registro npm la primera vez o al cambiar la versión.

Una alternativa local es instalar el nodo verificado desde el panel de nodos,
pero el entorno productivo debe conservar la versión declarada. No instalar un
paquete de nombre similar ni actualizarlo sin revisión.

## Backups

El backup útil incluye el perfil/volumen completo de n8n y la clave de cifrado
custodiada por separado. No basta con exportar workflows: las credenciales, el
propietario, configuraciones y metadatos viven en la base de n8n.

Procedimiento local:

1. detener n8n limpiamente;
2. crear una carpeta de backup fuera de la ruta activa;
3. copiar `.n8n-local/.n8n/` completo, conservando permisos y fechas;
4. cifrar/restringir el backup;
5. registrar versión de n8n, fecha y método, pero no secretos;
6. probar restauración en una ubicación aislada con la misma
   `N8N_ENCRYPTION_KEY`;
7. reiniciar y verificar workflows, credenciales y salud.

La inspección local encontró backups previos para recuperación de acceso e
instalación de Resend bajo `.n8n-local/backups/`. Sus contenidos no se leen ni
se versionan. Una copia dentro del mismo disco no sustituye un backup externo.

En Docker se debe respaldar el volumen `n8n_data`; no copiar una base SQLite
mientras el proceso escribe sobre ella. Definir retención, cifrado, propietario
y pruebas periódicas de restauración antes de producción.

## Recuperación de acceso del propietario

No es posible obtener la contraseña anterior. n8n `2.34.4` ofrece:

```text
n8n user-management:reset
```

Este comando restablece el estado de usuarios: conserva o crea al propietario,
le reasigna workflows/credenciales y elimina los demás usuarios. Por ese
impacto solo debe ejecutarse con autorización, n8n detenido y backup probado.

Procedimiento general usado para el perfil local:

1. detener n8n;
2. respaldar `.n8n-local/.n8n/`;
3. cargar el mismo `n8n/.env` sin imprimir sus valores;
4. fijar `N8N_USER_FOLDER` a `.n8n-local`;
5. ejecutar el CLI local de la versión fijada;
6. iniciar n8n y completar de nuevo el alta del propietario;
7. comprobar propiedad de workflows y credenciales.

Ejemplo PowerShell, solo después de cumplir los controles anteriores:

```powershell
$repositoryRoot = (Resolve-Path C:\cap_prenatal).Path
Get-Content -LiteralPath "$repositoryRoot\n8n\.env" | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
    $parts = $line.Split('=', 2)
    Set-Item -Path "Env:$($parts[0].Trim())" -Value $parts[1].Trim()
  }
}
$env:N8N_USER_FOLDER = "$repositoryRoot\.n8n-local"
node "$repositoryRoot\node_modules\n8n\bin\n8n" user-management:reset
```

El ejemplo no imprime secretos, pero sigue siendo una operación destructiva
sobre usuarios. No usarlo para un simple cambio de contraseña disponible desde
la interfaz.

## Importar y configurar workflows

1. iniciar backend y n8n;
2. instalar/reconciliar Resend antes de importar;
3. importar los JSON listados en [`../n8n/README.md`](../n8n/README.md);
4. confirmar que todos quedan inactivos;
5. asignar una credencial Header Auth a cada nodo HTTP;
6. asignar una credencial Resend a cada nodo de correo;
7. sustituir remitentes y destinatarios `.invalid` solo dentro del entorno;
8. guardar sin publicar;
9. probar nodo por nodo con datos sintéticos;
10. publicar después de la revisión y autorización institucional.

Una exportación versionable debe eliminar IDs/nombres de credenciales,
destinatarios reales, remitentes internos y cualquier resultado de ejecución.

## Pruebas seguras

Orden recomendado:

1. `node --test backend/test/n8nInfrastructure.test.js`;
2. pruebas estáticas de los cinco JSON Resend;
3. health checks de backend y n8n;
4. HTTP Request con un período/cita sintéticos;
5. rama `total=0` para confirmar el comportamiento esperado;
6. constructor HTML sin ejecutar Resend;
7. descarga XLSX sintética y revisión del nombre/MIME;
8. un único correo de prueba a destinatario autorizado;
9. confirmar entrega y ausencia de datos sensibles en logs.

Para `Seguimiento semanal de inasistencias`, el orden manual obligatorio es:

1. mantener el workflow sin publicar;
2. ejecutar con una base o fixture sintético sin resultados y comprobar que
   Resend no se ejecuta;
3. usar una base temporal nueva para el caso positivo, porque un período ya
   registrado como `sin_resultados` no se reabre;
4. comprobar que `Preparar semana anterior` devuelve `ready`;
5. ejecutar una sola vez el flujo hasta Resend y confirmación;
6. repetir el workflow y comprobar que termina en `already_processed` antes de
   construir el correo;
7. revisar **Executions** sin copiar payloads nominales a tickets.

Para `Seguimiento oportuno Tdap El Chal`, mantener `active=false` y:

1. ejecutar `Preparar seguimiento Tdap` con datos sintéticos controlados;
2. comprobar por separado ambos cero, solo pendientes y ambos conjuntos; el
   validador estático también cubre solo nuevas;
3. verificar que ambos cero termina por la salida falsa sin descargar ni enviar;
4. en un caso positivo, comprobar que el resumen solo contiene conteos y token;
5. descargar el XLSX con la misma reserva y revisar dos hojas, tres columnas,
   nombre `DD-MM-YYYY` y ausencia de datos sensibles;
6. comprobar que `Descargar XLSX Tdap` entrega `binary.data`, que
   `Materializar XLSX en base64` produce un ZIP base64 que inicia con `UEsDB`
   y que el tamaño decodificado coincide con el `Content-Length` del backend;
7. comprobar que el HTML contiene las secciones `Nuevas oportunidades Tdap` y
   `Pendientes de Tdap`, únicamente con nombre, apellido y comunidad, y que
   ningún caso sintético de nuevas oportunidades se repite en pendientes;
8. ejecutar una sola vez Resend a un destinatario autorizado de prueba;
9. confirmar el despacho y repetir `Preparar seguimiento Tdap`; debe devolver
   `already_processed` sin volver a Resend;
10. revisar **Executions** y limpiar solo datos sintéticos mediante el
   procedimiento seguro de la base temporal.

Si la API responde `AUTOMATION_TDAP_GESTATIONAL_SOURCE_INCOMPLETE`, existe al
menos una candidata activa de El Chal sin FUR válida. Corregir el dato en CAP
Prenatal mediante personal autorizado; no excluirla ni estimar semanas en n8n.

No ejecutar el Schedule completo mientras se configuran credenciales. No usar
una paciente real para probar formato, errores o adjuntos.

### Tdap: XLSX adjunto corrupto

1. descargar directamente el endpoint y validar que ExcelJS/Excel abre el
   archivo;
2. comprobar MIME XLSX y nombre `.xlsx` en `Descargar XLSX Tdap`;
3. verificar en la vista **Binary** que el campo sea `data` y anotar el tamaño;
4. guardar temporalmente el archivo de almacenamiento de la ejecución y
   comparar SHA-256 con una captura exacta de la respuesta HTTP;
5. confirmar que `Materializar XLSX en base64` devuelve el mismo tamaño y
   SHA-256 después de decodificar;
6. no conectar el binario almacenado directamente al nodo comunitario Resend
   2.8.0: `binary.data.data` puede contener `filesystem-v2:...`;
7. verificar que el nodo `Enviar seguimiento por Resend` use la credencial
   predefinida `Resend API` y `attachments[].content` desde
   `attachment_base64`.

Una coincidencia de hash backend → `binary.data` → base64, seguida de un archivo
pequeño en la bandeja, localiza el defecto en la construcción del adjunto y no
en el XLSX ni en el HTTP Request de descarga.

## Actualización de n8n o Resend

### n8n

1. revisar notas oficiales y cambios incompatibles;
2. respaldar y probar restauración;
3. probar la nueva versión en un perfil/volumen aislado;
4. verificar compatibilidad de `n8n-nodes-resend` y workflows;
5. actualizar juntos `package.json`, `package-lock.json`, script, ambos Compose
   y pruebas de infraestructura;
6. ejecutar pruebas completas y una prueba sintética;
7. conservar la misma `N8N_ENCRYPTION_KEY`;
8. documentar rollback antes de cambiar producción.

No usar `latest`, rangos semver, `npx n8n` ni saltar automáticamente de major.

### Resend

1. fijar la nueva versión en la configuración declarativa;
2. respaldar el perfil/volumen;
3. reiniciar un entorno aislado y dejar que n8n reconcilie;
4. revisar que los nodos abren sin parámetros desconocidos;
5. ejecutar las pruebas estáticas y un correo sintético;
6. actualizar producción solo con rollback disponible.

## Diagnóstico rápido

### `Falta n8n/.env`

Copiar `n8n/.env.example` a `n8n/.env`, completar una key propia y ejecutar
desde la raíz. No copiar `backend/.env`.

### `Missing script: n8n:local`

La terminal está en `backend`. Volver a `C:\cap_prenatal`.

### El nodo Resend no aparece

- confirmar `n8n-nodes-resend@2.8.0` en el perfil/volumen;
- revisar las cuatro variables de paquetes declarativos;
- reiniciar n8n;
- comprobar que paquetes no verificados siga en `false`;
- revisar logs de reconciliación sin copiar tokens.

### `connect EACCES <IP>:443`

Es un bloqueo de salida HTTPS del proceso, sandbox o firewall; no es una
contraseña inválida. Comprobar egress DNS/HTTPS hacia la API de Resend desde el
mismo entorno que ejecuta n8n. No abrir Internet de forma general en
producción: usar reglas limitadas y registrar el cambio.

### `The resource you are requesting could not be found`

La causa conocida es usar la ruta retirada
`/api/automatizaciones/proximas-citas`. Usar la ruta versionada `/v1/...`,
confirmar puerto `3001`, el opt-in local y el Header Auth. Una integración
deshabilitada responde `404` deliberadamente.

### No se envió el recordatorio

Si `total=0`, es el resultado correcto: la rama termina antes de Resend. Si hay
citas, revisar contrato, credencial Header Auth, credencial Resend y salida
HTTPS sin copiar el payload a tickets.

### Censo sin adjunto

Con `total=0` se envía solo un aviso. Con datos, revisar que la ruta `/excel`
responda archivo, que el HTTP Request use `responseFormat=file`, que la
propiedad sea `data` y que el nodo Resend adjunte esa propiedad.

### Inasistencias: `AUTOMATION_DISPATCH_UNCERTAIN`

El backend ya reservó el período y no puede saber si un intento anterior llegó
a Resend. No ejecutar otra vez el workflow ni borrar la fila técnica. Revisar
la ejecución y el evento de Resend:

- si el proveedor confirma la aceptación, resolver como `enviado` con
  `entrega_confirmada_en_resend`;
- si se confirma que no hubo entrega, autorizar `reintentar` con
  `entrega_no_realizada_confirmada`;
- si la evidencia sigue siendo ambigua, conservar la reserva y escalar.

La llamada manual está documentada en
[`N8N.md`](N8N.md#seguimiento-de-inasistencias-n8n-ops-01a). Requiere la misma
credencial M2M y la confirmación literal. Nunca pegar la key en historial de
terminal, tickets o Notion.

### Inasistencias: API no disponible, timeout o contrato inválido

La ejecución debe quedar fallida. No interpretar un error como `total=0`. En
**Executions**, identificar el último nodo verde y el primero fallido:

- `Preparar semana anterior`: salud, puerto, allowlist y Header Auth;
- `Validar contrato y reserva`: cambio incompatible del backend;
- `Enviar seguimiento por Resend`: credencial, dominio o egress;
- `Confirmar despacho en CAP`: revisar primero si Resend aceptó el correo.

Los nodos HTTP usan 10 segundos y no tienen reintentos automáticos. Un error de
confirmación posterior a Resend exige el procedimiento de despacho ambiguo.

### Tdap: reserva, snapshot o archivo inválido

`AUTOMATION_DISPATCH_UNCERTAIN` se resuelve con el mismo procedimiento de
verificación previa en Resend, usando la confirmación literal
`REINTENTAR_SEGUIMIENTO_TDAP_EL_CHAL`. No borrar la fila técnica.

`AUTOMATION_DISPATCH_SNAPSHOT_CHANGED` significa que municipio, embarazo,
vacuna, FUR, nombre o comunidad cambiaron entre preparación y descarga. El
backend bloqueó el archivo para no enviar un XLSX diferente al resumen. No
reintentar automáticamente; confirmar que no hubo envío, resolver la reserva
como `reintentar` y comenzar de nuevo.

Si `Descargar XLSX Tdap` falla con token inválido, comprobar que el header
`X-CAP-Dispatch-Token` toma el token de la misma ejecución y que la credencial
M2M sigue asignada. El token no se copia a logs, tickets o Notion.

### Credenciales no descifrables

Detener el proceso y confirmar que se usó la key histórica correcta. No
regenerar ni sobrescribir la key. Restaurar perfil y clave desde backups
compatibles o recrear las credenciales si la clave se perdió.

## Checklist de cierre local

- [ ] Los cinco workflows Resend siguen inactivos salvo autorización expresa.
- [ ] No quedó n8n escuchando fuera de loopback.
- [ ] No hay exports locales o `.env` rastreados por Git.
- [ ] No se guardaron payloads clínicos o capturas de pacientes.
- [ ] Se registraron pruebas y errores sin secretos.
- [ ] Se detuvo n8n cuando ya no se necesita.
