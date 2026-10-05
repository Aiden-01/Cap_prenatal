# CPREN-65 — Concurrencia optimista en edición de pacientes

Validación local: 2026-10-05, equipo `Trabajo`. Rama `main`, base
`21dab22cd70e2b0fc321476afaf5aed877b4e71a`. Árbol inicialmente limpio;
`git pull --ff-only` respondió `Already up to date.`

No hubo acceso a producción, SSH, cambios de servicios, backups ni migraciones
contra una base existente. No se hizo commit ni push. Código listo para revisión.

## Comportamiento

Antes, la transacción y `SELECT ... FOR UPDATE` serializaban las escrituras,
pero un formulario antiguo podía sobrescribir el guardado de otro usuario.

Ahora, `GET /api/pacientes/:id` devuelve `version`; el formulario conserva ese
entero y lo envía en el `PUT`. El backend valida el token, abre la transacción,
bloquea la paciente con el mismo `FOR UPDATE` y compara las versiones. Si difieren,
lanza `409 PATIENT_VERSION_CONFLICT` antes de escribir o auditar. El rollback deja
intactas paciente, embarazos y auditoría.

Si coinciden, se normalizan y validan los campos, se detectan diferencias reales
y el `UPDATE` incrementa `version = version + 1`, `updated_at` y `updated_by`.
Auditoría y sincronización FUR/FPP comparten la misma conexión y transacción;
cualquier fallo revierte todo, incluida la versión. Un no-op devuelve la versión
vigente sin actualizar metadata ni crear auditoría de actualización.

No se acepta versión ausente, string, fraccionaria, negativa o fuera de INTEGER.
La ruta responde `400 VALIDATION_ERROR`; la defensa adicional del servicio usa
`PATIENT_VERSION_REQUIRED`. El campo no pertenece a la lista de campos editables:
solo el servidor decide su incremento.

## Decisiones y regresiones consideradas

- Se agrega la migración `022_pacientes_version.sql`: `INTEGER NOT NULL DEFAULT 1`,
  también para registros existentes. Se integra en `schema.sql` y en la lista
  obligatoria de `schemaCompatibility.js`. El backend exige esa migración al iniciar.
  Se conserva el migrador oficial y su registro/checksum; no se editaron migraciones anteriores.
- El bloqueo existente se conserva. Alternativas descartadas: quitar el bloqueo,
  sobrescribir automáticamente, o combinar campos. La versión detecta obsolescencia;
  el bloqueo hace determinista la comparación tras esperar a otra transacción.
- Las fechas PostgreSQL `DATE` se comparan por día civil, usando el calendario
  local con el que `pg` crea el objeto `Date`. Comparar instantes UTC podía generar
  falsos cambios en zonas horarias distintas de UTC.
- La sincronización del embarazo recibe las fechas definitivas de la paciente.
  El antiguo `COALESCE` impedía vaciar correctamente ambas fechas. Ahora admite
  `null` y conserva la fecha no editada mediante la fila completa resultante.
- Registrar un embarazo nuevo incrementa versión si cambia FUR/FPP o ficha de
  riesgo en la paciente; si esos valores son idénticos, conserva versión y metadata.
  No se agregan tokens a otros módulos clínicos en esta fase.
- El frontend envía diferencias respecto al formulario cargado. Así, defaults y
  edad/comunidad calculadas solo para presentación no producen una falsa edición.
  FUR modificada siempre incluye la FPP mostrada, para preservar una corrección manual.
- Permisos, filtrado VIH, CUI, catálogos históricos/canónicos y comunidades mantienen
  sus mecanismos existentes. Las suites de regresión validan esos flujos.

## Experiencia de conflicto

Un aviso persistente explica que otro usuario actualizó el expediente y que no
se guardó este formulario. Recibe foco y es anunciado a lectores de pantalla.
El usuario puede navegar los pasos para revisar/copiar su borrador; guardar queda
bloqueado mientras siga el conflicto.

