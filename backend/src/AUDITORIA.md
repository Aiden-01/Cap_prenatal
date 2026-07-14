# Auditoria de eventos

La auditoria actual es hibrida: algunos modulos registran eventos mediante `services/auditService.js` y otros mediante utilidades compatibles en `utils/auditoria.js`. Ambos caminos escriben en `auditoria_eventos`.

La politica general es no bloquear la operacion clinica si falla la escritura de auditoria. El servicio registra un warning/error en consola y permite que la operacion principal continue.

La actualizacion directa de permisos de un usuario (`PUT /api/usuarios/:id/permisos`) es una excepcion deliberada: el reemplazo y el evento `usuario_permisos_actualizados` se escriben con la misma conexion y transaccion. Si falla la auditoria obligatoria, tambien se revierten los permisos. El evento conserva el actor, el usuario afectado, los conjuntos anterior y nuevo ordenados, y los permisos agregados y retirados. Una solicitud cuyo conjunto normalizado no cambia no escribe un evento, porque no hubo cambio efectivo de privilegios.

## Objetivo

La auditoria debe responder:

- Quien hizo la accion.
- Que accion hizo.
- Sobre que modulo o entidad.
- Sobre que paciente y embarazo, si aplica.
- Cuando ocurrio.
- Desde que IP y cliente.
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
- `ip`: direccion IP detectada desde la solicitud.
- `user_agent`: cliente usado para la solicitud.
- `datos_anteriores`: snapshot previo cuando aplica.
- `datos_nuevos`: snapshot resultante cuando aplica.
- `descripcion`: texto breve del evento.

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
- filtros,
- paciente/embarazo si aplica.

No copiar snapshots clinicos completos si no son necesarios para trazabilidad.

## Criterio funcional para PDF institucional

El permiso `controles.ver_vih` aplica a interfaz web, endpoints JSON y escrituras del sistema.

Como excepcion funcional, los PDF institucionales MSPAS/CAP conservan los marcadores del formato clinico solicitado, incluyendo resultados de tamizaje VIH cuando el formato los requiere.

Ese dato representa tamizaje o registro inicial del control prenatal, no diagnostico confirmado de VIH. La confirmacion y seguimiento se realizan por otro procedimiento fuera del alcance actual del sistema.

Por este motivo, la generacion del PDF institucional no se bloquea por falta de `controles.ver_vih` ni se eliminan automaticamente sus marcadores VIH del formato.

## Criterio funcional para captura VIH en controles

El permiso `controles.crear` permite registrar la captura inicial de VIH al crear un control prenatal nuevo, aunque el usuario no tenga `controles.ver_vih`.

La respuesta JSON para ese usuario debe seguir saneada y no devolver:

- `vih_realizado`
- `vih_resultado`
- `vih_resultado_valor`

El permiso `controles.ver_vih` se reserva para visualizar resultados VIH ya registrados y para editar o corregir campos VIH en controles existentes.

En `PUT` y en `POST` con upsert sobre un control existente, si el usuario no tiene `controles.ver_vih`, los campos VIH recibidos se ignoran sin sobrescribir valores existentes.

## Credenciales iniciales de seed

El usuario `director` creado por `db/seed.js` con contrasena `Director2024*` es una credencial temporal de desarrollo y primer arranque.

Debe cambiarse antes de usar el sistema en produccion.

## Ejemplo: crear paciente

```json
{
  "usuario_id": 3,
  "accion": "crear",
  "modulo": "pacientes",
  "entidad_afectada": "pacientes",
  "id_entidad": "42",
  "paciente_id": 42,
  "embarazo_id": null,
  "datos_anteriores": null,
  "datos_nuevos": {
    "id": 42,
    "no_expediente": "CAP-001",
    "nombres": "Ana"
  }
}
```

## Ejemplo: crear control prenatal

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
