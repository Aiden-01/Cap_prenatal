# Auditoría de normalización del modelo relacional — CPREN-42

Fecha: 30 de septiembre de 2026. Equipo: `Trabajo`, dispositivo `Aiden29`.
Rama y versión evaluada: `main`, HEAD `3cddde1643e2313e9821ddd40819208570bdc9c3`.
Gestión: [CPREN-42](https://tareajiraads.atlassian.net/browse/CPREN-42), Epic CPREN-4.
Estado de entrega: auditoría técnica aprobada por el usuario; cierre documental autorizado, sin aprobación de cambios de esquema.

## 1. Alcance y resultado principal

Se auditaron **19 tablas: 18 funcionales/técnicas y el registro `schema_migrations`**. Se revisaron por completo `schema.sql`, las 16 migraciones versionadas (004–019), `migrate.js` y `seed.js`, y se contrastaron las rutas de escritura/lectura relevantes. Las tres vistas BI de 005 son proyecciones, no tablas adicionales. Los índices se consideran mecanismos de integridad/acceso, no entidades.

El modelo separa pacientes, episodios de embarazo, eventos clínicos, catálogos, seguridad y operaciones. Gran parte de sus relaciones es compatible con 3FN respecto de las dependencias identificadas. **No es defendible afirmar 3FN estricta de todo el sistema ni que todas sus redundancias estén completamente controladas**: existen snapshots deliberados y derivados, pero también una brecha estructural de integridad paciente–embarazo y divergencias alcanzables por lógica de aplicación.

Se identifica un riesgo **ALTO** por la brecha estructural de integridad paciente–embarazo si una escritura evita los controles del backend. Las rutas backend revisadas sí validan pertenencia; no se comprobó ninguna fila real discordante y el hallazgo no debe interpretarse como corrupción confirmada de producción. Hay riesgos **MEDIOS** de fechas, clasificación de riesgo y reportes inconsistentes. La auditoría no requiere implementar correcciones para completarse; esas correcciones deberán revisarse y autorizarse después.

Solo se crea y versiona este documento. No se modifican schema, migraciones, constraints, repositories, runtime ni reglas clínicas. No se ejecutan SQL, migraciones, seeds, conexión a PostgreSQL real, SSH, AWS, n8n o despliegues. El cierre documental incluye commit y push autorizados por el usuario.

## 2. Metodología y límites de evidencia

- **G — Garantía del esquema:** PK, UNIQUE o índice único con su predicado, FK, CHECK y GENERATED. Una FK independiente demuestra existencia, no correspondencia entre dos FKs.
- **A — Regla de aplicación:** validaciones, campos permitidos, SQL condicionado, transacciones y bloqueos en las rutas revisadas. No equivale a una garantía para cualquier escritor SQL.
- **S — Supuesto semántico/clínico:** relaciones plausibles sin constraint o regla suficiente. No se presentan como dependencias funcionales probadas.
- **D — Derivado:** fórmula o agregado observado. Se distingue valor calculado al consultar, valor persistido y valor generado por PostgreSQL.

Una dependencia `X → Y` exige que todo valor de X determine un solo Y en la relación evaluada. La PK determina la fila; no se infieren identidades a partir de nombres, teléfonos, fechas o de un CUI ausente. No se infiere que distrito determine establecimiento ni que una comunidad textual determine territorio/sector.

La 2FN se evalúa respecto de **todas las claves candidatas**, no solo de la PK surrogate. Las PK de estas 19 tablas son simples; por ello no hay dependencia parcial respecto de la PK. También se examinan UNIQUE compuestos y ámbitos parciales. Un UNIQUE que admite NULL no es una clave candidata total de la tabla; se indica su ámbito no nulo. Un UNIQUE que contiene la PK, como `(id, embarazo_id)`, es una superclave no mínima.

La 3FN estricta requiere, para cada dependencia no trivial, un determinante superclave o un atributo dependiente primo. La duplicación entre tablas no prueba por sí sola una violación de 3FN dentro de una relación. En particular, cuando `embarazo_id` es único y no nulo en plan/riesgo, determina la fila: conservar `paciente_id` no genera por sí mismo una dependencia desde un atributo no clave. Subsiste, sin embargo, la obligación de que corresponda al paciente del embarazo.

La matriz usa `Sí` para ausencia de una anomalía demostrada dentro del alcance, `Sí con excepción controlada` para desnormalización o estructura documental con mecanismo identificable, y `Revisar` cuando hay control incompleto o dependencia semántica pendiente. No representa un certificado de la base desplegada.

**No verificable:** estado de migraciones aplicadas, constraints efectivamente validados, triggers añadidos fuera del repositorio, volumen/calidad de datos históricos y comportamiento de producción. No hay evidencia para afirmar resultados históricos de tests o despliegues. No se encontró `CREATE TRIGGER` en schema/migraciones versionados.

## 3. Modelo evaluado y evolución

La lectura debe abarcar el SQL completo: algunas declaraciones iniciales se sustituyen al final. `migrate.js` ordena las migraciones por nombre, registra checksum y usa transacción/bloqueo advisory por migración. En una base nueva aplica schema antes de migraciones; en una existente aplica migraciones y después vuelve a aplicar schema. **No se ejecutó ese proceso.**

| Fuente | Consecuencia para la auditoría |
| --- | --- |
| `schema.sql` | 19 tablas; incorporación/backfill de embarazos, FKs clínicas individuales, índices finales y columna generada de riesgo. |
| 004 / 006 | Catálogo, aliases, `comunidad_id`, metadatos y estado de comunidades. |
| 005 | `vw_censo_mensual`, `vw_cumplimiento_controles_prenatales`, `vw_riesgo_obstetrico`: consultas con fallback de fechas y riesgo persistido. |
| 007 | Sesiones por UUID y hash de refresh único. |
| 008 | Retiro condicionado de `referencias_efectuadas` solo si está vacía; no pertenece al modelo final. Su retiro en una base histórica no es verificable aquí. |
| 009–012 | Catálogo final de vacunas, posiciones longitudinales TD/SR, Tdap por episodio, Influenza como aplicaciones independientes, fecha obligatoria para nuevas escrituras. |
| 013 / 016 | `planes_parto.horas_distancia NUMERIC(4,1)` y `fichas_riesgo_obstetrico.tiempo_horas NUMERIC(4,2)`; precisión distinta deliberadamente versionada, no una nueva entidad. |
| 014 / 017 | Citas persistentes, FKs compuestas, estado inasistente y seguimiento; sin reconstruir citas históricas desde `cita_siguiente`. |
| 015 | Idempotencia de despachos técnicos, sin pacientes, destinatarios ni contenido clínico. |
| 018 / 019 | Índice de lectura del historial y política de concesión/revocación del permiso de auditoría. |
| `seed.js` | Catálogo de roles/permisos y concesiones iniciales; no crea una tabla rol-permiso. Usa una transacción. No se ejecutó. |

En 012, `vacunas_paciente_fecha_clinica_check` puede quedar NOT VALID si hay fechas históricas nulas: protege nuevas escrituras, pero no demuestra saneamiento previo. Al final de schema también se recrean CHECK de pacientes y `embarazos_estado_check` con NOT VALID. Por ello DEFAULT, CHECK y columna opcional no se confunden con NOT NULL ni con validación histórica universal.

## 4. Inventario de claves, FKs y dependencias

En la tabla siguiente, `id → resto de atributos` está garantizado por la PK en todas las filas. Los ámbitos de claves adicionales se especifican expresamente. Las PK implican NOT NULL. Salvo indicación distinta, `id` es SERIAL; auditoría, citas y despachos usan BIGSERIAL, sesiones UUID y migraciones TEXT.

| Tabla | PK y UNIQUE adicionales efectivos | FKs | NOT NULL relevantes y dependencias principales |
| --- | --- | --- | --- |
| `roles` | PK `id`; UNIQUE `nombre` | Ninguna | `nombre`; G: `nombre → id, descripcion`. |
| `usuarios` | PK `id`; UNIQUE `username` | `rol_id → roles.id`; `created_by`, `updated_by → usuarios.id` (SET NULL) | `nombre_completo`, `username`, `password_hash`, `rol_id`; G: `username → fila`, `id → rol_id`. El nombre del rol se obtiene por JOIN, no se almacena aquí. |
| `auth_sessions` | PK UUID `id`; `ux_auth_sessions_refresh_token_hash` | `usuario_id → usuarios.id` (CASCADE) | Usuario, hash actual, created/last_activity/absolute_expires/updated; G: hash actual → sesión. `previous_refresh_token_hash` no tiene UNIQUE. `auth_sessions_absolute_after_created` limita las fechas. |
| `schema_migrations` | PK `filename` | Ninguna | `checksum`, `applied_at`; G: `filename → checksum, applied_at`. Un checksum no identifica necesariamente un archivo. |
| `permisos` | PK `id`; UNIQUE `codigo` | Ninguna | `codigo`, `descripcion`, `categoria`; G: `codigo → fila`. No se supone dependencia categoría → descripción. |
| `usuario_permisos` | PK `id`; UNIQUE `(usuario_id, permiso_id)` | Usuario y permiso (CASCADE); `otorgado_por → usuarios.id` (SET NULL) | Ambos IDs; G: `(usuario_id, permiso_id) → id, otorgado_por, fecha_otorgado`. Los datos de concesión pertenecen al par, no a uno de sus componentes. |
| `pacientes` | PK `id`; UNIQUE `no_expediente`; `ux_pacientes_cui_unico` sobre `cui` no nulo y no vacío | `registrado_por`, `updated_by → usuarios.id`; `comunidad_id → comunidades.id` | Expediente, nombres, apellidos; G: expediente → fila. CUI identifica fila solo dentro del predicado y con comparación exacta; no es clave candidata total. Fechas, edades y la mayoría de flags permiten NULL. |
| `embarazos` | PK `id`; UNIQUE `(paciente_id, numero_embarazo)`; `ux_embarazo_activo_paciente` si estado activo | Paciente (CASCADE); `registrado_por`, `updated_by → usuarios.id` | Paciente, número, estado; G: par → fila; `id → paciente_id, fur, fpp, estado`. Paciente → embarazo activo únicamente en ese subconjunto. No hay unicidad SQL para activo + puerperio conjuntamente. |
| `vacunas_paciente` | PK `id`; TD: `ux_vacunas_td_paciente_posicion` `(paciente_id, numero_dosis)`; SR: `ux_vacunas_spr_sr_paciente_posicion` mismo par; Tdap: `ux_vacunas_tdap_embarazo` `embarazo_id` no nulo, durante/postparto | Paciente y embarazo (CASCADE); autores → usuarios | Paciente, tipo, momento, dosis; fecha exigida por CHECK, no NOT NULL de columna. G: claves anteriores → aplicación en cada subconjunto. Influenza y Tdap previa no tienen esa unicidad; no inventar `(embarazo_id, tipo_vacuna, numero_dosis)` como clave global. |
| `controles_prenatales` | PK `id`; `ux_controles_embarazo_numero` `(embarazo_id, numero_control)`; `ux_controles_id_embarazo` es superclave no mínima | Paciente y embarazo (CASCADE); autores → usuarios | Paciente, número, fecha; G: par → control solo con embarazo no nulo. A: embarazo → paciente dentro de las filas que respetan el backend. D/A: peso y talla se usan para prellenar IMC; no hay fórmula SQL. |
| `morbilidad_embarazo` | PK `id`; sin otra UNIQUE | Paciente y embarazo (CASCADE); autores → usuarios | Paciente, fecha; G: `id → fecha, motivo_consulta, ...`; una fecha no identifica la consulta. A: episodio → paciente en escrituras válidas. |
| `controles_puerperio` | PK `id`; `ux_puerperio_embarazo_numero` `(embarazo_id, numero_atencion)` | Paciente y embarazo (CASCADE); autores → usuarios | Paciente, atención, fecha; CHECK atención 1/2; G: par → atención si embarazo no nulo. No se garantiza por SQL que los datos del parto sean iguales entre las dos atenciones. |
| `planes_parto` | PK `id`; `ux_plan_parto_embarazo_unico` | Paciente y embarazo (CASCADE); autores → usuarios | Paciente, fecha; G: embarazo no nulo → plan completo. El registro documental incluye datos propios editables. Múltiples filas con embarazo NULL son posibles. |
| `fichas_riesgo_obstetrico` | PK `id`; `ux_riesgo_embarazo_unico` | Paciente y embarazo (CASCADE); autores → usuarios | Paciente, fecha; G: embarazo no nulo → ficha completa; G/D: 25 criterios → `tiene_riesgo` mediante GENERATED ALWAYS STORED. Los criterios no son todos NOT NULL. A/D: nacimiento y fecha de ficha → flags de edad en rutas canónicas. |
| `comunidades` | PK `id`; `ux_comunidades_nombre` | `created_by`, `updated_by → usuarios.id` (SET NULL) | Nombre, territorio, sector, lat, lng, activo; G: nombre exacto → fila. Normalizar espacios/mayúsculas es una comprobación de aplicación, no el predicado del índice. |
| `comunidades_aliases` | PK `id`; UNIQUE `(comunidad_id, alias)` | Comunidad (CASCADE) | Comunidad y alias; G: par → id. Alias por sí solo NO determina comunidad. No hay constraint que haga únicos los aliases normalizados entre comunidades. |
| `auditoria_eventos` | PK `id`; sin otra UNIQUE | Usuario, paciente, embarazo con SET NULL | Acción, tabla; G: evento → contexto, payload y tiempos. `tabla/registro_id` y `entidad_afectada/id_entidad` son referencias lógicas polimórficas, no FKs a una entidad universal. |
| `citas_prenatales` | PK `id`; UNIQUE `(id, embarazo_id)` superclave; índices parciales raíz, cumplimiento, reprogramación, seguimiento y una programada por embarazo | Embarazo (CASCADE); origen/cumplimiento → controles y padre/seguimiento → citas mediante FKs compuestas; autores → usuarios | Embarazo, fecha, estado, origen, created/updated. G: origen → embarazo por FK a un control identificado por PK; no determina una única cita en toda la cadena. Los índices parciales solo identifican filas en su ámbito. |
| `automatizacion_despachos` | PK `id`; `automatizacion_despachos_tipo_periodo_key` `(tipo, periodo_desde, periodo_hasta)`; `ux_automatizacion_despachos_token` no nulo | Ninguna | Tipo, ambos límites, estado, total, intento, created/updated; G: triple → despacho e intento vigente. Hash → fila solo si no nulo. Total es el valor del corte reservado, no un agregado vivo. |

Los UNIQUE iniciales `(paciente_id, numero_control)` y `(paciente_id, numero_atencion)` se eliminan explícitamente al final de schema mediante `controles_prenatales_paciente_id_numero_control_key` y `controles_puerperio_paciente_id_numero_atencion_key`. No son claves del modelo final. También se retiran índices legacy de riesgo/vacunas. No existen tablas `usuario_roles` ni `rol_permisos`: un usuario tiene `rol_id` y sus concesiones están en `usuario_permisos`; los defaults por rol están en seed y código.

## 5. Matriz de normalización

| Tabla | 1FN | 2FN | 3FN | Observación | Excepción deliberada |
| --- | --- | --- | --- | --- | --- |
| `roles` | Sí | Sí | Sí | Nombre único; descripción del rol. | Ninguna identificada. |
| `usuarios` | Sí | Sí | Sí | FK al catálogo, sin nombre/descripcion del rol duplicados. | Ninguna identificada. |
| `auth_sessions` | Sí | Sí | Sí | Hash anterior es estado de rotación, no copia del usuario. | Estado técnico de sesión, sin dependencia transitiva demostrada. |
| `schema_migrations` | Sí | Sí | Sí | Registro técnico por filename. | Ninguna identificada. |
| `permisos` | Sí | Sí | Sí | Catálogo por código. | Ninguna identificada. |
| `usuario_permisos` | Sí | Sí | Sí | Clave compuesta alternativa; concesión depende del par. | Ninguna identificada. |
| `pacientes` | Sí | Sí | Revisar | Mezcla demografía, datos legacy del episodio y campos derivados; R2–R6. | Compatibilidad de fechas, edades de registro y comunidad textual, con controles incompletos. |
| `embarazos` | Sí | Sí | Sí con excepción controlada | Los atributos del episodio dependen de su clave; FPP puede ingresarse o calcularse. El espejo en pacientes tiene R2. | FPP persistida para uso operativo; no DF universal FUR → FPP. |
| `vacunas_paciente` | Sí | Sí | Revisar | Ámbitos de UNIQUE distintos; relación paciente/episodio longitudinal controlada por servicio, no por FK compuesta (R1). | Antecedentes y posiciones TD/SR por paciente; Tdap por episodio. |
| `controles_prenatales` | Sí | Revisar | Revisar | En semántica A, embarazo → paciente es dependencia parcial de la clave compuesta; falta garantía G. IMC y cita histórica persistidos. | Mediciones del evento, `cita_siguiente` histórico. |
| `morbilidad_embarazo` | Sí | Sí | Revisar | PK simple; relación redundante A `id → embarazo → paciente` sin enforcement SQL (R1). | Narrativa y profesional del evento. |
| `controles_puerperio` | Sí | Revisar | Revisar | Misma dependencia parcial semántica A que controles; datos de parto en cada atención no son una DF probada. | Evaluación del parto en la atención, sin catálogo de parto separado. |
| `planes_parto` | Sí | Sí | Revisar | Embarazo es clave en ámbito no nulo; snapshot deliberado, pero R1 no queda resuelto por esa unicidad. | Datos documentales prellenados y editables por episodio. |
| `fichas_riesgo_obstetrico` | Sí | Sí | Revisar | Clave de episodio no nula; generado controlado, snapshots y flags de edad con R1/R3. | Datos de evaluación y `tiene_riesgo` GENERATED. |
| `comunidades` | Sí | Sí | Sí | Catálogo; no se prueba territorio → sector o nombre geográfico → municipio. | Ninguna identificada. |
| `comunidades_aliases` | Sí | Sí | Sí | Par candidato real; alias no identifica globalmente comunidad. | Ninguna; aliases se modelan en filas independientes. |
| `auditoria_eventos` | Sí con excepción controlada | Sí | Sí con excepción controlada | JSON documental y contexto polimórfico/legacy; no fuente operacional clínica. | Estructura de evento y compatibilidad de nombres/tiempos. |
| `citas_prenatales` | Sí | Sí | Sí con excepción controlada | Origen determina embarazo; se repite para exigir integridad de controles y cadena. | Redundancia protegida por FKs compuestas. |
| `automatizacion_despachos` | Sí | Sí | Sí con excepción controlada | Triple candidato sin dependencia parcial demostrada. | Total persistido del corte; no lista ni copia clínica. |

`Revisar` en 2FN de controles/puerperio identifica una dependencia parcial **del modelo semántico pretendido**, no una DF que las FKs individuales impongan a cualquier estado SQL. En un estado corrupto, un mismo embarazo podría coexistir con distintos pacientes en los hijos. La distinción es parte del hallazgo, no una razón para declarar esa relación completamente normalizada.

### 5.1 Atomicidad y grupos repetidos (1FN)

Catálogos, seguridad, sesiones, migraciones, embarazos, citas y despachos contienen valores escalares. Las seis tablas clínicas separan aplicaciones/controles/atenciones/consultas en filas; no almacenan N controles dentro de la fila paciente. Plan y riesgo tienen campos escalares del formulario.

No se encontraron columnas ARRAY SQL. Solo `auditoria_eventos.datos_anteriores/datos_nuevos` son JSONB. El código de auditoría conserva campos cambiados, marcadores y metadata sanitizada; no utiliza ese JSON como colección operacional de controles, vacunas o pacientes. En el sentido relacional clásico, su estructura interna no es una relación de atributos atómicos: se registra como excepción documental de 1FN, con valor de evento opaco para el modelo operacional. No se propone convertirla en tablas clínicas.

`otros_lab`, `signos_peligro`, `tratamiento`, `otros_articulos`, descripciones y nombres completos son narrativas/documentos, no una prueba de multivaluación operacional. Si en el futuro se necesitan consultas por medicamento, laboratorio o acompañante individual, habría que redefinir su dominio, no declarar ahora una violación solo por usar TEXT.

Los indicadores por trimestre en pacientes son un conjunto fijo de preguntas identificadas por período. Son escalares bajo ese dominio de formulario, aunque el patrón repetido aconseja revisar su ubicación por episodio a futuro. No hay dependencia garantizada que iguale el flag general con el OR de los tres trimestres. Los 25 criterios de riesgo, distintos tipos de examen y banderas de parto son preguntas diferentes, no un arreglo variable oculto. Se evaluaron como atributos atómicos con esa interpretación.

### 5.2 Claves compuestas y 2FN

Las alternativas compuestas reales no nulas son usuario/permiso, paciente/número de embarazo, comunidad/alias y tipo/período de despacho. No se encontró un atributo no primo que dependa solo de uno de sus componentes. `otorgado_por` y fecha de concesión dependen del par; el estado de un despacho no depende solo de tipo o de un extremo del período.

Controles y puerperio tienen claves compuestas en el subconjunto con embarazo. Su `paciente_id` depende semánticamente de la parte embarazo si se respeta pertenencia. Esto merece revisión aunque la PK surrogate sea simple. Vacunas usa claves parciales por tipo y fase; no hay dependencia parcial demostrada en las posiciones TD/SR, y no se supone que dosis determine fecha, momento o episodio.

Plan y riesgo tienen una alternativa **simple** en el ámbito de embarazo no nulo. Los UNIQUE `(id, embarazo_id)` de controles y citas solo permiten ser objetivos de FKs compuestas; no añaden una candidata mínima. Los índices únicos parciales de citas identifican subconjuntos, no todas las filas.

## 6. Fuentes de verdad y dependencias no triviales (3FN)

### 6.1 Paciente y episodio: FUR/FPP y antecedentes

`embarazos.id → paciente_id, fur, fpp, estado, numero_embarazo` es G. La creación inicial y `nuevoEmbarazo` copian/sincronizan FUR/FPP con pacientes en la misma transacción. Al editar paciente, `actualizarPaciente` sincroniza **solo el embarazo activo**. Los lectores seleccionan un episodio activo, puerperio o histórico; reportes/vistas usan frecuentemente `COALESCE(e.fur, p.fur)` y `COALESCE(e.fpp, p.fpp)`.

La fuente del episodio es embarazo, con fallback legacy en paciente. No hay igualdad SQL entre ambas copias. `actualizarEmbarazoFechas` usa COALESCE para no borrar sus valores con NULL, mientras la escritura de paciente sí puede poner NULL (R2). Cuando no hay episodio activo, editar fechas del paciente no sincroniza el episodio en puerperio. Un fallback aplicado a un episodio histórico sin fecha podría tomar fechas del episodio posterior; por ello compatibilidad no equivale a exactitud histórica demostrada.

FPP es ingresable; si falta, creación calcula FUR + 280 días. La edición también puede calcularla cuando se envía FUR sin FPP. El esquema hace backfill de FPP faltante. **No existe DF G `fur → fpp`**: FPP puede ser ingresada y no hay CHECK de fórmula. Mantener una estimación clínica persistida no prueba por sí solo una violación.

Antecedentes como gestas/partos/abortos están en paciente y en los documentos plan/riesgo, no en `embarazos` como copias de todos esos campos. No se demuestra que gestas sea COUNT de episodios registrados ni que todos los partos históricos estén aquí. `partos` y `partos_vaginales + cesareas` tampoco tienen igualdad garantizada; el censo calcula la suma, pero el servicio acepta `partos` aparte. Se debe definir la semántica antes de imponer una fórmula o trasladar columnas. Los informes de episodios anteriores usan antecedentes actuales del paciente: no constituyen una reproducción inmutable del expediente de aquella fecha.

### 6.2 Existencia de ficha, riesgo y agregado

- `fichas_riesgo_obstetrico.tiene_riesgo` es D/G: OR de los 25 criterios, GENERATED ALWAYS STORED. No se puede asignar directamente por INSERT normal. Con criterios NULL, el OR SQL puede devolver NULL; DEFAULT FALSE no impide NULL. El backend construye booleanos para nuevas fichas.
- `pacientes.tiene_ficha_riesgo` es columna legacy editable, no un generado ni un EXISTS persistido sincronizado. `nuevoEmbarazo` la reinicia; guardar/eliminar riesgo no la actualiza. No es equivalente semántico a `tiene_riesgo` (R4).
- `obtenerCompletitudExpediente` usa EXISTS por episodio y es la evidencia de existencia actual. El listado usa `COALESCE(riesgo_actual.tiene_riesgo, pacientes.tiene_ficha_riesgo, FALSE) AS tiene_riesgo`: un fallback legacy puede mezclar presencia con clasificación.
- `comunidades.total_riesgo_activo` **no es una columna**: es COUNT DISTINCT consultado por `comunidadesRepository`, con episodios activos y riesgo persistido. No hay cache a normalizar ni contador que sincronizar en comunidades.

### 6.3 Edad: snapshot frente a recalculado

Edad clínica depende de `(fecha_nacimiento, fecha_evaluación)`, no únicamente de nacimiento. `riskAgeRules` usa la fecha de la ficha, no la fecha actual ni FUR. `riesgoService` reemplaza flags de edad al escribir; lectura de ficha, expediente y PDF recalculan flags y `tiene_riesgo` con nacimiento actual. Esto evita confiar en flags manipulados, pero **no convierte la evaluación en snapshot inmutable**: corregir nacimiento puede cambiar lo leído sin cambiar los flags almacenados (R3).

`edad_manual`, `edad_calculada` y `rango_edad` de pacientes tienen intención histórica explícita en el comentario del schema; el formulario calcula/prellena esos datos. El backend acepta edad/texto/rango de forma independiente y no tiene una fecha de referencia dedicada por cada edición (R6). Si falta nacimiento, creación lo estima desde edad manual, con día/mes actuales. No se puede tratar esa fecha estimada como nacimiento verificado ni exigir que edad manual sea idéntica a una edad actual calculada.

Los campos de edad y antecedentes de plan/riesgo forman parte de formularios con fecha. La evidencia permite calificarlos como datos documentales del episodio; no demuestra versionado completo ni preservación inmutable de todas las revisiones.

### 6.4 Doble vínculo paciente/embarazo

Controles, vacunas, puerperio, morbilidad, plan y riesgo tienen `paciente_id NOT NULL` y `embarazo_id` nullable, con dos FKs independientes. No hay FK `(embarazo_id, paciente_id)` a embarazos ni trigger versionado para su igualdad. En cinco repositories, INSERT usa una CTE con pertenencia/estado y FOR UPDATE. Vacunas INSERT es directo; **su servicio** bloquea paciente y valida/bloquea episodio antes de insertarlo dentro de la transacción. Las listas de campos del servicio no aceptan reasignación libre de paciente; las vacunas que cambian episodio validan el destino.

Las lecturas no son uniformes: expediente y gran parte de PDF buscan hijos por embarazo; el censo une paciente desde `c.paciente_id`. Una fila corrupta puede mostrarse bajo un embarazo y aportar demografía de otro paciente en un reporte. La función PDF de control individual añade igualdad con el paciente, pero esa defensa no está en todas las consultas (R1).

No es correcto llamar a todos estos pares violaciones de 3FN G: en plan/riesgo embarazo es clave alternativa no nula; en los demás la DF de pertenencia solo es A. Sí es correcto documentar redundancia, su dependencia pretendida y falta de enforcement común.

### 6.5 Citas, comunidad, auditoría y derivados

En citas, `control_origen_id → embarazo_id` es G por la PK del control y la FK compuesta. El origen puede repetirse en la cadena, por lo que no es superclave global de citas: existe una redundancia relevante para 3FN, mantenida para integrar origen, cumplimiento y padre dentro del mismo episodio. Las FKs `citas_prenatales_control_origen_embarazo_fkey`, `citas_prenatales_control_cumplimiento_embarazo_fkey`, `citas_prenatales_reprogramada_desde_embarazo_fkey` y `citas_prenatales_seguimiento_embarazo_fkey` la controlan. `embarazo_id` tampoco es clave global: el índice solo hace única la cita programada. Los CHECK no impiden por sí solos todos los ciclos largos, pero las operaciones revisadas crean hijas y no aceptan reescritura libre de la cadena. No se demuestra un defecto de ciclos alcanzable por API.

`controles_prenatales.cita_siguiente` conserva la fecha documentada por el control. La agenda vigente procede de `citas_prenatales`. Reprogramar una cita puede separar ambas fechas correctamente. `numero_control` presentado por `listarPorEmbarazo` se recalcula con ROW_NUMBER por fecha/id; el número almacenado sirve a unicidad/upsert. Son semánticas distintas, no una nueva columna duplicada.

`pacientes.comunidad_id` enlaza el catálogo y `comunidad` mantiene texto legacy. La normalización de escritura copia el nombre seleccionado cuando municipio es El Chal; otros municipios usan texto. El catálogo y los aliases se consultan para ubicación/reportes. Renombrar la comunidad no actualiza el texto de pacientes (R5). El territorio/sector textual de paciente no está sujeto a igualdad con catálogo; no se infiere una DF sin semántica acordada.

Auditoría guarda referencias y payloads del evento; `entidad_afectada/tabla`, `id_entidad/registro_id` y `fecha_hora/created_at` conservan compatibilidad. Su productor normaliza el contexto, pero no hay CHECK de igualdad de los pares, ni todas las entidades lógicas son tablas físicas (`documentos`, `reportes`, `automatizaciones`). No se usa como fuente de verdad de un dato clínico. Las FKs SET NULL permiten conservar el evento si desaparece una entidad; no se propone CASCADE ni una FK universal.

IMC en control es persistido y prellenado desde peso/talla en `NuevoControl.jsx`; validación backend limita rangos sin verificar la fórmula. Edad gestacional del control es un valor del evento y puede ser ingresado por API. No hay DF SQL entre estos valores y FUR/peso/talla; una igualdad estricta requeriría definir redondeo, origen de la estimación y política de corrección.

## 7. Excepciones deliberadas y controles reales

Clasificación: **A** operacional, **B** documental/histórico, **C** derivado o cache, **D** redundancia con peligro potencial. La columna de riesgo residual impide presentar un control parcial como garantía absoluta. No se atribuye rendimiento a un dato duplicado sin evidencia; un índice de búsqueda por sí solo no prueba ese motivo.

| Dato / tipo | Motivo respaldado | Fuente de verdad | Mecanismo de consistencia | Beneficio | Riesgo residual |
| --- | --- | --- | --- | --- | --- |
| Fechas en paciente y embarazo (A/D) | Transición legacy, backfill SQL y sincronización explícita. | Episodio seleccionado; paciente como fallback. | Creación/sincronización transaccional. | Compatibilidad y separación de episodios. | MEDIO R2; no igualdad SQL ni política uniforme de NULL/puerperio. |
| `paciente_id` con `embarazo_id` clínicos (A/D) | Coexistencia modelo por paciente/episodio; vacunas longitudinales y rutas por ambos contextos. | `embarazos.paciente_id` para pertenencia del episodio. | Servicio valida pertenencia; CTEs/bloqueos/transacciones; watchdog detecta mismatch. | Contexto de paciente y antecedentes con embarazo opcional. | ALTO R1 ante escrituras fuera del servicio; no completamente controlada por BD. |
| Plan y ficha: contacto, demografía, FUR/FPP, antecedentes (B) | Formularios independientes con fecha; prellenado y guardado editable, no JOIN único dinámico. | Registro documental para contenido del formulario; paciente/embarazo para operación actual. | Un registro por embarazo no nulo; validación y estado de solo lectura del episodio cerrado en las rutas clínicas. | Conservar lo documentado por episodio. | BAJO para diferencias deliberadas; R1 aparte. No hay historial completo de versiones ni sincronización continua pretendida. |
| `tiene_riesgo` (C) | Clasificación automática explícita en schema. | 25 criterios persistidos de la ficha. | GENERATED ALWAYS STORED. | Lectura/filtrado uniforme del riesgo persistido. | NO RIESGO de escritura independiente del generado; NULL legacy y R3 para edad corregida siguen pendientes. |
| Flags de edad de riesgo (C/B) | Cálculo a fecha de evaluación, con backend canónico. | Nacimiento actual + fecha de ficha. | Derivación al guardar y leer/PDF. | Evita flags contradictorios enviados por cliente. | MEDIO R3: lecturas SQL no recalculan tras corregir nacimiento. No snapshot inmutable. |
| Edad/texto/rango en paciente (B/C) | Comentario histórico y cálculo del formulario. | Nacimiento o edad manual declarada; falta referencia de edición explícita. | Prellenado frontend, fallback de edad en creación, validación de dominio. | Registro con edad declarada y presentación del formulario. | MEDIO R6; el control no garantiza coherencia entre campos. |
| `comunidad` + FK (A/B) | Texto legacy y otros municipios; fallback de aliases. | Catálogo si hay FK; texto si no hay FK. | `normalizarComunidadPaciente` copia nombre y valida comunidad activa al escribir. | Conserva cobertura sin catálogo y compatibilidad. | MEDIO R5 tras renombrar catálogo; diferencias de vistas. |
| Embarazo en citas (A) | Integridad explícita de origen, cumplimiento y derivación. | Embarazo del control origen. | Cuatro FKs compuestas, CHECK y UNIQUE parciales. | Previene mezclar controles/cadenas de distintos episodios. | NO RIESGO para correspondencia origen/cumplimiento/cadena; no corrige un control que ya contenga paciente discordante (R1). |
| `cita_siguiente` del control (B) | Schema/migración 014 y flujo de agenda persistente. | Control para historia; cita para agenda actual. | Creación atómica; cambio formal/reprogramación en servicios. | Mantiene historia sin reconstruir agenda antigua. | BAJO: fechas distintas tras reprogramar son esperadas. |
| Narrativa/profesional/mediciones por atención (B/C) | Campos del formulario clínico/PDF y prellenado de IMC. | Dato registrado en la atención. | Registro por evento, validación de rangos y escritura transaccional. | Documenta hallazgos y contexto de atención. | R7: fórmula de IMC no verificada; no exige igualar observaciones de distintas fechas. |
| JSON y pares legacy de auditoría (B) | Productor de eventos, sanitización y backfill. | Evento registrado, no tabla clínica actual. | Normalización del productor, payload privado y SET NULL. | Contexto heterogéneo e historial compatible. | BAJO de duplicación nominal; igualdad no impuesta por SQL. Presencia de payloads históricos sensibles no verificable. |
| `total_registros` del despacho (B/C) | Corte de operación reservado/enviado, no detalle clínico. | Resultado reservado para ese tipo/período/intento. | Triple único, CHECK y transiciones condicionadas del repository. | Idempotencia y trazabilidad del envío. | NO RIESGO por diferir del conteo vivo posterior; no pretende mantenerse igual. |

`tiene_ficha_riesgo` se excluye de las excepciones **justificadas como consistentes**: su presencia es legacy, pero R4 muestra que no se mantiene como cache de existencia. Tampoco se afirma que los flags generales/trimestrales, antecedentes parecidos o nombres de establecimiento sean copias necesariamente equivalentes.

## 8. Riesgos y ejemplos concretos

Los identificadores, fechas y estados siguientes son ejemplos sintéticos, no datos de pacientes. Se derivan del código y constraints; no se ejecutó SQL ni se comprobó prevalencia en una base real. `Error` significa defecto concreto de coherencia identificado en código; `Brecha` indica falta de enforcement; `Revisión` indica una decisión semántica incompleta, no un bug probado.

### R1 — ALTO — Brecha estructural de integridad paciente–embarazo en seis tablas

- **Columnas:** `paciente_id`, `embarazo_id` en controles, vacunas, puerperio, morbilidad, plan y riesgo; destino `embarazos.paciente_id`.
- **Ejemplo:** pacientes sintéticas 10 y 20 existen; embarazo 90 pertenece a 20. Un escritor SQL inserta un control con paciente 10, embarazo 90, número 1 y fecha válida. Ambas FKs individuales se satisfacen y no hay CHECK/FK compuesta que compare pacientes. Lo mismo puede ocurrir con las otras cinco tablas respetando sus campos mínimos y UNIQUE.
- **Consecuencia:** expediente/PDF consultado por embarazo 90 puede incluir ese hijo, mientras el censo usa `c.paciente_id=10`. Incluso los borrados CASCADE por paciente/episodio actuarían desde vínculos discordantes.
- **Qué evita hoy:** pertenencia y FOR UPDATE en servicios/repositories; campos permitidos; transacción. Vacunas tiene INSERT directo protegido en el servicio. `obtenerResumenCalidadDatos` ya cuenta `pregnancy_patient_mismatch` para las seis tablas: detección, no prevención. No se ejecutó ese watchdog.
- **Posibilidad estructural y evidencia:** PostgreSQL permite construir el estado discordante con las FKs actuales, según el esquema versionado. Las rutas backend revisadas sí validan pertenencia y mitigan R1; no se demuestra creación del mismatch desde esas rutas. No se comprobó ninguna fila real discordante, por lo que el hallazgo no debe interpretarse como corrupción confirmada de producción. Se conserva la severidad ALTA de la brecha estructural de integridad paciente–embarazo.
- **Tests:** controles/pacientes verifican pertenencia, vacunas y otros módulos verifican episodio incorrecto/cerrado; mocks y pruebas estáticas no prueban una FK inexistente. No se encontraron garantías versionadas de rechazo SQL de este par.
- **Recomendación necesaria:** evaluar posteriormente FK compuesta al par de embarazos o una solución equivalente; primero inventario de NULL y mismatch, política legacy/antecedentes, backup y autorización. No simplemente retirar `paciente_id`, porque hay historia longitudinal y embarazo opcional. No se crea ticket nuevo en esta auditoría.

### R2 — MEDIO — Error de sincronización de fechas; alcance legacy incompleto

- **Columnas:** `pacientes.fur/fpp` y `embarazos.fur/fpp`.
- **Ejemplo alcanzable:** paciente y embarazo activo tienen FUR/FPP; se envía FUR vacía a la actualización. `optionalDate` permite vacío como undefined; `buildPacienteUpdateData` conserva esa propiedad. El repository asigna su parámetro directamente y el driver `pg` prepara undefined como SQL NULL, por lo que la escritura de paciente la borra. `actualizarEmbarazoFechas` ejecuta `fur=COALESCE($2,fur)` y mantiene la fecha previa del embarazo. La transacción confirma ambas operaciones: atomicidad no implica igualdad. Análogo para FPP explícitamente vacía.
- **Otro límite:** solo se sincroniza activo, aunque un episodio en puerperio sigue siendo seleccionable. Fallback de paciente en un episodio histórico sin fechas puede reutilizar fechas de un embarazo posterior.
- **Qué evita hoy:** transacción y sincronización de valores no nulos. No hay constraint de igualdad y COALESCE impide propagar el borrado.
- **Tests:** `pacientesEmbarazos.test.js` cubre sincronización transaccional y rollback de auditoría; no se identificó una regresión de vaciado de estas fechas con igualdad entre copias.
- **Recomendación necesaria:** acordar significado de borrar fechas y episodio editable, tratar NULL coherentemente y limitar fallback histórico. Una corrección futura necesita pruebas de vacío/NULL, puerperio y dos episodios con fecha histórica faltante.

### R3 — MEDIO — Error de divergencia entre riesgo persistido y recalculado

- **Columnas:** nacimiento del paciente, fecha y flags de edad de ficha, generado `tiene_riesgo`.
- **Ejemplo alcanzable:** ficha evaluada en 2026-09-17 con nacimiento 2007-09-17 y sin otros factores: menor de 20 verdadero. Se corrige nacimiento a 2006-09-17 mediante edición de paciente. Esa ruta no actualiza la ficha. SQL conserva flag y generado verdaderos; `applyAgeRiskFactors` en ficha/expediente/PDF devuelve menor de 20 falso y riesgo falso. El listado, mapa, BI y reportes consumen `r.tiene_riesgo` almacenado.
- **Qué evita hoy:** guardar/editar la propia ficha recalcula flags; lectura/PDF usa cálculo canónico. No hay trigger ni sincronización de ficha al corregir nacimiento. Un GENERATED basado en flags no detecta cambios en otra tabla.
- **Tests:** `riskAgeRules.test.js` cubre límite de edad y sobrescritura; `riesgoVacunas.test.js` cubre payload manipulado, fechas y contexto; no se identificó una regresión transversal de edición de nacimiento → SQL/listado/mapa/PDF.
- **Recomendación necesaria:** decidir una fuente común para todas las lecturas y política de corrección histórica. Alternativas: recalcular persistido transaccionalmente al corregir nacimiento, o derivar en todas las consultas; snapshot explícito exigiría guardar/proteger contexto de evaluación y no recalcularlo silenciosamente. No escoger una migración sin revisar esas consecuencias.

### R4 — MEDIO — Error semántico del fallback de ficha como riesgo

- **Columnas:** `pacientes.tiene_ficha_riesgo`, `fichas_riesgo_obstetrico.tiene_riesgo` y alias `tiene_riesgo` del listado.
- **Ejemplo:** paciente conserva flag legacy TRUE, se elimina su ficha por la ruta de riesgo; el servicio no cambia el flag. El listado vuelve al TRUE del paciente, mientras completitud devuelve EXISTS falso y mapa no tiene fila de riesgo. También un paciente creado/actualizado con el flag TRUE sin ficha produce esa diferencia; el builder acepta el campo.
- **Qué evita hoy:** si existe una ficha con riesgo FALSE no nulo, COALESCE prioriza FALSE; completitud usa EXISTS. No hay sincronización universal ni equivalencia presencia/riesgo.
- **Tests:** riesgo cubre eliminación privada y transaccional; no se identificó prueba que alinee listado/completitud tras ella.
- **Recomendación necesaria:** separar presencia de ficha de clasificación clínica en contratos de lectura; elegir EXISTS/criterios como fuente adecuada y revisar consumidores legacy antes de deprecar el flag. No eliminarlo aquí.

### R5 — MEDIO — Divergencia de nombre de comunidad

- **Columnas:** `pacientes.comunidad_id/comunidad`, `comunidades.nombre`.
- **Ejemplo alcanzable:** paciente guarda FK a comunidad A y texto A; administración renombra catálogo a B. `actualizarComunidad` no reescribe pacientes. El listado expone texto A; reportes/automatizaciones usan `COALESCE(com.nombre,p.comunidad)` y muestran B.
- **Qué evita hoy:** normalización al escribir paciente y FK para ubicar catálogo. No hay trigger/cascada para nombre textual.
- **Tests:** mapa y comunidades tienen coberturas de fallback/conteo; no se identificó garantía de igualdad textual tras renombrado.
- **Recomendación necesaria:** definir si texto es histórico o copia actual; para presentación operacional con FK preferir una fuente común. Si se desea snapshot, nombrarlo/mostrarlo como tal. El renombrado no implica ubicación de otro paciente, por eso no se clasifica ALTO.

### R6 — MEDIO — Revisión de edad/rango como datos históricos

- **Columnas:** `fecha_nacimiento`, `edad_manual`, `edad_calculada`, `rango_edad`.
- **Ejemplo admitido:** nacimiento y rango de edad incompatible pueden enviarse juntos; schemas validan dominios por campo y el servicio conserva rango/texto recibido. Editar nacimiento aisladamente tampoco recalcula los otros campos.
- **Qué evita hoy:** formulario prellena; backend calcula edad manual en creación si no se suministra. Sin fecha de referencia propia ni igualdad de campos en backend, no se puede distinguir con certeza un snapshot legítimo de uno accidentalmente incoherente.
- **Recomendación necesaria:** acordar fecha/origen de edad y política de corrección; probar y documentar coherencia en el backend. No reinterpretar edad histórica como edad actual ni fabricar exactitud de una fecha estimada.

### R7 — MEDIO potencial — Revisión del IMC ingresable

- **Columnas:** `peso_kg`, `talla_cm`, `imc` del control.
- **Ejemplo admitido por rango:** 60 kg, 160 cm, IMC 30; fórmula del prellenado daría aproximadamente 23.4. El servicio permite los tres valores, y el schema no vincula su fórmula.
- **Qué evita hoy:** UI prellena y validaciones limitan rangos. No se demuestra que todas las vías usen el prellenado ni que IMC deba ser siempre el cálculo exacto frente a una medición/importación documentada.
- **Recomendación opcional:** confirmar semántica clínica, precisión y necesidad operativa antes de convertirlo en derivado canónico; añadir una prueba de discrepancia si se adopta esa regla. Se registra como revisión, no como Error clínico probado.

### Otros límites que no son errores demostrados

Snapshots de plan/riesgo pueden diferir del paciente actual por diseño; no se sincronizan continuamente. La misma observación aplica a datos de parto por atención y profesional registrado, que no equivalen necesariamente al usuario creador. La ausencia de claves naturales de morbilidad o Influenza no es un defecto: se admiten múltiples eventos. Los aliases no son globalmente únicos; el matching textual histórico puede ser ambiguo y requiere revisión de catálogo/datos antes de afirmar una asignación incorrecta. El watchdog también detecta embarazos abiertos concurrentes y vínculos ausentes; su presencia no prueba que esas anomalías existan en producción.

## 9. Recomendaciones y decisión de alcance

**Necesarias para sostener coherencia operacional (en trabajo posterior):**

1. Priorizar R1: diseñar enforcement del vínculo paciente/episodio para las seis tablas, conservando casos legacy y vacunas previas; complementar los tests de pertenencia HTTP con pruebas SQL en una base aislada sintética cuando se autorice.
2. Resolver R2 con política de NULL, selección de episodio y fallback histórico explícita.
3. Resolver R3 con criterio común entre dato persistido y lecturas canónicas después de corregir nacimiento; considerar rendimiento, transacciones e historia antes de elegir fórmula en consulta o sincronización.
4. Resolver R4 distinguiendo existencia de ficha de riesgo efectivo; revisar compatibilidad de clientes.
5. Resolver R5 con definición de texto histórico frente a nombre actual y fuente uniforme en presentación.
6. Definir contexto temporal/origen de edad de paciente (R6). Mantener limitación de evidencia histórica hasta validar datos.

**Opcionales, condicionadas a beneficio probado:**

- Revisar IMC (R7) y otros derivados según política clínica; no introducir fórmulas/constraints solo para mejorar una clasificación académica.
- Evaluar un modelo por episodio para hábitos por trimestre y antecedentes del formulario, únicamente si se necesita historia completa de embarazos y la semántica lo justifica.
- Evaluar versiones documentales de plan/riesgo si se requiere reproducir exactamente cada revisión. El modelo actual conserva un registro editable por episodio; la auditoría privada no guarda snapshots clínicos completos.
- Homogeneizar nombres legacy de auditoría al retirar consumidores, sin alterar retención ni payload privado; no normalizar JSON documental como detalle clínico.
- Revisar aliases ambiguos y normalización de nombres en catálogo antes de restringir unicidad global; no asumir que dos comunidades no puedan compartir un alias.

Decisión de CPREN-42: **documentar y conservar el modelo durante la auditoría**. Cambiar esquema ahora no permitiría distinguir evaluación de implementación y requeriría decisiones sobre historia, NULL, referencias y datos existentes. La alternativa de retirar toda duplicación perdería contexto documental/legacy sin beneficio demostrado. La alternativa de afirmar que toda duplicación está controlada contradice R1–R6. Se elige explicitar las excepciones y controles parciales; las recomendaciones no se implementan ni se crean tickets nuevos sin revisión posterior del usuario.

## 10. Evidencia reproducible y validación realizada

Referencias a fuentes versionadas (rutas relativas a este documento; buscar el símbolo indicado para localizar la lógica):

- [schema.sql](../backend/src/db/schema.sql): CREATE TABLE, GENERATED, índices únicos finales y ALTER/DML legacy.
- [migrations](../backend/src/db/migrations/), [migrate.js](../backend/src/db/migrate.js), [seed.js](../backend/src/db/seed.js): evolución y orden descritos en sección 3.
- [pacientesService](../backend/src/services/pacientesService.js): `buildPacienteInsertData`, `buildPacienteUpdateData`, `actualizarPaciente`, `nuevoEmbarazo`, `normalizarComunidadPaciente`, `expedienteCompleto`.
- [pacientesRepository](../backend/src/repositories/pacientesRepository.js): `listar`, `sincronizarPacienteConEmbarazo`, `actualizarEmbarazoFechas`, `obtenerCompletitudExpediente`.
- [embarazos](../backend/src/utils/embarazos.js): `obtenerEmbarazoDePaciente`, `validarEmbarazoEditable` y selección de lectura.
- [controlesRepository](../backend/src/repositories/controlesPrenatalesRepository.js), [puerperioRepository](../backend/src/repositories/puerperioRepository.js), [morbilidadRepository](../backend/src/repositories/morbilidadRepository.js), [planRepository](../backend/src/repositories/planPartoRepository.js), [riesgoRepository](../backend/src/repositories/riesgoRepository.js): CTE de pertenencia, FOR UPDATE, campos y transacciones.
- [vacunasRepository](../backend/src/repositories/vacunasRepository.js), [vacunasService](../backend/src/services/vacunasService.js): INSERT directo, `lockAndLoadClinicalContext`, validación de destino e historia longitudinal.
- [riskAgeRules](../backend/src/domain/riskAgeRules.js), [riesgoService](../backend/src/services/riesgoService.js), [pdfService](../backend/src/services/pdfService.js): `deriveAgeRiskFactors`, `applyAgeRiskFactors`, `canonicalAgeFactors`, `canonicalRiskForPdf`.
- [reportesRepository](../backend/src/repositories/reportesRepository.js), [pdfRepository](../backend/src/repositories/pdfRepository.js): fuentes de fechas, riesgo y joins de paciente/episodio.
- [comunidadesRepository](../backend/src/repositories/comunidadesRepository.js), [comunidadesService](../backend/src/services/comunidadesService.js): aggregate `total_riesgo_activo`, fallback de aliases, renombrado.
- [automatizacionesRepository](../backend/src/repositories/automatizacionesRepository.js): `obtenerResumenCalidadDatos`, lecturas de citas y transiciones de despacho.
- [auditService](../backend/src/services/auditService.js), [auditRepository](../backend/src/repositories/auditRepository.js), [auditFieldPolicy](../backend/src/services/audit/auditFieldPolicy.js): contexto/payload documental y compatibilidad.
- [pacientes.schemas](../backend/src/validations/pacientes.schemas.js), [common.schemas](../backend/src/validations/common.schemas.js), [controles.schemas](../backend/src/validations/controles.schemas.js): dominios opcionales y rangos.
- [PlanPartoForm](../frontend/src/pages/PlanPartoForm.jsx): prellenado y carga del registro propio; [NuevaPaciente](../frontend/src/pages/NuevaPaciente.jsx): edad/rango; [NuevoControl](../frontend/src/pages/NuevoControl.jsx): prellenado de IMC.

Pruebas existentes revisadas como evidencia de contratos: `pacientesEmbarazos`, `controlesPrenatales`, `puerperio`, `morbilidadPlanParto`, `riesgoVacunas`, `riskAgeRules`, `citasPrenatales`. La existencia de una prueba no se informa como ejecución. Los tests de integración PostgreSQL no se ejecutaron.

Ejecución proporcional confirmada, desde `backend`:

```text
node --test test/riskAgeRules.test.js test/citasPrenatales.test.js
24 tests; 24 pass; 0 fail; 0 skipped; exit code 0.
```

Son pruebas puras/estáticas y de repository con dobles: verifican derivación de edad, esquema/migraciones de citas y consultas; no validan una instancia PostgreSQL real ni refutan los riesgos de esta auditoría. No se ejecuta toda la suite porque no cambia runtime.

Además, análisis efímero en Node, sin archivos auxiliares persistentes, contrastó las 19 tablas con las 19 filas de inventario y matriz, verificó 31 referencias locales, 17 nombres SQL citados y ausencia de espacios finales. La primera aserción corrigió un recuento manual inicial de 18; el resultado final es 19. Se comprobó R2 con schema de entrada, servicio y funciones reales de repository, sustituyendo cliente/pool por dobles que prohíben conexión: la escritura de paciente produce NULL tras `pg.prepareValue`, mientras la escritura del episodio usa COALESCE. Se comprobó R3 llamando al derivador con ambos nacimientos sintéticos: cambia el riesgo retornado sin mutar la ficha original. Ambos análisis finalizaron con código 0; no ejecutaron SQL. La comprobación inicial de R2 asumía NULL en JavaScript y se corrigió para examinar la conversión real del driver desde undefined.

Comprobaciones de la entrega inicial: `git diff --check` y comprobación equivalente del documento nuevo frente a un archivo vacío, sin staging. En esa entrega, el documento era untracked y no aparecía en el diff normal; Git contenía únicamente `?? docs/DATABASE_NORMALIZATION_AUDIT.md`, sin cambios tracked ni staged, commit ni push. CPREN-42 se entregó En revisión. La revisión técnica quedó aprobada y el cierre documental con commit/push fue autorizado posteriormente por el usuario; sus identificadores y verificaciones finales se registran en Jira. No se conservan scripts auxiliares.

## 11. Conclusión

El diseño muestra separación relacional y claves que sostienen gran parte de 1FN/2FN/3FN. Los documentos con fecha, auditoría heterogénea y derivados tienen justificaciones concretas. Algunas alternativas compuestas revelan dependencias parciales semánticas y algunos pares de contexto carecen de enforcement SQL; además existen divergencias reales de lógica de sincronización/lectura.

Por tanto, la formulación defendible es **modelo predominantemente normalizado con excepciones documentadas y controles parciales pendientes**, no «todas las tablas cumplen estrictamente 3FN» ni «toda redundancia es intencional y segura». La brecha estructural de integridad paciente–embarazo mantiene severidad ALTA y está mitigada por las rutas backend revisadas; no se comprobó ninguna fila real discordante ni corrupción confirmada de producción. Las conclusiones de CPREN-42 fueron aprobadas por el usuario, sin implementación pendiente dentro de su alcance documental.

## Texto reutilizable para tesis/defensa

> El modelo relacional de CAP Prenatal separa las entidades de pacientes, episodios de embarazo, eventos clínicos, catálogos y seguridad, y presenta una estructura predominantemente compatible con las primeras tres formas normales respecto de las dependencias identificadas. Se conservan datos documentales por episodio, campos derivados y elementos de compatibilidad con el modelo previo. Algunas redundancias cuentan con controles de consistencia en la capa de aplicación, aunque la auditoría identificó oportunidades para reforzar determinadas restricciones directamente en la base de datos. En consecuencia, el modelo se considera predominantemente normalizado, con excepciones documentadas y recomendaciones de mejora orientadas a fortalecer su integridad.
