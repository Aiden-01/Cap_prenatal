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

## Estado final y compatibilidad de migraciones 008 a 017

`schema.sql` declara 19 tablas publicas: 17 operativas y dos tablas técnicas,
`schema_migrations` y `automatizacion_despachos`. El conteo se valida tanto analizando las sentencias
`CREATE TABLE` como contra `pg_tables` en una instalacion PostgreSQL temporal.

`008_retirar_referencias_efectuadas.sql` usa `lock_timeout = 5s` y
`statement_timeout = 30s`. Si la tabla historica no existe, registra la
migracion sin cambios. Si existe, toma `ACCESS EXCLUSIVE`, muestra unicamente
el conteo agregado y aborta toda la transaccion cuando el conteo es mayor que
cero. Solo una tabla vacia se retira, sin `CASCADE`; una dependencia inesperada
tambien provoca rollback.

El codigo actual comprueba al arrancar que las migraciones `008` a `017` esten
registradas con el checksum de sus archivos versionados. La comprobacion solo
ejecuta `SELECT`: no crea ni altera tablas, no modifica datos y no aplica
migraciones automaticamente. El runner solo registra 008 despues de retirar o
comprobar ausente la tabla obsoleta. Orden operativo obligatorio:

1. detener el backend anterior;
2. verificar backup y conteo de forma autorizada;
3. ejecutar `npm run db:migrate`;
4. confirmar 008 a 017 y el conteo final;
5. desplegar/iniciar el backend nuevo.

Cada entorno mantiene su propia base y ejecuta `npm run db:migrate` de forma
independiente; las bases no se copian entre PCs. Estado operativo registrado
para este cierre: `008` ya fue aplicada en las PCs Casa y Trabajo. En la base
local de desarrollo de PC Trabajo/AIDEN29, una consulta de solo lectura
confirmo que `009` a `012` tambien estan registradas con los checksums de los
archivos versionados; no deben volver a ejecutarse manualmente. Esta consulta
no se conecto a PC Casa ni revalido `009` a `012` en ese entorno. Las pruebas
automatizadas de compatibilidad usan dobles o PostgreSQL temporal aislado,
nunca una base real.

`014_citas_prenatales.sql` se incorpora como migracion aditiva de CITAS-01A.
La observación local de solo lectura más reciente encontró 014 registrada con
el checksum versionado y `applied_at` del 24 de agosto de 2026, 21:43:36 en
`America/Guatemala`. Esta sesión no ejecutó esa migración y no atribuye quién o
qué proceso la aplicó. En aquella observacion,
`015_automatizacion_despachos.sql` seguia pendiente en la base local
configurada; eso no determina el estado actual de ninguna base.

`016_riesgo_tiempo_horas_decimales.sql` cambia
`fichas_riesgo_obstetrico.tiempo_horas` a `NUMERIC(4,2)` para conservar
fracciones de hora; el rango funcional de 0 a 72 horas se valida en la API.
`017_citas_inasistencias.sql` agrega el estado `inasistente`, la relacion de
seguimiento y sus restricciones e indices. Antes de reclasificar citas vencidas
ya estructuradas, comprueba que no existan controles coincidentes ambiguos ni
controles ya asignados a otra cita. En la misma migracion marca `atendida` la
cita vencida con control de la misma fecha, e `inasistente` la vencida sin ese
control. No reconstruye citas desde `controles_prenatales.cita_siguiente`.

