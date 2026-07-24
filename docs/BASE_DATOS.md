# Base de datos

Motor: PostgreSQL.

Schema principal:

```text
backend/src/db/schema.sql
```

Migraciones adicionales:

```text
backend/src/db/migrations/
```

## Conexion

El backend usa `backend/src/db/pool.js`.

Puede conectarse con:

- `DATABASE_URL`, o
- variables separadas `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

SSL se controla con:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
```

## Scripts

```bash
cd backend
npm run db:migrate
npm run db:seed
npm run db:migrate-bi
npm run db:seed-bi
npm run test:vistas-bi
```

`db:seed` requiere `SEED_DIRECTOR_NAME`, `SEED_DIRECTOR_USERNAME` y
`SEED_DIRECTOR_PASSWORD`. No existen credenciales predeterminadas. El seed crea
como maximo la cuenta director indicada y no cambia su contrasena si ya existe.
En produccion exige una confirmacion adicional documentada en
`docs/ROTACION_SECRETOS.md`.

## Estado final y migracion 008

`schema.sql` declara 17 tablas publicas: 16 operativas y la tabla tecnica
`schema_migrations`. El conteo se valida tanto analizando las sentencias
`CREATE TABLE` como contra `pg_tables` en una instalacion PostgreSQL temporal.

`008_retirar_referencias_efectuadas.sql` usa `lock_timeout = 5s` y
`statement_timeout = 30s`. Si la tabla historica no existe, registra la
migracion sin cambios. Si existe, toma `ACCESS EXCLUSIVE`, muestra unicamente
el conteo agregado y aborta toda la transaccion cuando el conteo es mayor que
cero. Solo una tabla vacia se retira, sin `CASCADE`; una dependencia inesperada
tambien provoca rollback.

La aplicacion nueva comprueba al arrancar que 008 este registrada; el runner
solo crea ese registro despues de retirar o comprobar ausente la tabla
obsoleta. Orden operativo obligatorio:

1. detener el backend anterior;
2. verificar backup y conteo de forma autorizada;
3. ejecutar `npm run db:migrate`;
4. confirmar 008 y el conteo final;
5. desplegar/iniciar el backend nuevo.

008 aun no se ha aplicado en PC1 ni PC2. No debe ejecutarse en ninguna de esas
bases como parte de pruebas de desarrollo.

## Modelo conceptual

```text
usuarios
   |
   | registra / actualiza / audita
   v
pacientes
   |
   | 1:N
   v
embarazos
   |
   | 1:N o 1:1 segun modulo
   v
controles_prenatales
fichas_riesgo_obstetrico
planes_parto
vacunas_paciente
morbilidad_embarazo
controles_puerperio
```

## Tablas principales

| Tabla | Proposito |
| --- | --- |
| `roles` | Catalogo simple de roles. |
| `usuarios` | Usuarios del sistema y credenciales hash. |
| `permisos` | Catalogo de permisos por codigo. |
| `usuario_permisos` | Relacion usuario-permiso. |
| `pacientes` | Datos generales, antecedentes, datos obstetricos base y campos institucionales. |
| `embarazos` | Historial de embarazos por paciente. |
| `controles_prenatales` | Consultas prenatales por embarazo y modelo canonico de sus resultados de laboratorio. |
| `fichas_riesgo_obstetrico` | Evaluacion de riesgo obstetrico por embarazo. |
| `planes_parto` | Plan de parto por embarazo. |
| `vacunas_paciente` | Vacunas asociadas a paciente/embarazo. |
| `morbilidad_embarazo` | Eventos de morbilidad. |
| `controles_puerperio` | Atenciones de puerperio. |
| `comunidades` | Catalogo geografico/comunitario. |
| `comunidades_aliases` | Alias para normalizar comunidades. |
| `auditoria_eventos` | Trazabilidad de operaciones. |

## Laboratorios

Los resultados de laboratorio se almacenan como parte de cada registro de `controles_prenatales`; no existe una tabla independiente `resultados_laboratorio`. Su captura y actualizacion siguen el flujo del control prenatal, y su visualizacion se realiza desde los controles y el expediente de la paciente.

Los resultados sensibles de VIH permanecen sujetos a los permisos vigentes de acceso a datos sensibles.

## Embarazos

La tabla `embarazos` es el pivote clinico del sistema.

Campos clave:

