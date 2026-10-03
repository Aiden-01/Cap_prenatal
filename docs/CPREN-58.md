# CPREN-58 — Catálogos de establecimiento

## Diagnóstico y alcance

Base de trabajo: `main`, HEAD `cf50a60e20730f19ca47110e694c1a7e83915396`, equipo Casa.
El esquema versionado guarda `nombre_establecimiento` en VARCHAR(150),
`distrito` en VARCHAR(100) y `area_salud` en VARCHAR(150), todos opcionales.
No hay enum, CHECK ni relación con tabla catálogo para estos campos.
Se conserva el almacenamiento de texto: no se requiere migración ni dependencia.

Las rutas editables son el alta `/nuevo` y `/pacientes/:id/editar`, ambas mediante
`NuevaPaciente.jsx`. El payload llega a POST/PUT `/api/pacientes`, pasa por
`pacientes.schemas.js`, `pacientesController`, `pacientesService` y las queries
parametrizadas de `pacientesRepository`. No cambia el repositorio.
Expediente, ficha clínica, PDFs y plan de parto consumen el texto almacenado;
no requieren cambios. El campo separado de servicio del plan de parto no es
una vía de edición de estos atributos del paciente.

## Catálogo y defaults

| Campo | Valores canónicos | Default en alta |
| --- | --- | --- |
| Establecimiento | CAP El Chal; P/S Colpetén; C/C Nuevas Delicias; P/S Las Flores; P/S Santa Amelia | CAP El Chal (default existente conservado) |
| Distrito | El Chal; Santa Ana; Dolores; Poptún; San Luis; Chacté | El Chal |
| Área de Salud | Petén Sur Oriente | Petén Sur Oriente |

Hay un módulo congelado por aplicación, con prueba de igualdad exacta entre
backend y frontend. Los defaults están en el estado inicial y llegan al payload.
Los tres controles usan el select nativo y la clase del select Categoría;
conservan labels asociados, name/id, teclado y estilos de foco. No tienen entrada
libre ni opción vacía para un alta.

## API y compatibilidad histórica

Se conserva la omisión opcional de campos del contrato previo de la API.
Todo valor proporcionado en un alta debe pertenecer exactamente al catálogo:
texto arbitrario, vacío, null, diferencias de mayúsculas, tildes o espacios
reciben HTTP 400 / VALIDATION_ERROR, sin autocorrección. La UI siempre proporciona
los tres valores en el alta.

En edición, el servicio compara con la fila actual dentro de la transacción y
del bloqueo ya existentes. Un valor reenviado idéntico se omite antes de cualquier
normalización; un valor distinto debe ser canónico. Esto conserva incluso null,
vacío y espacios históricos. Un reenvío sin cambios administrativos devuelve
éxito sin escritura. La UI muestra el valor histórico como opción seleccionada
deshabilitada, con explicación, y omite los campos sin cambios en PUT.
Solo una selección explícita sustituye el histórico por un valor canónico.
Nunca se aplican defaults de alta sobre datos vacíos/null de una edición.

Se encontraron `Distrito Sur Oriente` y `Peten, Area Sur Oriente` en scripts demo
versionados, sin ejecutarlos. Esto demuestra que el código contempla valores
fuera del catálogo; no demuestra su presencia en una base real. No se consultó
producción ni se inventarió el conjunto real de datos históricos.

## Validación local

- Backend focal (catálogos + pacientes/embarazos): 75 aprobadas, 0 fallidas.
- Backend completo: 1219 aprobadas, 48 omitidas, 0 fallidas; sin DB real configurada
  para las integraciones opcionales.
- Frontend Node: 181 aprobadas, 0 fallidas (incluye paridad de catálogos).
- DOM focal: 4 aprobadas, 0 fallidas: opciones/defaults, navegación/teclado,
  payload, preservación y sustitución explícita de legacy.
- DOM completo: no pasó. 87 aprobadas, 5 fallidas y 1 error de worker (exit 134,
  memoria insuficiente). Las incidencias están en los archivos sin cambios
  `appointmentCalendarInteraction.test.jsx` y `appointmentsDashboard.test.jsx`.
  El calendario usa citas del 15/09/2026 pero inicia en octubre según el reloj
  actual; el dashboard también usa fecha fija 30/09/2026. No se modifican aquí.
- DOM excluyendo únicamente esos dos archivos, con un worker: 10 archivos y
  87 pruebas aprobadas, 0 fallidas. No sustituye el resultado de la suite completa.
- ESLint: aprobado. Vite build: aprobado; aviso existente de Browserslist antiguo.
- Revisión responsive local sintética: 1440×1000, 768×1024 y 390×844. Sin overflow
  horizontal, labels y controles dentro del viewport, textos largos conservados,
  footer/stepper presentes y navegación de ida/vuelta conserva selecciones.
  Los tres selects comparten altura de 44px y fondo dark con Categoría.
  Validación mediante DOM, árbol de accesibilidad y geometría; las capturas del
  navegador no fueron obtenibles por timeout de Page.captureScreenshot.

No se modificó producción, no se ejecutaron seeds/migraciones ni se crearon datos
permanentes. No hay commit, push ni despliegue. CPREN-58 queda En revisión;
la suite DOM completa mantiene las incidencias documentadas y falta aprobación
de integración.
