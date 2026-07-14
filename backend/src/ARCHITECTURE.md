# Backend layering pattern

Este backend crece por modulos y por capas. La regla principal es simple:

```text
routes -> controllers -> services -> repositories
```

## Responsabilidades

- `routes`: declara endpoints, autenticacion, permisos y validaciones.
- `controllers`: traduce HTTP a llamadas de servicio y arma la respuesta.
- `services`: contiene reglas de negocio, normalizacion, coordinacion entre repositorios y auditoria.
- `repositories`: contiene SQL y acceso a PostgreSQL.
- `validations`: contiene schemas Zod por modulo.
- `utils`: funciones compartidas sin dependencia HTTP directa.

## Flujo recomendado

1. La ruta aplica `authMiddleware` cuando el endpoint requiere sesion.
2. La ruta aplica `cargarPermisos` y `verificarPermiso` cuando corresponde.
3. La ruta aplica `validateBody`, `validateParams` o `validateQuery`.
4. El controller lee `req.params`, `req.query`, `req.body` y `req.usuario`.
5. El controller llama al service.
6. El service valida reglas de negocio y llama repositories.
7. El repository ejecuta SQL y devuelve datos puros.
8. El service registra auditoria si la operacion modifica estado.
9. El controller responde JSON, archivo o blob segun contrato.

## Manejo de errores

Para errores de negocio usar `AppError` o `HttpError`:

```js
throw new AppError(409, 'No hay embarazo activo', { code: 'NO_ACTIVE_PREGNANCY' });
```

Los controllers deben usar `asyncHandler` y dejar que `middleware/errorHandler.js` convierta errores a una respuesta uniforme:

```json
{
  "ok": false,
  "message": "Mensaje claro para el usuario",
  "code": "CODIGO_DE_ERROR"
}
```

Errores soportados por el handler:

- `ZodError`: devuelve `VALIDATION_ERROR` con detalles por campo.
- PostgreSQL `23505`: devuelve conflicto con mensaje especifico segun constraint.
- PostgreSQL `23503`: devuelve conflicto por registro relacionado.
- PostgreSQL `22P02`: devuelve dato invalido.
- `AppError`/`HttpError`: respeta status, message, code y details.
- Errores inesperados: devuelve 500 sin stack en produccion.

## Modulos con patron completo

Los siguientes modulos ya tienen separacion en controller/service/repository/validation donde aplica:

- pacientes
- controles prenatales
- plan de parto
- puerperio
- vacunas
- riesgo obstetrico
- morbilidad
- referencias
- auth
- usuarios
- permisos
- reportes
- PDF
- chatbot

Los resultados de laboratorio no constituyen un modulo HTTP independiente. Forman parte del modelo y flujo de controles prenatales: se capturan con cada control y se consultan desde los controles y el expediente. Los datos sensibles de VIH mantienen su filtrado por permisos.

## Modulo de referencia

Usar `pacientes` como referencia para nuevos modulos:

```text
routes/pacientes.js
controllers/pacientesController.js
services/pacientesService.js
repositories/pacientesRepository.js
validations/pacientes.schemas.js
```

## Reglas de embarazo

Las reglas de embarazo viven en services y utils, no en controllers:

- `utils/embarazos.js` resuelve y valida embarazos.
- `pacientesService.js` crea, cierra y pasa embarazos a puerperio.
- Los modulos clinicos deben recibir o resolver `embarazo_id`.
- Un embarazo cerrado debe tratarse como solo lectura.
- La URL puede traer `?embarazo_id=`, pero la fuente de verdad es PostgreSQL.

## Seguridad

- Login usa JWT firmado y cookies.
- `csrfMiddleware` protege escrituras.
- `cargarPermisos` agrega permisos al usuario autenticado.
- `verificarPermiso` bloquea endpoints sin permiso.
- El rol `director` se usa para administracion de permisos.

## Auditoria

Las escrituras clinicas deben registrar auditoria mediante `services/auditService.js` o utilidades existentes.

No auditar:

- contrasenas,
- hashes,
- JWT,
- secretos,
- datos clinicos completos si basta metadata.

Ver `AUDITORIA.md`.

## Checklist para crear endpoint nuevo

1. Definir ruta en `routes`.
2. Crear schema Zod si recibe body, params o query.
3. Agregar permiso necesario.
4. Implementar controller con `asyncHandler`.
5. Implementar regla en service.
6. Implementar SQL en repository.
7. Registrar auditoria si modifica estado.
8. Documentar endpoint en `docs/API.md`.
9. Si cambia base de datos, actualizar `docs/BASE_DATOS.md`.