El historial Git muestra que el proyecto inicial aplicaba directamente
`schema.sql` y no tenia archivos incrementales. La primera migracion versionada
agregada fue `004_comunidades_catalogo.sql`; por ello 001 a 003 no son archivos
perdidos del runner actual, sino una numeracion que comenzo en 004 al introducir
el sistema incremental.

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
citas_prenatales
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
| `citas_prenatales` | Agenda trazable originada por controles, con cumplimiento, inasistencia, reprogramacion y seguimiento. |
| `fichas_riesgo_obstetrico` | Evaluacion de riesgo obstetrico por embarazo. |
| `planes_parto` | Plan de parto por embarazo. |
| `vacunas_paciente` | Vacunas asociadas a paciente/embarazo. |
| `morbilidad_embarazo` | Eventos de morbilidad. |
| `controles_puerperio` | Atenciones de puerperio. |
| `comunidades` | Catalogo geografico/comunitario. |
| `comunidades_aliases` | Alias para normalizar comunidades. |
| `auditoria_eventos` | Trazabilidad de operaciones. |
| `automatizacion_despachos` | Estado técnico e idempotente de envíos por tipo y período; no contiene pacientes ni correo. |

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
| Citas prenatales | Muchas por embarazo; una cita raiz por control de origen, con posibles citas derivadas. |
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
- Una cita raiz unica por control de origen y un control de cumplimiento usado
  como maximo por una cita.
- Una sola cita `programada` sin cumplimiento por embarazo; como maximo una hija
  por reprogramacion y una cita de seguimiento por inasistencia.
- Origen, cumplimiento, cita reprogramada y seguimiento deben pertenecer al
  mismo embarazo. Una cita no puede derivar simultaneamente de reprogramacion
  e inasistencia ni apuntar a si misma.
- Numero de atencion puerperio unico por embarazo.
- Posicion TD unica por paciente mediante `ux_vacunas_td_paciente_posicion`.
- Posicion SR/SPR unica por paciente mediante `ux_vacunas_spr_sr_paciente_posicion`.
- Tdap durante/postparto unica por embarazo mediante `ux_vacunas_tdap_embarazo`;
  una Tdap previa queda fuera de ese indice parcial.
- Influenza no tiene indice unico: cada fila es una aplicacion independiente con
  `numero_dosis = 1`.
- Catalogo, momento, posicion y fecha clinica de vacunas protegidos por checks.

La politica de aplicacion admite un embarazo nuevo solo si no existe otro en
estado `activo` o `puerperio`. El POST bloquea la fila de la paciente con
`SELECT ... FOR UPDATE` antes de comprobar ambos estados, por lo que dos POST
concurrentes que usen el flujo normal quedan serializados. La restriccion
`UNIQUE (paciente_id, numero_embarazo)` protege tambien la numeracion historica.

### Estructura definitiva de vacunas

`vacunas_paciente` almacena solo `td`, `tdap`, `influenza` y `spr_sr`. No existen
columnas ni tablas de temporada. El numero interno admite TD 1-5, Tdap 1,
SR/SPR 1-2 e Influenza 1. `momento` admite `previo_embarazo`,
`durante_embarazo` y `postparto_aborto`; `fecha_dosis` es obligatoria para toda
aplicacion.

Las migraciones son inmutables y se aplican en orden por checksum:

- `009_vax2_reglas_vacunas.sql`: catalogo y constraints clinicos base.
- `010_vax31_historias_parciales.sql`: posiciones longitudinales parciales e
  indice Tdap limitado a durante/postparto.
- `011_vax4_influenza_aplicaciones_independientes.sql`: elimina la unicidad
  generica, normaliza Influenza a 1 y conserva los indices especificos.
- `012_vax5_correccion_final.sql`: corrige la excepcion que permitia Influenza
  sin fecha. Agrega el check como `NOT VALID` para no borrar ni inventar fechas
  historicas y lo valida automaticamente cuando no existen filas nulas.

`schema.sql` representa la instalacion nueva final. En una actualizacion, el
migrador toma un advisory lock, ejecuta cada archivo en transaccion, registra
checksum una sola vez y revierte el archivo completo ante error.

## Citas prenatales (CITAS-01A, CITAS-01B y CITAS-02)

`citas_prenatales` separa la agenda de la observacion historica
`controles_prenatales.cita_siguiente`. El registro conserva:

