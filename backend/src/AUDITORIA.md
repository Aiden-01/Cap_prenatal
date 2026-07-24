# Auditoria de eventos

Desde Sprint 4B.3E todos los productores productivos usan el camino privado:

- `registrarEventoPrivado`: obligatorio para autenticacion, usuarios,
  passwords, roles, permisos, sesiones, PDF, exportaciones/reportes,
  automatizaciones, pacientes,
  embarazos, controles prenatales/laboratorios embebidos, riesgo obstetrico,
  vacunas, morbilidad, plan de parto, puerperio y comunidades.
  Requiere
  contexto explicito, construye payload por allowlist, sanea antes del
  repositorio y nunca captura IP, user-agent, headers ni body.
- `registrarEvento`/`utils/auditoria.js`: API central obsoleta conservada solo
  por compatibilidad; no tiene consumidores productivos activos.

Una prueba recorre `backend/src` y falla si un productor reintroduce el camino
legacy, llama `auditRepository` o agrega un `INSERT` fuera del repositorio.

## Saneamiento historico Sprint 4C.2A

El artefacto controlado vive en `scripts/sanitizeAuditHistory.js`, con la
orquestacion transaccional en `services/audit/auditHistoryMigration.js` y la
clasificacion pura en `services/audit/auditHistorySanitizer.js`. No es una
migracion de esquema. A conserva la fila sin `UPDATE`; B reconstruye metadata,
nombres de campos y transiciones permitidas; C usa un marcador minimo; D no
elimina y su conteo debe ser cero.

El dry-run predeterminado abre `REPEATABLE READ READ ONLY`, valida en memoria,
solo expone estadisticas agregadas y hace `ROLLBACK`. El apply requiere
`--backup-confirmed --confirmation SANITIZE_AUDIT_HISTORY_V1`, usa una unica
transaccion `SERIALIZABLE` y advisory lock, y valida de nuevo antes del commit.
Una segunda ejecucion debe producir cero `UPDATE`.

Sprint 4C.2A no ejecuto apply contra bases reales. Los productores activos ya
son privados; los historicos permanecen intactos hasta 4C.2B. No cambiaron
esquema, `schema.sql`, migraciones, ENV, frontend ni contratos HTTP. La futura
transformacion es destructiva y depende de backups verificados para revertirse.
El procedimiento operativo esta en
`../../docs/AUDITORIA_SANEAMIENTO_HISTORICO.md`.

Los eventos informativos siguen siendo best effort. Los cambios de password,
rol, estado del usuario, permisos, eliminacion de usuario y todas las escrituras
de paciente, embarazo, control prenatal, riesgo, vacuna, morbilidad, plan de
parto, puerperio o comunidad migradas usan la misma conexion que
la operacion principal
y `obligatorio: true`; una falla de auditoria provoca rollback. Una solicitud de
permisos o actualizacion de paciente sin delta no escribe un evento.

## Objetivo

La auditoria debe responder:

- Quien hizo la accion.
- Que accion hizo.
- Sobre que modulo o entidad.
- Sobre que paciente y embarazo, si aplica.
- Cuando ocurrio.
- En eventos legados, desde que IP y cliente; el camino privado omite ambos
  deliberadamente por politica.
- Que cambio, sin guardar informacion innecesaria o peligrosa.

## Campos principales

- `usuario_id`: usuario autenticado que ejecuta la accion.
- `accion`: tipo de evento.
- `modulo`: area funcional, por ejemplo `pacientes` o `controles_prenatales`.
- `entidad_afectada`: tabla o entidad de negocio afectada.
- `id_entidad`: identificador del registro afectado.
- `paciente_id`: paciente relacionada, cuando aplica.
- `embarazo_id`: embarazo relacionado, cuando aplica.
- `fecha_hora`: momento del evento.
- `ip` y `user_agent`: siempre `null` en productores migrados; el legado aun
  conserva el comportamiento anterior.
- `datos_anteriores`: siempre `null` en el camino privado.
- `datos_nuevos`: diff o metadata minima con `politica_version: 1`.
- `descripcion`: codigo controlado de `contexto.evento` en el camino privado.

## Acciones permitidas

- `crear`
- `actualizar`
- `eliminar`
- `estado`
- `login`
- `logout`
- `login_fallido`
- `login_usuario_inactivo`
- `consultar`
- `generar_pdf`
- `exportar`

## Eventos que deben auditarse

- Crear paciente.
- Actualizar paciente.
- Crear embarazo inicial o nuevo embarazo.
- Cerrar embarazo o pasarlo a puerperio.
- Crear, actualizar o eliminar controles prenatales.
- Crear, actualizar o eliminar ficha de riesgo.
- Crear o actualizar plan de parto mediante su upsert existente. No existe
  eliminacion HTTP para esta entidad.
