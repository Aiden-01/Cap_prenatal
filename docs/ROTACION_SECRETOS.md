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
   `JWT_SECRET` invalida todos los tokens existentes y obliga a iniciar sesion de
   nuevo.
6. Rotar los secretos de automatizacion cuando corresponda y actualizar ambos
   extremos de la integracion en la misma ventana.
7. Revisar y revocar copias en CI, variables de servidores, clones, artefactos,
   respaldos, registros y equipos de desarrollo.
8. Coordinar posteriormente la limpieza del historial Git con todo el equipo.

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

El cambio obligatorio de contrasena en primer acceso sigue pendiente porque el
esquema actual no contiene esa bandera; se implementara con sesiones y politica de
contrasenas en un sprint posterior.
