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

## Reporteria

`reportes` sigue la separacion por capas y agrega `validations/reportes.schemas.js`
para periodos y `services/reportesPdfService.js` para el PDF nominal. El reporte
principal es el censo de captadas por primer control: el repositorio selecciona
deterministicamente una fila por `embarazo_id`, el servicio aplica el semaforo e
indicadores sobre la misma coleccion y el controlador responde JSON, Excel o
PDF.

`GET /api/reportes/censo` representa exclusivamente embarazos activos al momento
de consultar. No acepta una fecha historica porque `embarazos` no conserva una
bitacora completa de cada transicion de estado. Los reportes de FPP, falta de
control, riesgo y comunidad comparten la fecha operativa de
`America/Guatemala`; no usan `p.created_at` para definir captacion o actividad.

Las descargas nominales requieren `reportes.exportar`, usan oficio horizontal y
registran metadata minima. Puppeteer genera el PDF directamente en memoria; no
se escriben censos dentro del repositorio ni se necesitan migraciones para este
modulo.

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
- Las lecturas GET nunca crean embarazos. La ausencia se representa con `null` y colecciones vacias.
- Crear un embarazo requiere el POST explicito, una transaccion y bloqueo de la paciente.
- Un embarazo nuevo exige que no exista otro `activo` ni en `puerperio`; el bloqueo `FOR UPDATE` de la paciente serializa los POST concurrentes.
- `ux_embarazo_activo_paciente` refuerza solo el estado activo. La proteccion de puerperio depende del flujo transaccional hasta que se evalue una restriccion compatible con los datos existentes.

## Seguridad

- Login crea `auth_sessions`, access JWT corto y refresh rotativo en cookies HttpOnly.
- Solo el hash del refresh se persiste; el access JWT no se almacena.
- `middleware/auth.js` valida algoritmo, issuer, audience, `sid`, sesion, usuario activo y limites temporal/absoluto.
- Username y rol siempre proceden de PostgreSQL; el JWT no es fuente definitiva de autorizacion.
- `csrfMiddleware` protege refresh, actividad y todas las escrituras.
- `cargarPermisos` consulta permisos actuales y `verificarPermiso` bloquea endpoints sin permiso.
- Todos los PDF clinicos requieren `pacientes.ver`, validan pertenencia antes de generar y consumen el limite por usuario justo antes de invocar el generador.
- Contraseña, estado, rol, permisos y eliminacion revocan sesiones dentro de la transaccion critica.
- `sessionService.js` concentra generacion, rotacion, comparacion segura, revocacion y metadata.
- `authSessionsRepository.js` concentra SQL y bloqueos de la tabla de sesiones.

## Auditoria

Los productores migrados usan esta unica secuencia:

```text
producer -> registrarEventoPrivado -> auditDiffBuilder/auditFieldPolicy
         -> auditSanitizer -> auditRepository -> auditoria_eventos
```

`registrarEventoPrivado` exige `contexto.categoria`, `contexto.entidad` y
`contexto.evento`. El productor entrega `cambios` o `metadata`; nunca arma el
JSON persistido ni pasa `req.body`. El servicio deriva modulo, tabla y
descripcion, fuerza IP/user-agent a `null`, descarta eventos vacios y sanea de
nuevo justo antes del repositorio.

Productores en este camino: autenticacion, usuarios, passwords, roles,
permisos, sesiones, PDF, exportaciones/reportes, pacientes, embarazos y
controles prenatales con laboratorios embebidos.
Password, rol, estado, permisos, eliminacion de usuario y escrituras de paciente
o embarazo, y creacion/actualizacion/eliminacion de control prenatal escriben
auditoria obligatoria en la misma transaccion. Login,
expiracion automatica y documentos/reportes son best effort.

Riesgo, vacunas, morbilidad, plan de parto, puerperio clinico, referencias y
otros productores clinicos conservan temporalmente
`registrarEvento` o `utils/auditoria.js`. Ese camino no debe reutilizarse en
pacientes, embarazos, controles prenatales ni codigo nuevo.

Paciente y embarazo comparten el cliente transaccional con cada evento privado.
Creaciones/eliminaciones solo listan campos; actualizaciones solo listan campos
con delta persistido; la unica transicion clinica con valores es
`estado_embarazo` dentro de `activo`, `puerperio` y `cerrado`. Un fallo de
auditoria obligatoria revierte toda la operacion. No se agregaron rutas de
eliminacion que no existieran previamente.

Los laboratorios no tienen repositorio ni evento independiente: se persisten en
`controles_prenatales` y participan en el mismo diff. Todos sus campos,
incluido VIH, se reducen a nombres. El servicio elimina no-ops por equivalencia
de numeros PostgreSQL, fechas y vacios normalizados; timestamps y actor no
entran al payload. La escritura, el bloqueo del embarazo y el evento privado
usan un unico cliente y se confirman o revierten juntos.

No auditar:

- contrasenas,
- hashes,
- JWT,
- secretos,
- datos clinicos completos si basta metadata.

Tampoco auditar IP, user-agent, headers, cookies, request completo, buffers,
HTML, temporales, query completa ni filas nominales en el camino privado. Todo
payload migrado incluye `politica_version: 1`.

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