- `embarazo_id` y `fecha_programada`;
- `estado`: `programada`, `atendida`, `cancelada`, `reprogramada` o
  `inasistente`;
- `control_origen_id`, inmutable y compartido por la raiz y sus hijas como
  origen historico de la cadena;
- `control_cumplimiento_id`, opcional y unico, obligatorio solo para
  `atendida`;
- `reprogramada_desde_id`, relacion uno a uno hacia la cita anterior;
- `seguimiento_inasistencia_desde_id`, relacion opcional uno a uno hacia la
  inasistencia que origino una cita de seguimiento;
- `registrado_por`, `updated_by`, `created_at` y `updated_at`.

Las FKs compuestas de `control_origen_id` o `control_cumplimiento_id` junto a
`embarazo_id` impiden asociar controles de otro embarazo. La autorrelacion
equivalente impide cruzar reprogramaciones o seguimientos entre embarazos. Los
checks evitan autocumplimiento, autorreprogramacion, seguimiento hacia si
misma, ambas derivaciones en una fila y estados incompatibles con el control
cumplidor. Una `programada` puede pasar a `atendida`, `cancelada`,
`reprogramada` o `inasistente`. Reprogramar una `programada` conserva la fila
original como `reprogramada` y crea una hija `programada` con el mismo
`control_origen_id`. Una `inasistente` pendiente conserva su estado historico
cuando se crea una nueva cita `programada` con
`seguimiento_inasistencia_desde_id` apuntando a ella. Un control registrado
posteriormente con la misma fecha puede reconciliar una `inasistente` como
`atendida` si aun no existe seguimiento derivado.

Al crear un control nuevo, el servicio conserva la captura existente. Si existe
una unica cita `programada` del embarazo, el nuevo control la marca `atendida`
y guarda su ID en `control_cumplimiento_id`; la fecha exacta no es requisito.
Si el nuevo control trae `cita_siguiente`, crea despues la proxima cita.
Cumplimiento, control, proxima cita y auditorias se confirman o revierten
juntos. Mas de una cita vigente produce `409 CITAS_VIGENTES_AMBIGUAS` antes de
escribir.

La raiz conserva unicidad parcial por `control_origen_id WHERE
reprogramada_desde_id IS NULL AND seguimiento_inasistencia_desde_id IS NULL`;
las hijas pueden reutilizar el origen. Indices unicos parciales impiden dos
hijas de reprogramacion desde la misma cita o dos seguimientos desde la misma
inasistencia, y
`ux_citas_programada_embarazo` garantiza una unica cita `programada` sin
cumplimiento por embarazo. La lectura idempotente de la raiz evita duplicados
ante reintentos.

Editar `cita_siguiente` en un control existente solo admite la correccion
`NULL -> fecha`: el servicio bloquea y vuelve a leer el control, exige que sea
el ultimo del embarazo, que no exista una cita raiz originada por el control y
que tampoco exista otra cita `programada` vigente. Entonces actualiza el dato
historico, crea la cita estructurada con el mismo `embarazo_id` y
`control_origen_id`, y registra ambas auditorias dentro de una sola transaccion.
Un reintento equivalente no duplica la cita. La presencia de un control
posterior, una cita vigente o un origen ya utilizado produce `409` antes de
escribir.

Las transiciones `fecha -> otra fecha` y `fecha -> NULL` siguen prohibidas en
la edicion del control: requieren respectivamente Reprogramar cita y Cancelar
cita, por lo que responden `CITA_REPROGRAMACION_REQUERIDA` y
`CITA_CANCELACION_REQUERIDA`. Tampoco se puede eliminar un control vinculado a
una cita (`409 CONTROL_RELACIONADO_CON_CITA`). Las demas ediciones conservan su
comportamiento.