- `paciente_id`
- `numero_embarazo`
- `estado`: `activo`, `puerperio`, `cerrado`
- `fur`
- `fpp`
- `fecha_inicio`
- `fecha_cierre`
- `observaciones`

Reglas:

- Solo puede existir un embarazo `activo` por paciente.
- Los modulos clinicos deben escribir `embarazo_id`.
- Las consultas historicas deben resolver por `embarazo_id` cuando venga en la URL.
- Los registros de embarazo cerrado no deben editarse desde UI normal.
- Consultar un expediente sin embarazo no crea filas ni cambia timestamps.
- La creacion explicita bloquea la fila de paciente y se ejecuta en una transaccion.

## Relaciones por embarazo

| Modulo | Relacion esperada |
| --- | --- |
| Controles prenatales | Muchos por embarazo. |
| Riesgo obstetrico | Uno por embarazo. |
| Plan de parto | Uno por embarazo. |
| Vacunas | Muchas por embarazo. |
| Morbilidad | Muchas por embarazo. |
| Puerperio | Muchas por embarazo. |
| Referencia por riesgo | `fichas_riesgo_obstetrico.referida_a`. |
| Tratamiento o referencia por morbilidad | `morbilidad_embarazo.tratamiento_referencia`. |
| Procedencia | `pacientes.viene_referida` y `pacientes.referida_de`. |
| PDF | Lee el embarazo seleccionado. |

## Indices y unicidad

El schema define indices para busqueda y rendimiento:

- Expediente, CUI, nombres y apellidos de pacientes.
- Paciente y fecha en controles.
- Paciente/embarazo en modulos clinicos.
- Auditoria por usuario, paciente, embarazo, accion y fecha.

Restricciones importantes que el backend traduce a mensajes claros:

- CUI unico.
- Numero de expediente unico.
- Un embarazo activo por paciente.
- Ficha de riesgo unica por embarazo.
- Plan de parto unico por embarazo.
- Numero de control unico por embarazo.
- Numero de atencion puerperio unico por embarazo.
- Vacuna/dosis unica segun regla de negocio.

La politica de aplicacion admite un embarazo nuevo solo si no existe otro en
estado `activo` o `puerperio`. El POST bloquea la fila de la paciente con
`SELECT ... FOR UPDATE` antes de comprobar ambos estados, por lo que dos POST
concurrentes que usen el flujo normal quedan serializados. La restriccion
`UNIQUE (paciente_id, numero_embarazo)` protege tambien la numeracion historica.

El indice parcial existente `ux_embarazo_activo_paciente` cubre unicamente
`WHERE estado = 'activo'`; no impide por si solo combinaciones con `puerperio`
si un escritor omite el bloqueo transaccional. Un indice parcial futuro sobre
`WHERE estado IN ('activo', 'puerperio')` seria compatible con el modelo, pero
antes requeriria comprobar datos existentes por paciente —incluidos pares
activo/puerperio o multiples puerperios— y coordinar todos los escritores. No
se crea una migracion en este cierre; queda documentado el riesgo para accesos
directos o flujos que no bloqueen la fila de paciente.

## Auditoria

Tabla:

```text
auditoria_eventos
```

Debe registrar:

- Usuario que ejecuto.
- Accion.
- Modulo/tabla.
- Paciente y embarazo cuando aplique.
- IP y user agent.
- Datos anteriores/nuevos cuando sea necesario y seguro.

No debe guardar:

- Contrasenas.
- Hashes.
- JWT.
- Secretos.
- Snapshots clinicos completos cuando basta metadata.

Ver detalle en `backend/src/AUDITORIA.md`.

## Vistas BI

La migracion:

```text
backend/src/db/migrations/005_vistas_bi.sql
```

crea o actualiza vistas para analisis/reporteria. Usar:

```bash
npm run db:migrate-bi
```

Para probar:

```bash
npm run test:vistas-bi
```

## Reglas para cambios de schema

1. Preferir cambios idempotentes con `IF NOT EXISTS` cuando aplique.
2. Mantener compatibilidad con datos existentes.
3. Si se agrega campo clinico, actualizar:
   - schema SQL,
   - repository,
   - service,
   - validation schema,
   - frontend,
   - documentacion.
4. Si el campo pertenece a un embarazo, guardar `embarazo_id`.
5. Si el cambio afecta reportes o PDF, validar documentos generados.
6. Si el cambio afecta BI, actualizar vistas y pruebas.