- Crear, actualizar o eliminar vacunas y morbilidad.
- Crear, actualizar o eliminar puerperio.
- Login exitoso.
- Login fallido.
- Intento de login con usuario inactivo.
- Logout.
- Generacion exitosa de PDF.
- Exportacion de reportes.
- Consulta autorizada del resumen agregado de proximas citas.

La creacion explicita de un embarazo registra sus eventos con la misma
conexion y transaccion que la insercion. Si esa auditoria obligatoria falla,
se revierte la creacion para no dejar un embarazo sin trazabilidad. La consulta
GET del expediente no registra un evento de creacion ni modifica datos.

## Datos que no deben auditarse

Nunca guardar:

- Contrasenas en claro.
- Hashes de contrasena.
- JWT.
- Tokens CSRF.
- `AUTOMATION_SECRET`, API keys o sus hashes.
- Variables de entorno.
- Credenciales SMTP.

Para documentos y reportes guardar metadata minima:

- tipo de documento,
- tipo de reporte,
- formato,
- `desde` y `hasta` ya validados cuando aplican,
- cantidad de filas exportadas,
- resultado controlado,
- paciente/embarazo si aplica.

Para `automatizaciones/proximas_citas/consultar` guardar unicamente:

- `tipo_automatizacion: proximas_citas`;
- resultado y motivo controlados;
- cantidad agregada;
- `fecha_desde` y `fecha_hasta`;
- `politica_version: 1`.

No guardar lista de pacientes, IDs, IP, user-agent, headers, query completa,
API key, hash, SQL ni respuesta nominal. Este evento es best effort: su fallo
no convierte una consulta valida en error. Los intentos no autenticados no
crean una fila de auditoria.

No copiar snapshots clinicos completos si no son necesarios para trazabilidad.
Las exportaciones del censo de primer control registran `censo_primer_control`,
formato `xlsx` o `pdf`, `desde`, `hasta` y cantidad de filas. No registran
nombres, CUI, query completa, filtros libres, el archivo, binarios ni la tabla
nominal.

## Eventos privados y payload

- Login/logout: resultado, motivo y metodo controlados; el usuario escrito en
  un fallo no se conserva.
- Usuario creado/eliminado: solo `campos_registrados` o
  `campos_eliminados`.
- Usuario actualizado: nombres de campos personales; solo `rol` y `activo`
  conservan transiciones.
- Password: solo `password_cambiado: true`.
- Permisos: solo codigos agregados y retirados, nunca la lista total.
- Sesiones: resultado, motivo, banderas y cantidad revocada; nunca tokens,
  hashes, cookies, IP ni lista completa de IDs.
- Documentos/reportes: tipo, formato, periodo, cantidad e IDs internos en las
  columnas existentes; nunca contenido, HTML, buffer, temporal o fila nominal.
- Automatizaciones: tipo, resultado, motivo, cantidad y rango. IP y user-agent
  permanecen `null`; nunca se conserva la respuesta HTTP ni entrada M2M.
- Paciente creado/eliminado: solo nombres en `campos_registrados` o
  `campos_eliminados`; una actualizacion conserva solo nombres de campos con delta real.
- Embarazo: creacion/actualizacion conserva nombres de campos; solo
  `estado_embarazo` puede guardar los valores `activo`, `puerperio` o `cerrado`.
  `numero_embarazo`, FUR, FPP, observaciones y datos obstetricos no guardan valor.
- Control prenatal: creacion/eliminacion solo conserva nombres de campos y la
  actualizacion solo nombres con delta real. Laboratorios, incluido VIH, nunca
  conservan resultados, numeros, fechas ni valores positivo/negativo. El permiso
  `controles.ver_vih` no altera esta politica de auditoria.
- Riesgo obstetrico: los criterios persistidos se reducen al nombre
  `factores_riesgo`; el resultado generado se reduce a `tiene_riesgo`. No se
  conservan criterios concretos, booleanos, observaciones, antecedentes ni texto.
- Vacunas: creacion/eliminacion conserva nombres y actualizacion solo el delta
  efectivo. Tipo, momento, dosis y fecha nunca conservan valor. Antecedentes de
  otros embarazos y filas legacy son de solo lectura y no generan auditoria de
  modificacion.
- Morbilidad: creacion/eliminacion conserva nombres y actualizacion solo el
  delta real. Motivo, historia, diagnostico/impresion, tratamiento, referencia,
  medicamentos, dosis, observaciones, fechas y texto libre nunca conservan valor.
- Plan de parto: el upsert conserva nombres de campos persistidos y un unico
  evento por operacion. Datos prellenados, lugares, transporte, nombres,
  telefonos, direcciones, FUR, FPP y riesgo nunca conservan valor. Las consultas
  y la apertura del formulario no generan eventos.
