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

Para errores de negocio usar `HttpError`:

```js
throw new HttpError(409, 'No hay embarazo activo');
```

El controller debe convertir `err.status` en respuesta HTTP y dejar errores de base de datos conocidos, como duplicados, con mensajes compatibles con el frontend.

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

Nota: `controllers/controlesController.js` aun conserva plan de parto y puerperio. Esos submodulos deben separarse despues en sus propios services/repositories para evitar un cambio demasiado grande en una sola iteracion.
