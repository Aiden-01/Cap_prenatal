# Saneamiento histórico de auditoría

## Estado y alcance

Sprint 4C.2A crea y prueba el artefacto de saneamiento, pero **no lo aplica** a
ninguna base real. Los eventos históricos permanecen intactos hasta la fase
operativa Sprint 4C.2B. No hay cambios de esquema, migraciones, frontend,
contratos HTTP, productores activos ni variables de entorno.

El programa se ejecuta con:

```powershell
Set-Location <RUTA_REPOSITORIO>\backend
npm run audit:history:sanitize -- --dry-run
```

`--dry-run` es el modo predeterminado. Consulta `public.auditoria_eventos` en
una transacción `REPEATABLE READ READ ONLY`, clasifica y valida en memoria,
imprime únicamente estadísticas agregadas y siempre termina con `ROLLBACK`.

## Qué transforma

El saneador conserva todas las filas y las clasifica así:

- A, seguro e intacto: política v1, forma estricta, valores contextuales
  válidos, sin snapshot anterior, IP, user-agent, claves desconocidas ni texto
  libre. No recibe `UPDATE` ni `saneamiento_version`.
- B, legacy derivable: reconstruye desde un objeto vacío nombres de campos,
  transiciones permitidas y metadata cerrada. Nunca copia una propiedad
  legacy directamente.
- C, ambiguo: reemplaza el JSON por un marcador mínimo que indica la
  eliminación conservadora del contenido legacy.
- D, eliminable: existe solo como estadística teórica y debe ser cero. El
  programa no elimina filas.

Todos los eventos B y C reciben `politica_version: 1`,
`saneamiento_version: 1`, `evento_historico_saneado: true`,
`datos_anteriores = NULL`, `ip = NULL`, `user_agent = NULL` y la descripción
exacta definida por la política. C añade `contenido_legacy_eliminado: true`.

Los campos `id`, `usuario_id`, `paciente_id`, `embarazo_id`, `accion`, `tabla`,
`created_at`, `fecha_hora`, `modulo` y `entidad_afectada` no cambian.
`registro_id` e `id_entidad` solo se conservan si son enteros positivos en
texto; también se permite UUID para la entidad de sesión. Un identificador
nominal, CUI, expediente, username o formato no documentado se vuelve `NULL`.

## Qué no transforma

- No elimina eventos ni cambia el número de filas.
- No actualiza eventos A.
- No crea tablas, columnas, índices o constraints.
- No modifica `schema.sql`, migraciones, `.env` o `.env.example`.
- No cambia productores privados, API, frontend ni contratos HTTP.
- No conserva valores personales, clínicos, de red, credenciales, snapshots,
  archivos, HTML, buffers, filas nominales o filtros libres.

Los productores activos ya usan la política privada v1. Este artefacto atiende
exclusivamente el histórico preexistente.

## Riesgo destructivo y reversión

El modo `--apply` destruye de forma deliberada los valores legacy que la
política prohíbe. La transformación es idempotente, pero no reversible desde
la fila saneada. La única reversión posible es restaurar un backup verificado.

Los backups contienen información personal, clínica, de red y posiblemente de
credenciales. Deben cifrarse, limitarse por acceso, transportarse por un canal
autorizado y eliminarse conforme a la política institucional. **Nunca deben
guardarse en Git ni dentro de una carpeta sincronizada o publicada sin la
protección aprobada.**

## Backup antes de una futura aplicación

Usar placeholders; no escribir credenciales en comandos, documentos o
historial de shell. `pg_dump` puede solicitar la contraseña o usar el mecanismo
seguro ya aprobado por la operación.

Backup exclusivo de la tabla:

```powershell
pg_dump --host <HOST> --port <PUERTO> --username <USUARIO> --dbname <BASE> --format=custom --table=public.auditoria_eventos --file "<DIRECTORIO_BACKUP>\auditoria_eventos_<TIMESTAMP>.dump"
```

Backup completo de la base:

```powershell
pg_dump --host <HOST> --port <PUERTO> --username <USUARIO> --dbname <BASE> --format=custom --file "<DIRECTORIO_BACKUP>\cap_prenatal_completo_<TIMESTAMP>.dump"
```

Calcular y registrar SHA-256 en Windows PowerShell:

```powershell
Get-FileHash -LiteralPath "<DIRECTORIO_BACKUP>\auditoria_eventos_<TIMESTAMP>.dump" -Algorithm SHA256
Get-FileHash -LiteralPath "<DIRECTORIO_BACKUP>\cap_prenatal_completo_<TIMESTAMP>.dump" -Algorithm SHA256
```

Comprobar que el archivo custom puede listar su contenido:

```powershell
pg_restore --list "<DIRECTORIO_BACKUP>\auditoria_eventos_<TIMESTAMP>.dump"
pg_restore --list "<DIRECTORIO_BACKUP>\cap_prenatal_completo_<TIMESTAMP>.dump"
```

La existencia del archivo no basta: antes de `--apply`, validar una restauración
en una base nueva y aislada, nunca sobre desarrollo o producción:

```powershell
createdb --host <HOST_AISLADO> --port <PUERTO_AISLADO> --username <USUARIO_AISLADO> <BASE_RESTAURACION_AISLADA>
pg_restore --host <HOST_AISLADO> --port <PUERTO_AISLADO> --username <USUARIO_AISLADO> --dbname <BASE_RESTAURACION_AISLADA> "<DIRECTORIO_BACKUP>\cap_prenatal_completo_<TIMESTAMP>.dump"
```

Verificar en la base aislada el conteo de filas, claves foráneas, acciones y una
muestra operativa autorizada. Registrar fecha, hash, responsable y resultado de
la restauración sin copiar payloads sensibles al acta.

## Procedimiento para ambas computadoras

Cada computadora/base se trata como una ejecución independiente:

1. Confirmar el mismo commit o hash de código del artefacto y dependencias.
2. Ejecutar pruebas unitarias y el dry-run local; comparar solo estadísticas
   agregadas esperadas, no payloads ni IDs.
3. Crear en esa computadora su backup de tabla y backup completo.
4. Registrar SHA-256 y validar `pg_restore --list`.
5. Restaurar el backup en una base aislada y documentar la prueba.
6. No reutilizar la confirmación ni asumir que el backup de una computadora
   protege la base de la otra.
7. En 4C.2B, obtener aprobación explícita antes de cada `--apply`.

## Aplicación futura controlada

No ejecutar este comando durante Sprint 4C.2A. En Sprint 4C.2B, y solo después
de backup verificado, restauración ensayada, ventana aprobada y dry-run revisado:

```powershell
npm run audit:history:sanitize -- --apply --backup-confirmed --confirmation SANITIZE_AUDIT_HISTORY_V1
```

No hay variable ENV nueva para confirmar. Ambas banderas son obligatorias y el
texto debe coincidir exactamente. El proceso abre una única transacción
`SERIALIZABLE`, obtiene un advisory lock transaccional, bloquea las filas,
actualiza solo B/C, vuelve a leer y validar dentro de la misma transacción, y
hace `ROLLBACK` ante cualquier incumplimiento.

## Verificaciones posteriores

Después de una aplicación futura:

1. Conservar las estadísticas agregadas de total, A/B/C/D, acciones, entidades,
   transiciones, tipos PDF e identificadores anulados.
2. Confirmar que el total de filas no cambió y D sigue en cero.
3. Confirmar que B/C no conservan `datos_anteriores`, IP o user-agent y poseen
   ambas versiones en 1.
4. Confirmar que `created_at`, `fecha_hora`, acciones, IDs y claves foráneas no
   cambiaron.
5. Ejecutar nuevamente el comando en `--dry-run`; todas las filas deben quedar
   en A y `filas_que_serian_modificadas` debe ser cero.
6. Mantener el backup hasta cerrar la validación y luego aplicar su retención
   segura. No añadirlo a Git.

## Prueba PostgreSQL aislada

La integración es opt-in y utiliza una tabla temporal `pg_temp`; aborta si el
destino es `public.auditoria_eventos`:

```powershell
$env:RUN_POSTGRES_INTEGRATION = '1'
npm run test:audit-history:postgres
Remove-Item Env:RUN_POSTGRES_INTEGRATION
```

La variable anterior solo habilita una prueba existente; no configura ni
confirma `--apply`. El programa operativo no introduce variables ENV nuevas.