`Cargar versión más reciente` muestra una confirmación del reemplazo y permite
`Conservar mi formulario`. Solo `Confirmar y cargar datos actuales` hace el GET.
Si falla, se conserva el borrador y se permite reintentar. Si funciona, se reemplaza
el formulario completo, se actualiza el token y se vuelve al primer paso. No se
mezclan campos automáticamente ni se guardan datos clínicos en localStorage.

Verificación en Chromium headless: 1440, 768 y 390 px, temas claro/oscuro, sin
overflow horizontal ni errores JavaScript. El navegador usó la página real con
una API sintética en memoria; no inició el backend real ni hizo peticiones externas.

## Archivos modificados y creados

| Archivo | Cambio |
| --- | --- |
| `backend/src/db/migrations/022_pacientes_version.sql` | Nueva migración versionada |
| `backend/src/db/schema.sql` | Columna en esquema de instalaciones nuevas |
| `backend/src/db/schemaCompatibility.js` | Migración 022 obligatoria |
| `backend/src/validations/pacientes.schemas.js` | Token entero obligatorio en PUT |
| `backend/src/services/pacientesService.js` | Comparación tras bloqueo, no-op, fechas y sincronización |
| `backend/src/repositories/pacientesRepository.js` | Incremento atómico y sincronización que admite null |
| `backend/test/patientVersionPostgres.test.js` | Nueva matriz HTTP/SQL con PostgreSQL temporal |
| `backend/test/pacientesEmbarazos.test.js` | Fixtures versionados y contrato de respuesta |
| `backend/test/establecimientoCatalogs.test.js` | Fixtures HTTP con versión vigente |
| `backend/test/schemaCompatibility.test.js` | Registro requerido de 022 |
| `backend/test/pacienteEmbarazoPostgres.test.js` | Conserva comprobación de 021 y compatibilidad con 022 |
| `frontend/src/pages/NuevaPaciente.jsx` | Token, envío de diferencias y recuperación del conflicto |
| `frontend/src/components/PatientVersionConflict.jsx` | Nuevo aviso y confirmación accesibles |
| `frontend/src/components/patient-version-conflict.css` | Estilos responsive y variables de tema existentes |
| `frontend/test-dom/patientVersion.test.jsx` | Seis pruebas de versión, no-op, FPP y UX |
| `frontend/test-dom/establecimientoCatalogs.test.jsx` | Fixture de edición con versión |
| `frontend/test-browser/patientVersion.browser.cjs` | Verificación visual reproducible y aislada |
| `docs/CPREN_65_CONCURRENCIA_PACIENTES.md` | Este informe y procedimiento posterior |

## Pruebas ejecutadas

| Entorno / comando | Resultado final |
| --- | --- |
| `backend`: `npm test` | 1300 casos: 1251 aprobados, 49 omitidos, 0 fallidos; salida 0 |
| `backend`: matriz temporal descrita debajo | 11 aprobados, 0 omitidos, 0 fallidos; PostgreSQL 18.3; salida 0 |
| `frontend`: `npm test -- --maxWorkers=2` | 184 Node + 108 DOM, 14 archivos DOM, 0 fallidos/omitidos; salida 0 |
| `frontend`: `npm run lint` | 0 errores/advertencias ESLint; salida 0 |
| `frontend`: `npm run build` | Vite exitoso; salida 0 |
| `frontend`: `node test-browser/patientVersion.browser.cjs` | PASS en 1440/768/390 px; salida 0 |
| Repositorio: `git diff --check` | Sin errores de whitespace |

La suite general omite integraciones opcionales por sus flags. La matriz de esta
tarea sí se habilitó y ejecutó sobre un clúster nuevo, independiente de `.env` y
`DATABASE_URL`, limitado a `127.0.0.1:55465`, con datos sintéticos. El test detiene
y elimina su propio clúster al terminar. Reproducción local en PowerShell:

