# CHECKPOINT-11 — Validación técnica completada, pendiente revisión del propietario

Actualización CHECKPOINT-12: 2026-10-25, America/Guatemala. Equipo **Casa**,
dispositivo **HUGUITO**, HP Victus. Repositorio `C:\cap_prenatal`.
Rama `feature/cpren-120-editor-pdf-notas-clinicas`.
HEAD inicial y final `375da7a5b06f40f3fc0c828f39df326d0ea0c1f9`.

[CPREN-120](https://tareajiraads.atlassian.net/browse/CPREN-120) y
[CPREN-126](https://tareajiraads.atlassian.net/browse/CPREN-126) permanecen
**En revisión**. El resultado está listo para revisión visual y funcional del
propietario; **no constituye aprobación clínica ni autorización de publicación**.
No se inició CPREN-121.

## Auditoría del estado recuperado

El checkout empezó limpio y sincronizado; `git pull --ff-only` confirmó
`Already up to date`. El documento anterior describía HEAD `b00ddf3` y una
entrega parcial, pero el commit WIP `375da7a` ya incluía:

- Edición administrativa de nombre completo y username, transacción, auditoría
  obligatoria y revocación de sesiones al cambiar username.
- Correo obligatorio para altas y regularización de legados de CHECKPOINT-10.
- Retiro de Especialidades, migraciones 028/029 y migración 030 para retirar
  clasificación profesional del modelo activo.
- Elegibilidad por códigos MED/AE/EP, editor compartido integrado al expediente
  y PDF con columna fecha/hora, narrativa rayada y pie para firma manuscrita.
- Pruebas de integración de identidad, muestras PDF y capturas de CHECKPOINT-11.

No se reconstruyeron estas funciones. Se contrastaron los archivos reales y se
ejecutaron las verificaciones finales que faltaban en la documentación.

Las evidencias de `cpren120/checkpoint09`, `checkpoint10` y `checkpoint11`, incluido
`checkpoint11/pdf-verification.json`, proceden de la computadora del CAP y se
conservan sin cambios. Sus ejecuciones históricas son **No verificable como
ejecuciones de esta PC**. Toda la evidencia nueva de Casa está separada en
[`cpren120/checkpoint12`](cpren120/checkpoint12/), con resultados, logs, capturas,
PDF, páginas Poppler y manifest de hashes. El antiguo verificador
`verifyNotaClinicaPdf.py` esperaba el diseño anterior y su etiqueta «Página»;
se conserva y se usa el nuevo verificador específico del diseño recuperado.

## Defectos corregidos y decisiones

### Reintento de confirmación con responsable externo

Defecto real reproducido en PostgreSQL temporal: confirmar el mismo profesional
externo dos veces devolvía **409**, aunque la identidad y el cargo no cambiaban.
`seguimientoNotasService.js` seguía comparando `identity.cargo`, campo retirado
del contrato. El primer resultado queda en `tracking-reproduced-error.log`.

Ahora se compara nombre y `cargo_codigo` del snapshot. Para snapshots anteriores
a 030 que no tienen código se compara exclusivamente la clasificación histórica
con MED/AE/EP. Esta lectura de JSON legado no reintroduce la clasificación en
catálogos, formularios, respuestas o escrituras nuevas.

Se eligió compatibilidad en lectura frente a reescribir snapshots o reconfirmar:
el reintento reutiliza la decisión, no cambia fecha/versión/autor y no duplica
confirmaciones. Las identidades distintas siguen produciendo 409. Cubierto por
regresión unitaria actual/legada y por HTTP/SQL real para el contrato nuevo.

### Acciones administrativas a 320 px

La inspección visual detectó que «Desactivar» se partía dentro de las fichas de
usuario. La cuadrícula ahora adapta el número de columnas a un ancho mínimo de
botón y conserva las palabras completas. Chrome verifica que las acciones no se
recorten y que no haya overflow de página en los cinco anchos y ambos temas.

### Correcciones de la verificación

- Vitest falló inicialmente al leer temporales del sandbox. La suite completa se
  repitió fuera del sandbox y pasó; no se atribuye ese fallo al producto.
- `initdb` fue bloqueado en el sandbox. Las integraciones se ejecutaron con
  escalación, siempre contra clústeres recién creados y verificados.
- Puppeteer no tenía descargada la versión de Chrome de su caché. Se utilizó el
  Chrome instalado (`155.0.8059.85`), sin instalar dependencias ni modificar `.env`.
- La primera suite backend quedó bloqueada en la prueba de terminación de un
  proceso sintético; se identificaron y cerraron únicamente sus procesos y se
  repitió completa fuera del sandbox.
- Una ejecución Chrome de seguimiento agotó la espera del formulario. No se
  reprodujo en la repetición final con diagnóstico; no hay evidencia para
  atribuir su causa al producto.
- El harness de perfiles sembraba la identidad inicial en cada navegación y
  redirigió indebidamente la prueba nueva de login. Se retira esa siembra antes
  de probar el inicio de sesión real. Los endpoints y su autenticación se mantienen.
- La aserción nueva de FK admite los SQLSTATE PostgreSQL `23503` y `23001`
  (`RESTRICT`); el rechazo de eliminación está comprobado.
- La geometría de logos admite tolerancia de centésimas de punto por la
  conversión PDF; por ejemplo, 30 pt se extrae como 29.99999875 pt.

## Migración 030 e integridad

`030_cargos_autoria_estable.sql` ya estaba implementada y **no necesitó cambios**.
Las migraciones 023–029 y sus checksums tampoco se modificaron. Se ampliaron las
pruebas de la suite histórica `checkpoint10MigracionesPostgres.test.js`.

| Verificación ejecutada en Casa | Resultado |
| --- | --- |
| Instalación vacía oficial y reejecución del migrador | Aprobadas; compatibilidad y checksums hasta 030 |
| Actualización 027 → 028 → 029 → 030 | Aprobada en clúster desechable |
| Idempotencia del registro y repetición directa del SQL 030 | Aprobadas |
| Ausencia final de Especialidades y clasificación activa | Comprobada |
| Códigos, nombres, estado y permisos preexistentes | Conservados; sin asignaciones automáticas |
| Código clínico duplicado antes de migrar | Migración rechazada y cambios revertidos |
| Código contradictorio con clasificación anterior | Migración rechazada y columna conservada |
| Duplicados normalizados después de 030 | Rechazados por índice único existente |
| Notas/snapshots históricos de 026 y 028 | Conservados; borrador legado editable/finalizable sin reatribuir |
| Confirmaciones CPREN-119 anteriores a 030 | Filas íntegras e inmutables conservadas |
| Nuevos snapshots incompatibles o contrato retirado | Rechazados |
| Integridad referencial de cargo/usuario | Eliminación de cargo referenciado rechazada |

El caso de duplicados simula deliberadamente un catálogo inconsistente únicamente
dentro del clúster sintético; restaura el índice antes del resto de pruebas.
La migración no infiere profesión por nombre, no cambia cargos existentes y no
otorga permisos. **No se aplicó ninguna migración a bases persistentes.**

## Reglas de autoría verificadas

| Código estable | Responsabilidad admitida |
| --- | --- |
| `MED` | Nota de evolución médica |
| `AE` | Nota de enfermería |
| `EP` | Nota de enfermería |

El repositorio normaliza mayúsculas y espacios extremos del código para la
selección; el nombre visible no interviene en la elegibilidad. Renombrar un
cargo sintético conserva su código y autoría. El índice de código impide
duplicados incluso si el cargo está inactivo.

Se verificaron usuarios/cargos activos, autenticado/directorio/externo, digitador
sin atribución clínica, director oculto para otros roles, filtrado y privacidad
del directorio, permisos revocados, falta de permisos y autoría incompatible.
Capturar y finalizar requieren permisos independientes del cargo; seleccionar
otro profesional no transmite sus permisos. El backend revalida estas reglas
en cada operación, con sesión y bloqueos transaccionales.

Los externos declaran nombre y MED/AE/EP; el servidor obtiene la denominación
del cargo. No se crea una cuenta ni se acredita esa identidad. Solo se asignaron
códigos a fixtures sintéticos; no se consultaron ni alteraron cargos reales.

## Edición administrativa y sesiones

La integración de perfiles comprueba, con la API y PostgreSQL reales:

- Nombre y username actualizados por admin/director; usuario no autorizado
  rechazado también al invocar el servicio directamente.
- Cuentas director ocultas y no editables para admin, incluyendo nombre/username.
- Username duplicado rechazado; dos actualizaciones concurrentes dejan un solo
  ganador y respuestas 200/409, sin duplicar cuentas.
- Cambiar solo nombre o enviar el mismo username conserva sesiones; un username
  diferente revoca todas las sesiones de esa cuenta.
- Renombrado propio, rechazo de la sesión anterior y login correcto con el nuevo
  username; el username anterior ya no autentica.
- Auditoría con actor, fecha y valores anterior/nuevo; un fallo obligatorio
  revierte la identidad y la revocación de sesiones dentro de la transacción.
- IDs, relación histórica de la paciente y nota con snapshot íntegro, contraseña,
  rol, permisos y email conservados. Legados sin email admiten renombrado y
  mantienen Correo pendiente.
- Correo obligatorio en altas, normalización, unicidad concurrente, formato y
  privacidad de CHECKPOINT-10 conservados.

Chrome usa los formularios reales para crear una cuenta sintética, editar
nombre/username/email/cargo, comprobar el listado actualizado, volver a iniciar
sesión, verificar la identidad nueva en el frontend y `/auth/me`, cambiar su
propio username, comprobar 401 de la sesión revocada y reautenticarse nuevamente.
No se añadieron endpoints administrativos.

## PDF: validación real en Casa

Se generaron nuevamente cuatro documentos con Chrome:

- Evolución y enfermería: **10 páginas cada uno**, 100 párrafos, continuaciones,
  líneas vacías, tildes/ñ y una palabra extensa sin espacios.
- Evolución y enfermería al límite: **20 000 caracteres sin espacios y con
  acentos, 8 páginas cada uno**.

Todos son carta vertical **612 × 792 pt**. El verificador recupera únicamente
la narrativa por coordenadas y la compara completa por igualdad, quitando solo
espacios de maquetación; no basta con buscar el marcador final. Verifica los
100 inicios de párrafo y sus 100 continuaciones, sin pérdida ni duplicación.

En los documentos principales se comprueba cada página: encabezado CAP El Chal
y DDRISS Petén Área Sur Oriente, ambas imágenes originales con proporción y
posición correctas, márgenes, columna fecha/hora, identidad de paciente y
responsable/cargo, espacio de nombre/firma y numeración `Hoja No. X de Y`.
Las líneas horizontales no atraviesan cajas de glifos. Los casos de 20 000
caracteres también conservan el texto exacto, tamaño, firma, logos, numeración y
ausencia de rayas sobre la narrativa.

Poppler renderizó páginas **1/5/10** de ambas muestras principales y **1/4/8**
de ambos casos límite. Se inspeccionaron visualmente encabezados, columnas,
continuidad, última línea, logos y pie/firma, además de las comprobaciones
automatizadas. No hay texto perdido, duplicado o recortado en las muestras.
No aparece Hospital de San Benito ni se incorporó el teléfono de la fotografía.

Los originales institucionales conservan SHA256:

- Gobierno/MSPAS: `be807ea1e1cbd1109975ed5d04f7a5c9bba0a3d70b36a78ed7c553b962e85425`.
- DDRISS: `a15796e379264a52c8c6eab68743eb28df1b83ede31d559aef910744e5ca5ef8`.

El espacio de firma está vacío y rotulado. «Captura finalizada» es un cierre
administrativo; **no equivale a firma ni validación clínica**. El tratamiento
clínico y la aceptación del formato siguen pendientes del propietario.

## Resultados finales ejecutados en esta computadora

Entorno: Node 24.11.1, npm 11.21.0, PostgreSQL 18.3 y Chrome 155.0.8059.85.

| Suite/comando | Resultado final |
| --- | --- |
| Backend `npm test --prefix backend` | 1415 totales: **1359 aprobadas, 0 fallos, 56 opt-in omitidas** |
| Frontend `npm test --prefix frontend -- --maxWorkers=2` | **191 lógicas + 300 DOM**, 26 archivos DOM, 0 fallos |
| Frontend `npm run lint --prefix frontend` | Aprobado |
| Frontend `npm run build --prefix frontend` | Aprobado |
| Migraciones 027–030/instalación limpia | **7/7**, sin omisiones |
| Catálogo de cargos PostgreSQL | **7/7**, sin omisiones |
| Perfiles/usuarios/correos + Chrome | **16/16**, sin omisiones |
| Autoría clínica PostgreSQL | **15/15**, sin omisiones |
| Notas/seguridad/auditoría/PDF PostgreSQL | **21/21**, sin omisiones |
| Seguimiento CPREN-119/125 + ambos recorridos Chrome | **20/20**, sin omisiones |
| PDF Chrome: dos tipos y casos límite | **2/2**, sin omisiones; cuatro muestras |
| PDF Python/pdfplumber/Pillow/Poppler | Texto exacto, geometría y 12 páginas renderizadas verificados |
| `git diff --check` | Aprobado |

Los conteos de integración incluyen sus tests padres y no deben sumarse a la
suite general como pruebas diferentes. Las 56 omisiones de esta última son
opt-in; las seis integraciones seguras indicadas se ejecutaron aparte sin
omisiones. No se activaron integraciones antiguas con destinos persistentes
configurables. Avisos de Browserslist y tiempos de plugins Vite son informativos.

Reproducción desde `backend`, exclusivamente con clústeres desechables:

```text
node scripts/validateCheckpoint11.cjs migrations
node scripts/validateCheckpoint11.cjs catalogs
node scripts/validateCheckpoint11.cjs profiles
node scripts/validateCheckpoint11.cjs authorship
node scripts/validateCheckpoint11.cjs notes
node scripts/validateCheckpoint11.cjs tracking
node scripts/validateCheckpoint11.cjs pdf
```

El runner está preparado para Casa, usa los binarios locales de PostgreSQL 18
y Chrome, retira las variables de destinos/opt-in heredadas y habilita solo la
suite solicitada. Cada integración crea `initdb`, verifica `SHOW data_directory`,
usa loopback propio y detiene/elimina exclusivamente su clúster en `finally`.
Los getters de configuración reciben valores sintéticos; se bloquea la carga
de `.env`. El verificador PDF se ejecuta desde la raíz con el Python del runtime:
`backend/scripts/verifyCheckpoint11Pdf.py`.

## Evidencia visual

Se recorrieron **1440, 1280, 768, 390 y 320 px**, temas claro y oscuro. Se
revisaron usuarios, alta con correo, perfil nombre/username/email/cargo, catálogo
sin Especialidades/clasificación, edición de cargo y notas integradas/selector.
Las capturas de Casa se encuentran en `cpren120/checkpoint12`; las hojas de
comparación están en `visual-comparisons`. En 768 px la tabla de usuarios admite
desplazamiento interno; no desborda la página. Los diálogos conservan scroll.

El recorrido de notas prueba siete borradores reales recuperados con el mismo
ID y texto, contexto Guatemala aunque Chrome use Asia/Tokyo, paciente sin
embarazo, embarazo activo/cerrado/puerperio, médico/AE/EP, finalización, PDF y
errores 401/403/404/409 sin duplicar documentos. El recorrido CPREN-119/125
comprueba control, cita, confirmación, recuperación y ausencia de altas por navegar.

Evidencias estructuradas: `test-results.json`, `profiles-browser-evidence.json`,
`http-evidence.json`, `pdf-verification.json`, `*-result.json` y
`evidence-manifest.json`. Todas contienen exclusivamente fixtures sintéticos;
no se guardan cookies, tokens ni narrativa real.

## Archivos modificados en esta validación

- `backend/src/services/seguimientoNotasService.js`: reintento externo compatible.
- `frontend/src/components/usuarios/profesionales.css`: acciones móviles legibles.
- `backend/test/checkpoint10MigracionesPostgres.test.js`: integridad 027–030 e historia.
- `backend/test/perfilesProfesionalesPostgres.test.js`: reautenticación, concurrencia,
  legados, bloqueo de `.env` y comprobaciones administrativas adicionales.
- `backend/test/seguimientoNotas.test.js` y `seguimientoNotasPostgres.test.js`:
  regresión externa, historia y directorio de evidencia separado.
- `backend/test/helpers/perfilesBrowser.js`: cinco tamaños/temas, edición de identidad
  y flujo de sesión propia. `seguimientoNotasBrowser.js`: diagnóstico de timeout.
- `backend/test/notaClinicaPdf.test.js`: muestras Casa separadas y límite de 20 000.
- `backend/scripts/validateCheckpoint11.cjs` y `verifyCheckpoint11Pdf.py`:
  ejecución explícita y verificación reproducible.
- Este documento y `docs/cpren120/checkpoint12/`: resultados y evidencias.

## Cierre y pendientes del propietario

**CHECKPOINT-11 queda técnicamente terminado para revisión.** Quedan la revisión
visual/funcional del propietario y la validación clínica del formato/firma.
Antes de una actualización persistente siguen siendo necesarios inventario,
backup, aprobación de migraciones 028–030 y revisión administrativa de códigos
clínicos/correos reales. Nada de ello se ejecutó ni se presume aprobado aquí.

Git conserva cambios locales y archivos nuevos para revisar, sin staging.
HEAD local y origin siguen en `375da7a`; no se crearon commits ni se hizo push.
No se modificaron main, CPREN-119, los otros worktrees, migraciones históricas,
logos, CHECKPOINT-09/10, PDFs oficiales MSPAS ni Todo en uno. Sin despliegue/AWS,
n8n, migraciones persistentes o acceso a datos clínicos reales. El respaldo
definitivo en GitHub requiere una autorización posterior del propietario.
