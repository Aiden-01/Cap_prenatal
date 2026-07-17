# Auditoria de eventos

Desde Sprint 4B.3A la auditoria tiene dos caminos delimitados:

- `registrarEventoPrivado`: obligatorio para autenticacion, usuarios,
  passwords, roles, permisos, sesiones, PDF, exportaciones/reportes, pacientes
  y embarazos. Requiere
  contexto explicito, construye payload por allowlist, sanea antes del
  repositorio y nunca captura IP, user-agent, headers ni body.
- `registrarEvento`/`utils/auditoria.js`: camino legado temporal para controles,
  laboratorios, riesgo, vacunas, morbilidad, plan de parto, puerperio clinico,
  referencias y otros productores clinicos pendientes.

No se debe usar el camino legado en un productor no clinico migrado. Tampoco se
debe afirmar que toda la auditoria clinica esta protegida hasta completar
4B.3.

Los eventos informativos siguen siendo best effort. Los cambios de password,
rol, estado del usuario, permisos, eliminacion de usuario y todas las escrituras
de paciente o embarazo migradas usan la misma conexion que la operacion principal
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
- Crear, actualizar o eliminar plan de parto.
- Crear, actualizar o eliminar vacunas, puerperio, morbilidad y referencias.
- Login exitoso.
- Login fallido.
- Intento de login con usuario inactivo.
- Logout.
- Generacion exitosa de PDF.
- Exportacion de reportes.

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
- `AUTOMATION_SECRET`.
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
- Paciente creado/eliminado: solo nombres en `campos_registrados` o
  `campos_eliminados`; una actualizacion conserva solo nombres de campos con delta real.
- Embarazo: creacion/actualizacion conserva nombres de campos; solo
  `estado_embarazo` puede guardar los valores `activo`, `puerperio` o `cerrado`.
  `numero_embarazo`, FUR, FPP, observaciones y datos obstetricos no guardan valor.

Los productores clinicos pendientes son controles, laboratorios, riesgo
obstetrico, vacunas, morbilidad, plan de parto, puerperio clinico, referencias y
otros productores clinicos. Los historicos no fueron saneados. No existen rutas
HTTP actuales para eliminar pacientes o embarazos y no se agregaron en este
sprint. No hubo cambios de base de datos, migraciones ni ENV en Sprint 4B.3A.

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

## Ejemplo legado pendiente: crear control prenatal

```json
{
  "usuario_id": 5,
  "accion": "crear",
  "modulo": "controles_prenatales",
  "entidad_afectada": "controles_prenatales",
  "id_entidad": "88",
  "paciente_id": 42,
  "embarazo_id": 12,
  "datos_nuevos": {
    "numero_control": 1,
    "fecha": "2026-06-04"
  }
}
```
