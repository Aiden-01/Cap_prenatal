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
