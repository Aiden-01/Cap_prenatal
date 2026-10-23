# CPREN-119 — CHECKPOINT-06: sincronización con main

Sesión: 2026-10-22 (Guatemala), equipo Casa, dispositivo HUGUITO.
Issue: CPREN-119, bajo CPREN-12 / Epic CPREN-3. Conserva En revisión por
validación funcional pendiente del CAP. CPREN-115–118 no cambian de estado.

## Base e integración

- Rama exclusiva: `feature/cpren-119-seguimiento-notas-controles`.
- HEAD y remoto anteriores: `6f15fef6dbc61a2355ef5f0f3f0c69e9c44eb821`.
- Main incorporada: `d5fae677fa462af9ca5b7174a46d3ebf21e12196`.
- Árbol inicialmente limpio; `git pull --ff-only` y `git fetch origin` confirmaron
  ambos SHA del checkpoint, sin avances adicionales.
- Worktrees existentes: raíz CPREN-119, `tmp_worktrees/cpren125` en `da8f250`
  y `tmp_worktrees/main` en `d5fae67`. No se cambió de rama ni se usaron esos
  worktrees para editar o integrar.
- Merge normal de `origin/main`, preparado con `--no-commit --no-ff` para
  revisar y probar antes del commit. Sin rebase, squash ni force push.

El SHA del merge se registra en Jira y en el resultado de la sesión; se obtiene
también mediante `git log -1 --format='%H %P'` en la rama publicada. No se incluye
un SHA autorreferencial dentro del mismo commit.

## Conflictos y decisiones

1. `NuevoControl.jsx`: conflicto en imports. Se combinaron `useLayoutEffect` de
   CPREN-125 con `useRef` de CPREN-119. La revisión completa de ambos lados
   confirmó que el automerge preservó el bloqueo inmediato de doble envío,
   respuesta POST con ID real, encabezado enfocable y confirmación persistente.
   La navegación de 800 ms permanece exclusivamente en edición. El alta ofrece
   seguimiento autorizado o regreso al expediente sin completar nota.
2. `TimelineControles.jsx`: conflicto en parámetros de `ControlRow`. Se conserva
   `seguimiento` junto con permiso de edición, solo lectura y estado de embarazo.
   Abrir/Editar mantienen disposición horizontal y responsive de main; Editar
   requiere permiso y embarazo activo editable. Completitud del control y estado
   documental permanecen separados. Hook, lotes y filtro de permisos intactos.
3. `ExpedientePaciente.jsx`: automerge revisado; entrega simultáneamente `usuario`,
   contexto del embarazo y permiso `puedeEditar` al historial.

Se conservaron íntegramente desde main el orden General/Laboratorios/
Orientaciones/Suplementación, revisión voluntaria 0/4–4/4, sticky, revelado de panel,
movimiento reducido, cita al final de General y retiro de narrativas del payload.
Las narrativas históricas se preservan por omisión en PUT; el historial conserva
su consulta. Los estilos y helpers UX coinciden con `origin/main`.

Todo `backend/src`, incluidas migraciones 023–027, esquema, autorización clínica,
snapshots, auditoría e idempotencia, coincide con el HEAD anterior CPREN-119.
No se crearon migraciones. Control/cita siguen independientes de notas.

La prueba Chromium de CPREN-125 se adaptó al contrato combinado: después de POST
espera confirmación y foco, y regresa mediante el botón explícito. La antigua
espera de navegación automática era incompatible con CPREN-119. Se agregaron
cuatro regresiones DOM: progreso 4/4 seguido de confirmación persistente más allá
de 800 ms, payload sin narrativas/estado de revisión/notas, ID y seguimiento; y
edición desde historial con nota pendiente en activo/cerrado/puerperio.

## Resultados de esta sincronización