- Puerperio: creacion/eliminacion conserva nombres y actualizacion solo el
  delta real. Signos vitales, sangrado, dolor, lactancia, diagnostico,
  tratamiento, observaciones y datos del recien nacido nunca conservan valor.
  Si el upsert cambia el embarazo, un evento separado conserva exclusivamente
  `estado_embarazo: activo -> puerperio`; ambos eventos comparten transaccion.
- Eventos historicos de referencias: el saneador conserva el reconocimiento de
  tabla, entidad y modulo, pero destino, diagnostico, motivo, estado, traslado y
  texto libre no conservan valores.
- Comunidades: conserva ID y nombres de campos; solo la transicion booleana de
  `activo` puede guardar valores bajo el contexto administrativo exacto.

No quedan productores productivos usando el camino legacy. La API central se
conserva por compatibilidad y `auditLegacySweep.test.js` impide nuevos usos,
`INSERT` directos o accesos de productores al repositorio. Los historicos no
fueron saneados. No existen rutas
HTTP actuales para eliminar pacientes, embarazos o planes de parto y no se
agregaron en este sprint.

Sprint 6B-R1 retiro los productores futuros y los mapeos privados exclusivos
del CRUD de referencias. `auditHistorySanitizer` sigue reconociendo
`referencias_efectuadas`, la entidad `referencia` y el modulo historico
`referencias`; no se borran ni modifican eventos existentes. La consulta de
proteccion de usuarios conserva ese nombre dentro de `auditoria_eventos`, pero
ya no consulta la tabla clinica eliminada. Por ello un usuario relacionado con
un evento historico sigue sin poder eliminarse.

La migracion 008 no modifica `auditoria_eventos`. A fecha de Sprint 6B-R1 no se
ha aplicado en PC1 ni PC2.

## Criterio funcional para PDF institucional

El permiso `controles.ver_vih` aplica a interfaz web, endpoints JSON y escrituras del sistema.

Como excepcion funcional, los PDF institucionales MSPAS/CAP conservan los marcadores del formato clinico solicitado, incluyendo resultados de tamizaje VIH cuando el formato los requiere.

Ese dato representa tamizaje o registro inicial del control prenatal, no diagnostico confirmado de VIH. La confirmacion y seguimiento se realizan por otro procedimiento fuera del alcance actual del sistema.

Por este motivo, la generacion del PDF institucional no se bloquea por falta de `controles.ver_vih` ni se eliminan automaticamente sus marcadores VIH del formato.

La impresion requiere `pacientes.ver`, el mismo permiso usado para consultar
pacientes. Cada generacion exitosa conserva solo metadata minima: tipo de
documento, usuario e identificadores internos de paciente, embarazo y registro
cuando correspondan. Nunca se guarda el PDF, su binario, el contenido clinico,
cookies, tokens ni nombres de archivos temporales.

## Criterio funcional para captura VIH en controles

El permiso `controles.crear` permite registrar la captura inicial de VIH al crear un control prenatal nuevo, aunque el usuario no tenga `controles.ver_vih`.

La respuesta JSON para ese usuario debe seguir saneada y no devolver:

- `vih_realizado`
- `vih_resultado`
- `vih_resultado_valor`

El permiso `controles.ver_vih` se reserva para visualizar resultados VIH ya registrados y para editar o corregir campos VIH en controles existentes.

En `PUT` y en `POST` con upsert sobre un control existente, si el usuario no tiene `controles.ver_vih`, los campos VIH recibidos se ignoran sin sobrescribir valores existentes.

## Cuenta inicial de seed

`db/seed.js` no contiene usuarios ni contrasenas predeterminados. Para ejecutarlo
se deben proporcionar explicitamente el nombre, usuario y contrasena de una cuenta
director mediante variables de entorno. Si la cuenta ya existe, el seed conserva
su hash y no modifica silenciosamente sus credenciales.

El esquema actual no tiene un campo para exigir cambio de contrasena en el primer
acceso. Esa capacidad queda pendiente para el sprint de sesiones y politica de
contrasenas; no se agrega una migracion exclusivamente para ello en este sprint.

## Ejemplo privado: crear paciente

```json
{
  "usuario_id": 3,
  "accion": "crear",
  "modulo": "pacientes",
  "entidad_afectada": "paciente",
  "id_entidad": "42",
  "paciente_id": 42,
  "embarazo_id": null,
  "datos_anteriores": null,
  "datos_nuevos": {
    "politica_version": 1,
    "campos_registrados": ["cui", "no_expediente", "nombres"],
    "resultado": "exitoso"
  }
}
```

## Ejemplo privado: crear control prenatal

```json
{
  "usuario_id": 5,
  "accion": "crear",
  "modulo": "controles_prenatales",
  "entidad_afectada": "control_prenatal",
  "id_entidad": "88",
  "paciente_id": 42,
  "embarazo_id": 12,
  "datos_nuevos": {
    "politica_version": 1,
    "campos_registrados": ["fecha", "numero_control", "vih_resultado"],
    "resultado": "exitoso"
  }
}
```