```powershell
# Desde backend; requiere binarios PostgreSQL instalados localmente.
$env:RUN_PATIENT_VERSION_POSTGRES = '1'
$env:PATIENT_VERSION_POSTGRES_BIN = 'C:/Program Files/PostgreSQL/18/bin'
node --test test/patientVersionPostgres.test.js
```

La matriz verifica migración sobre una paciente existente y su repetición registrada;
GET con versión; PUT correcto, incremento y actor auditado; conflicto FUR/FPP con
snapshot íntegro de todas las columnas y auditoría; dos conexiones usando la misma
versión con evidencia de espera real del segundo `FOR UPDATE`; no-op con fechas
y blank/null; sincronización válida y vaciado de fechas; rollback ante fallo de la
segunda auditoría; permisos/validaciones; invalidación por embarazo nuevo; no-op
de sincronización sin cambiar metadata.

Las seis pruebas DOM verifican: carga y envío del entero; guardar sin editar envía
solo versión; FUR conserva FPP manual; conflicto con foco, borrador y confirmación;
recarga fallida con reintento; otros conflictos mantienen su manejo habitual.

Durante el desarrollo hubo fallos corregidos en fixtures/aserciones nuevos y
restricciones de sandbox para PostgreSQL/Chromium. La ejecución de `npm test` de
frontend con concurrencia predeterminada tuvo un timeout de 5000 ms en una prueba
existente de citas; con `maxWorkers=2` la suite completa pasó. No se relajaron
aserciones, timeouts ni pruebas existentes de citas. El aviso de Browserslist sobre
su catálogo de navegadores desactualizado es no bloqueante; no se actualizaron dependencias.

Logs locales, fuera del commit: `tmp_cpren65_session/`. Capturas finales:
`frontend/tmp_cpren65_browser_ykFBXj/conflict-{1440,768,390}.png` y variantes
`conflict-dark-*`. Las fixtures HTML/JSX temporales se retiran al cerrar la
verificación para no contaminar ESLint.

## Riesgos y despliegue posterior — NO ejecutado

1. Revisar diff y autorizar commit/push. Mensaje sugerido:
   `CPREN-65: proteger edición de pacientes con concurrencia optimista`.
2. Programar una tarea separada y autorizada para producción. Antes de intervenir,
   verificar la versión desplegada, migraciones pendientes y backup vigente según
   el procedimiento operativo. Revisar todas las pendientes, no solo 022.
3. Coordinar backend y frontend. Después de distribuir los archivos revisados y
   antes de iniciar el backend nuevo, ejecutar desde `backend` el flujo oficial
   `npm run db:migrate` exclusivamente bajo esa autorización posterior. No aplicar
   SQL manual ni usar `schema.sql` como sustituto del migrador.
4. 022 necesita un bloqueo DDL breve; `lock_timeout = '5s'` aborta el archivo si
   no puede adquirirlo. Si falla, revisar la causa y reprogramar; no quitar el límite
   ni alterar el registro/checksum de migraciones para forzar el inicio.
5. Comprobar registro/checksum de 022 y columna INTEGER/NOT NULL/default 1. Iniciar
   las versiones coordinadas mediante el procedimiento habitual y verificar salud.
6. Pedir recargar las pestañas/formularios abiertos: el frontend antiguo no envía
   versión y el nuevo backend lo rechaza con 400. Probar dos sesiones autorizadas:
   primero guarda; segundo recibe conflicto; verificar recarga y auditoría.

No hay merge automático ni recuperación del borrador después de cerrar/reload
del navegador. El borrador solo se reemplaza mediante confirmación explícita.
Futuros escritores de campos de `pacientes` deben conservar el incremento de
versión; esta fase no versiona por separado los demás formularios clínicos.
No se verificó un despliegue en producción: queda fuera del alcance de esta sesión.

Estado recomendado de Jira: `En revisión`, asociado a `CPREN-3`, pendiente de revisión
y autorización de commit. Producción será otra tarea.