| Comprobación | Resultado real |
| --- | --- |
| Backend completo, `npm test` | 1402 totales; 1348 aprobadas, 0 fallos, 54 omisiones opt-in |
| Frontend completo, `npm test` | 189 lógicas y 271 DOM aprobadas; 23 archivos DOM, 0 fallos |
| Frontend `npm run lint` | Aprobado, sin errores ni advertencias |
| Frontend `npm run build` | Aprobado; artefacto local, sin despliegue |
| CPREN-115–118, PostgreSQL temporal | 57 aprobadas, 0 fallos/omisiones; incluye Chrome de CPREN-116 |
| CPREN-119, PostgreSQL temporal + Chrome | 18 aprobadas, 0 fallos/omisiones |
| Chromium UX CPREN-125 con API sintética | 144 verificaciones de navegación, 0 fallos; 1440/768/390/320 px, sticky, revisión 4/4, permisos, error PUT, éxito PUT y alta POST con confirmación |
| Inspección visual | Capturas actuales de historial móvil, confirmación y navegación desktop/móvil revisadas |
| Integridad Git | `git diff --check` correcto; sin marcadores de conflicto; backend productivo/migraciones intactos |
| Limpieza temporal | 0 directorios de clústeres propios, procesos PostgreSQL y conexiones en 55475–55479 al terminar |

Las 54 omisiones del backend completo son suites opt-in no activadas allí. Las
integraciones nuevas se ejecutaron aparte con clústeres propios en loopback,
puertos 55475–55479 y comprobación de `data_directory`. No se habilitaron suites
históricas de destinos configurables ni se ejecutaron migraciones persistentes.
Chrome CPREN-116 y CPREN-119 recorrió UI → API real → PostgreSQL desechable en
1440 y 390 px, con datos sintéticos y bloqueo de peticiones externas.

El sandbox impidió sockets locales/control de PostgreSQL en los primeros intentos.
La suite backend y las integraciones se repitieron fuera del sandbox y aprobaron.
Puppeteer inicialmente buscaba una versión no instalada; se seleccionó el Chrome
local con `PUPPETEER_EXECUTABLE_PATH`. No se instalaron dependencias ni se cambió
código productivo para resolver el entorno. El clúster inactivo residual del
primer intento se eliminó tras verificar su ruta exacta y ausencia de procesos.
El primer runner UX arrancó desde la raíz y advirtió falta de configuración
Tailwind; se corrigió su directorio de trabajo y se repitió toda la prueba con
los estilos reales, sin dicha advertencia. El runner temporal usa Vite sin .env
ni proxy a un backend persistente, y cierra su servidor al terminar.
Persiste únicamente el aviso preexistente de Browserslist/caniuse-lite antiguo.

Logs de esta ejecución y capturas sintéticas quedan localmente bajo
`tmp_checkpoint06/` y `tmp_ux125/`, ignorados por Git. Los resultados históricos de
otros documentos no se presentan como pruebas ejecutadas por esta sesión.

## Inventario respecto a CPREN-119 anterior

- Backend: `backend/test/controlesPrenatales.test.js` (regresión importada de main).
- Interfaz: `frontend/src/pages/NuevoControl.jsx`,
  `frontend/src/components/TimelineControles.jsx`,
  `frontend/src/pages/ExpedientePaciente.jsx`, `frontend/src/index.css`,
  `frontend/src/pages/nuevo-control.css`,
  `frontend/src/utils/prenatalControlAccess.js`.
- Pruebas: `frontend/test-browser/prenatalUx.cjs`,
  `frontend/test-dom/controlConsultation.test.jsx`,
  `frontend/test-dom/seguimientoNotas.test.jsx`,
  `frontend/test/clinicalWorkflowPhaseDSource.test.js`,
  `frontend/test/clinicalWorkflowSource.test.js`,
  `frontend/test/closedPregnancyControlReadOnly.test.js`.
- Documentación: este archivo, `docs/CPREN_119_SEGUIMIENTO_NOTAS_CONTROLES.md`,
  `docs/CPREN_125_HOTFIX_UX.md` y capturas importadas de main
  `docs/cpren125/desktop.png`, `docs/cpren125/mobile.png`.

## Límites

La sincronización es solo de desarrollo. Main y producción no se modifican;
sin acceso a AWS/n8n/bases persistentes, despliegue ni merge hacia main.
CPREN-120 no se inició. Continúan pendientes la validación funcional del CAP y
los límites ya documentados de CPREN-119: editor/PDF aún no implementados,
clasificaciones/permisos reales sujetos a decisión autorizada y correcciones de
confirmaciones históricas sujetas a un mecanismo futuro explícito y auditado.
