# Backend Layering Pattern

Este backend debe crecer por modulos con responsabilidades separadas:

- `routes`: declara endpoints, middlewares de autenticacion y validacion.
- `controllers`: traduce HTTP a llamadas de servicio y arma respuestas HTTP.
- `services`: contiene reglas de negocio, normalizacion de datos, coordinacion entre repositorios y auditoria.
- `repositories`: contiene consultas SQL y acceso a PostgreSQL.
- `validations`: contiene schemas Zod por modulo.

## Flujo recomendado

1. La ruta aplica `authMiddleware`, `validateBody`, `validateParams` o `validateQuery`.
2. El controller toma `req.params`, `req.query` y `req.body`.
3. El controller llama al service y responde con el mismo contrato de API existente.
4. El service ejecuta reglas de negocio y llama repositorios.
5. El repository devuelve datos puros desde PostgreSQL.
6. El service registra auditoria cuando la operacion modifica estado.

## Manejo de errores

Para errores de negocio usar `AppError` o `HttpError` (alias compatible):

```js
throw new AppError(409, 'No hay embarazo activo', { code: 'NO_ACTIVE_PREGNANCY' });
```

Los controllers nuevos deben usar `asyncHandler` y dejar que `middleware/errorHandler.js` convierta errores a una respuesta uniforme:

```json
{
  "ok": false,
  "message": "Mensaje claro para el usuario",
  "code": "CODIGO_DE_ERROR"
}
```

En desarrollo el handler puede incluir `debug` para errores 500. En produccion no expone stack trace ni detalles SQL. Los errores de validacion conservan `details` por campo.

Controllers ya migrados a `asyncHandler`: pacientes, controles prenatales, puerperio, plan de parto, vacunas, riesgo, morbilidad, referencias, usuarios, auth, laboratorio, reportes, PDF y chatbot.

## Modulo de referencia

`pacientes` es el primer modulo separado con este patron:

- `routes/pacientes.js`
- `controllers/pacientesController.js`
- `services/pacientesService.js`
- `repositories/pacientesRepository.js`
- `validations/pacientes.schemas.js`

Para replicarlo en controles prenatales, puerperio, vacunas y reportes, mover primero las consultas SQL al repository, luego las reglas al service, y al final adelgazar el controller.

## Segundo modulo refactorizado

`controles prenatales` ya usa el mismo patron para sus endpoints activos:

- `routes/controles.js`
- `controllers/controlesPrenatalesController.js`
- `services/controlesPrenatalesService.js`
- `repositories/controlesPrenatalesRepository.js`
- `validations/controles.schemas.js`

`controllers/controlesController.js` queda como wrapper de compatibilidad. Las rutas activas usan controllers especificos para controles prenatales, plan de parto y puerperio.

## Modulos siguientes refactorizados

`plan de parto`, `puerperio` y `vacunas` ya siguen el mismo patron:

- `controllers/planPartoController.js`
- `services/planPartoService.js`
- `repositories/planPartoRepository.js`
- `controllers/puerperioController.js`
- `services/puerperioService.js`
- `repositories/puerperioRepository.js`
- `controllers/vacunasController.js`
- `services/vacunasService.js`
- `repositories/vacunasRepository.js`
- `controllers/riesgoController.js`
- `services/riesgoService.js`
- `repositories/riesgoRepository.js`
- `controllers/morbilidadController.js`
- `services/morbilidadService.js`
- `repositories/morbilidadRepository.js`
- `controllers/referenciasController.js`
- `services/referenciasService.js`
- `repositories/referenciasRepository.js`
- `controllers/authController.js`
- `services/authService.js`
- `repositories/authRepository.js`
- `controllers/usuariosController.js`
- `services/usuariosService.js`
- `repositories/usuariosRepository.js`
- `controllers/laboratorioController.js`
- `services/laboratorioService.js`
- `repositories/laboratorioRepository.js`
- `controllers/reportesController.js`
- `services/reportesService.js`
- `repositories/reportesRepository.js`
- `controllers/pdfController.js`
- `services/pdfService.js`
- `repositories/pdfRepository.js`
