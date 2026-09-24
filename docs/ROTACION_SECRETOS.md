# Rotacion de secretos

Este procedimiento es manual y debe ejecutarse de forma coordinada por la persona
responsable del entorno. No incluye comandos con valores reales ni reescribe el
historial Git.

## Motivo

Un archivo `backend/.env` estuvo rastreado en commits anteriores. Ignorarlo o
eliminarlo del ultimo commit no borra las copias existentes en el historial, clones,
CI, respaldos o servidores. La rotacion es obligatoria incluso si el repositorio
siempre fue privado.

## Procedimiento coordinado

Antes de cambiar nada, inventariar el entorno y conservar un respaldo cifrado
y verificable de PostgreSQL y de los datos de n8n junto con su clave de cifrado
vigente. Preparar una ventana de mantenimiento, prueba sintética y reversión.
Los secretos actuales son `JWT_SECRET`, la contraseña PostgreSQL (`DB_PASSWORD`
o la incorporada en `DATABASE_URL`; `POSTGRES_PASSWORD` en Compose), la clave
M2M de n8n cuyo SHA-256 se configura como `N8N_API_KEY_HASH_CURRENT`/`NEXT`,
la API key de Resend guardada como credencial de n8n y `N8N_ENCRYPTION_KEY`.
Los parámetros `SESSION_*` son tiempos de sesión, no secretos.

1. Generar un `JWT_SECRET` nuevo a partir de por lo menos 32 bytes aleatorios.
   `openssl rand -base64 48` y el comando Node documentado en `.env.example` son
   opciones locales; el resultado no debe copiarse a chats, tickets ni Git.
2. Generar una contrasena PostgreSQL nueva, diferente de usuario, base, JWT y otros
   secretos. Cambiarla en PostgreSQL dentro de una ventana coordinada.
3. Actualizar el gestor de secretos o las variables protegidas de cada entorno. No
   editar archivos versionados ni mostrar los valores en logs.
4. Reiniciar los servicios que consumen las variables y confirmar que arrancan con
   la validacion centralizada.
5. Confirmar que los JWT emitidos antes de la rotacion ya no son aceptados. Cambiar
   `JWT_SECRET` invalida los tokens de acceso existentes. Las sesiones también
   guardan tokens de renovación con hash en PostgreSQL: revocar las sesiones
   activas para forzar un inicio de sesión nuevo y verificar acceso y renovación.
6. Para M2M, generar una clave nueva, configurar primero su hash SHA-256 en
   `N8N_API_KEY_HASH_NEXT` y reiniciar el backend. Cambiar la credencial que n8n
   envía en `X-CAP-Automation-Key`, probar con datos sintéticos, promover el hash
   nuevo a `CURRENT`, vaciar `NEXT`, reiniciar y revocar la clave anterior.
   Conservar `N8N_ALLOWED_CIDRS` y verificar que la integración siga habilitada.
7. Para Resend, crear una API key nueva, actualizar la credencial `Resend API`
   usada por los nodos y por el HTTP Request de Tdap, probar un único envío
   sintético y revocar la key anterior. Revisar eventos antes de reintentar un
   envío cuya aceptación sea incierta para evitar duplicados.
8. No sustituir `N8N_ENCRYPTION_KEY` directamente en una instancia con
   credenciales cifradas: la clave nueva no podrá descifrar las existentes.
   Respaldar clave y datos, planear migración o recreación de credenciales,
   verificar todos los workflows y conservar una vía de reversión segura.
   Cambiarla exige reiniciar n8n.
9. Revisar y revocar copias en CI, variables de servidores, clones, artefactos,
   respaldos, registros y equipos de desarrollo.
10. Coordinar posteriormente la limpieza del historial Git con todo el equipo.

`JWT_SECRET`, la configuración PostgreSQL y los hashes M2M son leídos por el
backend al iniciar; reiniciarlo tras cada cambio. La contraseña del servidor
PostgreSQL y la del cliente deben coincidir durante la transición; reiniciar
los consumidores y verificar conexiones nuevas. En Compose, cambiar solo
`POSTGRES_PASSWORD` no actualiza automáticamente la contraseña de una base ya
inicializada. La credencial Resend se actualiza en n8n y no requiere reiniciar
Express; `N8N_ENCRYPTION_KEY` sí requiere reiniciar n8n.

## Limpieza futura del historial

La limpieza no forma parte de este sprint. Requiere inventariar ramas y tags,
respaldar referencias necesarias, usar una herramienta especializada y realizar
un force push coordinado. Todos los colaboradores tendran que volver a clonar o
reescribir sus ramas; de lo contrario pueden reintroducir el historial antiguo.

No ejecutar `git filter-repo`, `git filter-branch`, BFG ni force push sin una ventana
aprobada, respaldo y comunicacion previa.

## Seed en produccion

El seed general esta bloqueado en produccion salvo que, ademas de las variables de
la cuenta inicial, se defina
`SEED_CONFIRM_PRODUCTION=CREATE_INITIAL_PRIVILEGED_ACCOUNT`. Esta confirmacion no
sustituye una revision operativa. Una cuenta existente no recibe una contrasena
nueva durante el seed.

Verificar el estado actual de las políticas de acceso en el código antes de
aplicar el seed; no usarlo como mecanismo de rotación de contraseñas existentes.
