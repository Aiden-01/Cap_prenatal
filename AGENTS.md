# Reglas operativas de CAP Prenatal

Estas instrucciones aplican a todo el repositorio. El centro de control oficial del trabajo de Codex es la pagina de Notion **CAP Prenatal — Centro de control del proyecto**:

`https://app.notion.com/p/3b39e86cb2af818caa06f4018050d216`

La base **CAP Prenatal — Tabla de errores** es material academico separado. No consultarla, relacionarla ni modificarla durante el trabajo de este repositorio.

## Inicio obligatorio de cada sesion

1. Leer `.codex-machine` si existe. El valor valido de `CAP_PRENATAL_EQUIPO` es `Casa` o `Trabajo`. Si falta, preguntar una vez al usuario y, mientras se confirma, registrar al menos el nombre del dispositivo sin inventar el equipo.
2. Revisar `git status --short --branch` antes de modificar archivos. Si el arbol esta limpio, ejecutar `git pull --ff-only`. Si hay cambios locales, preservarlos y no hacer pull, reset, checkout ni limpieza destructiva; explicar el conflicto si impide avanzar.
3. Abrir en Notion el centro de control y consultar sus cuatro bases hijas por sus nombres exactos:
   - **CAP Prenatal — Trabajo**
   - **CAP Prenatal — Sesiones**
   - **CAP Prenatal — Decisiones técnicas**
   - **CAP Prenatal — Sprints**
4. Revisar el trabajo activo, el sprint vigente y la sesion mas reciente antes de proponer o implementar cambios.
5. Crear el elemento de **Trabajo** si no existe; si existe, reutilizarlo y actualizarlo a `En curso`. No duplicar tareas ni bugs.
6. Reutilizar el sprint operativo correspondiente o crearlo si el trabajo inicia un ciclo nuevo. Relacionarlo con **Trabajo** y conservar separados los ciclos reconstruidos de los sprints formales.
7. Crear una entrada en **Sesiones** con fecha, equipo, dispositivo, objetivo, rama inicial y commit inicial. Marcarla `Abierta` y relacionarla con el elemento correspondiente de **Trabajo** y con el sprint activo. No duplicar sesiones abiertas.

## Durante la sesion

- Mantener el alcance del elemento de Trabajo alineado con la solicitud del usuario.
- Mantener actualizado el sprint activo con objetivo, alcance, fechas, trabajo, commits, pruebas, resultado, retrospectiva y pendientes. Marcar como `No verificable` cualquier resultado historico que no tenga evidencia suficiente.
- Registrar como `Bug` solo defectos reales encontrados en el codigo o durante las pruebas.
- Registrar en **Decisiones tecnicas** las decisiones materiales de arquitectura, seguridad, base de datos, reglas clinicas, frontend, backend, PDF, n8n o infraestructura. Incluir contexto, alternativas, motivo y consecuencias; relacionarlas con el trabajo correspondiente.
- No guardar en Notion secretos, credenciales, tokens, contenido de archivos `.env` ni datos clinicos identificables.
- No afirmar que una prueba, commit, push o despliegue se realizo si no existe evidencia verificable.

## Cierre obligatorio de cada sesion

1. Revisar `git status --short`, `git diff --stat` y, cuando corresponda, `git diff --cached --stat`.
2. Ejecutar las pruebas proporcionales al cambio. Como base:
   - Backend: `npm test` desde `backend` o el script especifico relacionado.
   - Frontend: `npm test`, `npm run lint` y/o `npm run build` desde `frontend`, segun el alcance.
   - Migraciones: no ejecutarlas contra una base real sin autorizacion, backup y las verificaciones documentadas.
3. Actualizar **Trabajo** con estado, archivos modificados, pruebas, resultado, rama, commit y proximo paso.
4. Actualizar el sprint activo con estado, commits, pruebas, resultado, retrospectiva y pendientes; cerrarlo solo si su objetivo termino.
5. Cerrar la entrada de **Sesiones** con rama final, commit final, archivos modificados, pruebas ejecutadas, resultado, bugs encontrados, pendientes y siguiente paso.
6. Crear commit y push solo cuando la solicitud del usuario los autorice. Registrar identificadores reales; si no se hicieron, dejarlo explicitamente indicado.
7. La respuesta final al usuario debe resumir cambios, pruebas, estado de Git y siguiente paso, consistente con Notion y con el sprint activo.

## Si Notion no esta disponible

Informar la desconexion, continuar solo si el trabajo tecnico puede hacerse de forma segura y conservar en la respuesta final el resumen que debe registrarse. No sustituir el centro oficial con la tabla academica ni crear otra base duplicada.