No hay `INSERT ... SELECT`, trigger ni seed de citas. La fecha de corte es por
entorno y corresponde a la activacion conjunta de la migracion 014 y el backend
que escribe el modelo nuevo. Solo las filas creadas en `citas_prenatales` desde
ese corte son confiables; `schema_migrations.applied_at` evidencia la aplicacion
del DDL, pero el despliegue debe registrar tambien el momento de activacion del
backend. Los controles anteriores, aunque tengan `cita_siguiente`, no se
reconstruyen ni entran automaticamente al futuro seguimiento.

El calendario mensual del Dashboard lee directamente `citas_prenatales` por un
rango inclusivo de hasta 62 dias. La consulta unica admite el rango visual de
seis semanas, incluye `programada`, `atendida`, `cancelada`, `reprogramada` e
`inasistente`, y relaciona opcionalmente la hija reprogramada o de seguimiento
para mostrar la nueva fecha. Ordena por fecha y
paciente, minimiza la salida a nombre y comunidad y no depende de
`controles_prenatales.cita_siguiente`. Los indices existentes de fecha y
relaciones cubren este acceso; CITAS-02 no agrega migracion ni indice.

`/api/automatizaciones/v1/proximas-citas` permanece separado y sigue leyendo
solo filas con `estado = 'programada'` y `control_cumplimiento_id IS NULL`, con
su contrato externo intacto. `controles_prenatales.cita_siguiente` no se
modifica al reprogramar o cancelar: es historia, no la agenda vigente. No hay
backfill, por lo que un periodo anterior al corte confiable puede no mostrar
citas aunque existan proximas fechas en controles historicos.

El seguimiento semanal de inasistencias consulta citas `inasistente` sin
cumplimiento ni seguimiento derivado, en embarazo `activo` o `puerperio`,
creadas desde el corte confiable de 014 y con fecha hasta el domingo anterior.
Incluye las nuevas de esa semana y las anteriores que sigan pendientes; excluye
las que tengan un control posterior. El workflow versionado permanece inactivo.

`015_automatizacion_despachos.sql` agrega una tabla exclusivamente técnica con
unicidad por `tipo + periodo_desde + periodo_hasta`. Sus estados son
`reservado`, `enviado`, `sin_resultados` y `reintento_autorizado`. Guarda el
hash SHA-256 de un token efímero, conteo, número de intento y marcas de tiempo;
no guarda citas, pacientes, destinatarios, API keys ni contenido del correo.
Una reserva sobrevive a un timeout ambiguo y bloquea otro envío hasta una
resolución manual explícita.

Los indices operativos cubren fecha programada de citas aun `programada` sin
cumplimiento (`idx_citas_programadas_fecha`), una unica cita vigente por
embarazo (`ux_citas_programada_embarazo`), origen raiz
(`ux_citas_control_origen_raiz`), cumplimiento
(`ux_citas_control_cumplimiento`), una hija por reprogramacion
(`ux_citas_reprogramada_desde`) y una por inasistencia
(`ux_citas_seguimiento_inasistencia_desde`). No se crea un indice
aislado de `estado`, por su baja selectividad; los predicados parciales cubren
las consultas reales.

En CITAS-01B la migracion 014 pasó en PostgreSQL temporal aislado, incluido
checksum y `schemaCompatibility`. La base local de Casa ahora la registra, pero
aquella sesión solo verificó ese hecho y no la aplicó. Las migraciones `015` a
`017` y el backend que las exige deben desplegarse siguiendo el orden operativo
de esta guia antes de publicar el workflow semanal. Esta documentacion no
verifica el estado de una base real actual.

El indice parcial existente `ux_embarazo_activo_paciente` cubre unicamente
`WHERE estado = 'activo'`; no impide por si solo combinaciones con `puerperio`
si un escritor omite el bloqueo transaccional. Por ello la proteccion frente a
un embarazo `puerperio` concurrente depende del flujo de escritura que bloquea
la fila de paciente; los accesos directos que omitan ese bloqueo conservan ese
riesgo.

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

