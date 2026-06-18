# Auditoria de eventos

La auditoria se registra mediante `services/auditService.js`.

La politica actual es no bloquear la operacion clinica si falla la escritura de auditoria. El servicio registra un warning en consola y permite que la operacion principal continue.

## Campos principales

- `usuario_id`: usuario autenticado que ejecuta la accion.
- `accion`: `crear`, `actualizar`, `eliminar`, `estado`, `login`, `logout`, `login_fallido`, `login_usuario_inactivo`, `consultar`, `generar_pdf` o `exportar`.
- `modulo`: area funcional, por ejemplo `pacientes` o `controles_prenatales`.
- `entidad_afectada`: tabla o entidad de negocio afectada.
- `id_entidad`: identificador del registro afectado.
- `fecha_hora`: momento del evento.
- `ip`: direccion IP detectada desde la solicitud.
- `user_agent`: cliente usado para la solicitud.
- `datos_anteriores`: snapshot previo cuando aplica.
- `datos_nuevos`: snapshot resultante cuando aplica.

## Acciones nuevas de trazabilidad

- `login_fallido`: intento de inicio de sesion con usuario inexistente o contrasena incorrecta. No debe guardar contrasenas, hashes ni tokens.
- `login_usuario_inactivo`: intento de inicio de sesion de una cuenta existente pero inactiva. La respuesta al cliente no debe revelar detalles internos de la cuenta.
- `consultar`: lectura de informacion sensible, reservada para endpoints que requieran trazabilidad de consulta.
- `generar_pdf`: generacion exitosa de documentos PDF, por ejemplo ficha MSPAS prenatal, control prenatal, riesgo obstetrico o plan de parto.
- `exportar`: exportacion exitosa de reportes, por ejemplo censos en Excel.

Los eventos de documentos y reportes deben guardar metadatos minimos, como tipo de documento, tipo de reporte, formato y filtros. No deben copiar snapshots clinicos completos.

## Criterio funcional para PDF institucional

El permiso `controles.ver_vih` aplica a la interfaz web, endpoints JSON y escrituras del sistema. Como excepcion funcional, los PDF institucionales MSPAS/CAP conservan los marcadores del formato clinico solicitado, incluyendo resultados de tamizaje VIH cuando el formato los requiere.

Ese dato representa tamizaje o registro inicial del control prenatal, no diagnostico confirmado de VIH. La confirmacion y seguimiento se realizan por otro procedimiento fuera del alcance actual del sistema. Por este motivo, la generacion del PDF institucional no se bloquea por falta de `controles.ver_vih` ni se eliminan automaticamente sus marcadores VIH del formato.

## Criterio funcional para captura VIH en controles

El permiso `controles.crear` permite registrar la captura inicial de VIH al crear un control prenatal nuevo, aunque el usuario no tenga `controles.ver_vih`. La respuesta JSON para ese usuario debe seguir saneada y no devolver `vih_realizado`, `vih_resultado` ni `vih_resultado_valor`.

El permiso `controles.ver_vih` se reserva para visualizar resultados VIH ya registrados y para editar o corregir campos VIH en controles existentes. En `PUT` y en `POST` con upsert sobre un control existente, si el usuario no tiene `controles.ver_vih`, los campos VIH recibidos se ignoran sin sobrescribir los valores existentes.

## Credenciales iniciales de seed

El usuario `director` creado por `db/seed.js` con contrasena `Director2024*` es una credencial temporal de desarrollo y primer arranque. Debe cambiarse antes de usar el sistema en produccion.

## Ejemplos

Crear paciente:

```json
{
  "usuario_id": 3,
  "accion": "crear",
  "modulo": "pacientes",
  "entidad_afectada": "pacientes",
  "id_entidad": "42",
  "paciente_id": 42,
  "datos_anteriores": null,
  "datos_nuevos": { "id": 42, "no_expediente": "CAP-001", "nombres": "Ana" }
}
```

Editar paciente:

```json
{
  "usuario_id": 3,
  "accion": "actualizar",
  "modulo": "pacientes",
  "entidad_afectada": "pacientes",
  "id_entidad": "42",
  "paciente_id": 42,
  "datos_anteriores": { "telefono": "55550000" },
  "datos_nuevos": { "telefono": "55551111" }
}
```

Crear control prenatal:

```json
{
  "usuario_id": 5,
  "accion": "crear",
  "modulo": "controles_prenatales",
  "entidad_afectada": "controles_prenatales",
  "id_entidad": "88",
  "paciente_id": 42,
  "embarazo_id": 12,
  "datos_nuevos": { "numero_control": 1, "fecha": "2026-06-04" }
}
```
