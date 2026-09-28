# Reglas operativas de CAP Prenatal

Estas instrucciones aplican a todo el repositorio. La unica fuente oficial de gestion del proyecto es Jira: proyecto **CAP Prenatal**, clave `CPREN`, sitio `tareajiraads.atlassian.net`.

Notion queda solo como archivo historico. No consultarlo ni actualizarlo salvo solicitud explicita del usuario; tampoco usarlo como alternativa si Jira no esta disponible.

## Inicio obligatorio de cada sesion

1. Leer `.codex-machine` si existe. El valor valido de `CAP_PRENATAL_EQUIPO` es `Casa` o `Trabajo`. Si falta, preguntar una vez al usuario y, mientras se confirma, registrar al menos el nombre del dispositivo sin inventar el equipo.
2. Revisar `git status --short --branch` antes de modificar archivos. Si el arbol esta limpio, ejecutar `git pull --ff-only`. Si hay cambios locales, preservarlos y no hacer pull, reset, checkout ni limpieza destructiva; explicar el conflicto si impide avanzar.
3. Buscar primero en `CPREN` un issue existente que corresponda a la solicitud y reutilizarlo. No duplicar tareas, bugs ni features. Crear un issue nuevo solo si no existe uno equivalente.
4. Asociar el issue al Epic correspondiente:
   - `CPREN-1` Operación e infraestructura.
   - `CPREN-2` Automatizaciones n8n.
   - `CPREN-3` Producto y experiencia de usuario.
   - `CPREN-4` Calidad, pruebas y seguridad.
   - `CPREN-5` Documentación y tesis.
5. Si comienza trabajo real, pasar el issue a `En curso`. No crear tickets separados solo para registrar sesiones.

## Durante la sesion

- Mantener el alcance del issue alineado con la solicitud del usuario.
- Registrar en el issue el contexto, los archivos modificados, las pruebas, los commits, los resultados y los pendientes. Marcar como `No verificable` cualquier resultado historico sin evidencia suficiente.
- Registrar como `Error` solo defectos reales encontrados en el codigo o durante las pruebas.
- Documentar en el issue las decisiones materiales de arquitectura, seguridad, base de datos, reglas clinicas, frontend, backend, PDF, n8n o infraestructura, con contexto, alternativas, motivo y consecuencias.
- No guardar en Jira secretos, credenciales, tokens, contenido de archivos `.env` ni datos clinicos identificables.
- No afirmar que una prueba, commit, push o despliegue se realizo si no existe evidencia verificable.

## Cierre obligatorio de cada sesion

1. Revisar `git status --short`, `git diff --stat` y, cuando corresponda, `git diff --cached --stat`.
2. Ejecutar las pruebas proporcionales al cambio. Como base:
   - Backend: `npm test` desde `backend` o el script especifico relacionado.
   - Frontend: `npm test`, `npm run lint` y/o `npm run build` desde `frontend`, segun el alcance.
   - Migraciones: no ejecutarlas contra una base real sin autorizacion, backup y las verificaciones documentadas.
3. Actualizar el issue con estado, contexto, archivos modificados, pruebas, resultados, rama, commits y pendientes. Usar `En revisión` cuando falte validacion y `Finalizada` cuando cumpla los criterios de cierre.
4. Crear commit y push solo cuando la solicitud del usuario los autorice. Registrar identificadores reales; si no se hicieron, dejarlo explicitamente indicado.
5. La respuesta final al usuario debe resumir cambios, pruebas, estado de Git y siguiente paso, consistente con el issue de Jira.

## Si Jira no esta disponible

Informar la desconexion, continuar solo si el trabajo tecnico puede hacerse de forma segura y conservar en la respuesta final un resumen listo para registrar despues en Jira. No volver a Notion como alternativa.
