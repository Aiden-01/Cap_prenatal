# Politica contextual de privacidad para auditoria

## Estado del Sprint 4B.3C

El nucleo contextual ya esta conectado mediante `registrarEventoPrivado` a
los productores no clinicos de autenticacion, usuarios, passwords, roles,
permisos, sesiones, PDF y exportaciones de reportes, ademas de pacientes,
embarazos, controles prenatales con sus laboratorios embebidos, riesgo
obstetrico y vacunas. El camino privado exige
`categoria`, `entidad` y `evento`, construye el payload con
`buildAuditPayload`, ejecuta `auditSanitizer` inmediatamente antes de
`auditRepository` y conserva `politica_version: 1`.

`registrarEvento` permanece temporalmente como camino legado solo para
morbilidad, plan de parto, puerperio clinico, referencias y otros productores
clinicos pendientes. Por
ello no debe afirmarse
todavia que toda la auditoria del sistema aplica la nueva politica.

No se modifican:

- la tabla `auditoria_eventos` ni sus columnas JSONB;
- `schema.sql` o las migraciones;
- eventos historicos;
- archivos `.env` o `.env.example`;
- API, frontend o comportamiento clinico.

Tampoco se modificaron contratos HTTP, permisos, tiempos de sesion, PDFs
oficiales ni reglas clinicas.

## Problema y objetivo

Los productores actuales pueden entregar filas completas obtenidas con
`SELECT *` o `RETURNING *`. Guardarlas otra vez en auditoria crea una segunda
copia nominal y clinica del expediente.

La auditoria debe permitir determinar quien actuo, cuando, que accion realizo,
sobre que entidad y registro y que campos cambiaron. Solo puede conservar los
valores de transiciones operativas expresamente justificadas.

## Contexto obligatorio

`buildAuditDiff(anterior, nuevo, opciones)` recibe el contexto dentro de
`opciones.context`:

```json
{
  "categoria": "usuarios",
  "entidad": "usuario",
  "evento": "cambiar_rol"
}
```

Para autorizar un valor deben coincidir de forma exacta y normalizada:

1. categoria;
2. entidad;
3. evento;
4. campo;
5. tipo y, cuando corresponde, allowlist del valor.

Si falta cualquier elemento del contexto, el campo se trata como `SENSITIVE`.
Una regla de otra entidad o categoria nunca se reutiliza implicitamente.

## Contrato integrado

Los productores migrados llaman exclusivamente:

```js
registrarEventoPrivado(req, {
  contexto: { categoria, entidad, evento },
  accion,
  entidadId,
  usuarioId,
  pacienteId,
  embarazoId,
  cambios: { anteriores, nuevos },
  metadata,
}, { db, obligatorio });
```

`cambios` y `metadata` son entradas para el constructor, no payloads que se
envian directamente al repositorio. El servicio:

1. valida el contexto y la accion contra listas cerradas;
2. construye diff, campos registrados/eliminados o metadata tipada;
3. descarta eventos sin cambio ni metadata efectiva;
4. sanea recursivamente el resultado;
5. deriva modulo, tabla y descripcion desde el contexto;
6. fuerza `ip` y `user_agent` a `null`;
7. entrega al repositorio solo el evento final saneado.

No acepta `req.body`, headers, descripciones libres ni snapshots como payload
final. Los productores migrados no importan `registrarEvento` ni
`utils/auditoria.js`.

## Matriz contextual

| Categoria | Entidad | Eventos permitidos | Campos con valor | Validacion |
| --- | --- | --- | --- | --- |
| `usuarios` | `usuario` | actualizacion y `cambio_rol` | `rol` | codigo controlado |
| `usuarios` | `usuario` | actualizacion, activacion o desactivacion | `activo`, `estado` | booleano o `activo`/`inactivo` |
| `usuarios` | `usuario` | cambios o reinicios de password | `password_cambiado` | solo booleano |
| `permisos` | `usuario_permisos` | reemplazo, asignacion o retiro | `permisos` | deltas de codigos `modulo.accion` |
| `usuarios` | `usuario` | eventos administrativos definidos | `motivo_codigo` | codigo controlado |
| `clinica` | `embarazo` | cambio de estado, cierre o puerperio | `estado_embarazo` | `activo`, `puerperio`, `cerrado` |
| `autenticacion`, `sesiones` | `sesion`, `usuario` | login, logout, creacion, revocacion o expiracion | resultado, motivo, banderas y cantidad revocada | codigos, booleanos o entero |
| `documentos` | `documento`, `exportacion` | crear, generar, exportar o descargar | tipo, formato, cantidad y fechas | codigos, entero o fecha ISO |
| `reportes` | `reporte`, `exportacion` | generar, exportar, descargar o consultar | tipo, formato, cantidad y fechas | codigos, entero o fecha ISO |

`unidad_operativa` no conserva valores en esta version porque aun no existe una
justificacion documentada. El numero de embarazo tampoco se incluye hasta
confirmar que aporta utilidad forense sin duplicar un identificador nominal.

## Categorias de campos

### FULL contextual

`FULL` ya no es una lista global. Solo las coincidencias de la matriz anterior
pueden conservar valor anterior y nuevo.

Los permisos son una excepcion de formato: se comparan como conjunto de
codigos controlados y se generan `permisos_agregados` y
`permisos_retirados`. No se copia la lista completa.

Un campo permitido con un valor de tipo incorrecto o fuera de allowlist se
degrada a `SENSITIVE`; el valor invalido nunca se serializa.

### MASKED

La utilidad de enmascaramiento permanece disponible para una necesidad futura,
pero ninguna regla contextual actual usa `MASKED` para pacientes.

Nombres, CUI, telefonos, correo, direccion, domicilio y ubicacion de pacientes
no conservan iniciales, fragmentos, ultimos cuatro caracteres ni dominio de
correo. Solo se registra el nombre normalizado del campo.

### SENSITIVE

Solo conserva el nombre del campo modificado. Incluye:

- datos personales de pacientes;
- numero de expediente o historia clinica identificable;
- signos vitales, presion, peso, talla y edad gestacional;
- FUR, FPP, VIH, laboratorios y examenes;
- diagnosticos, tratamientos y medicamentos;
- observaciones, antecedentes y cualquier texto libre;
- morbilidad, riesgos, vacunas, puerperio y plan de parto;
- referencias y narrativas clinicas;
- IP y user-agent;
- cualquier campo desconocido.

No se inspecciona el contenido del texto para decidir si es seguro: el texto
libre simplemente no se almacena.

### FORBIDDEN

El campo completo desaparece y ni siquiera se registra su nombre. Esta regla
es recursiva y tiene prioridad absoluta sobre reglas base o extensiones.

Incluye passwords, hashes, tokens, JWT, CSRF, Authorization, cookies, secretos,
API keys, `DATABASE_URL`, objetos de variables de entorno, credenciales SMTP y
credenciales de automatizacion.

La deteccion normaliza mayusculas, acentos, camelCase, snake_case, guiones y
espacios, y funciona dentro de objetos y arreglos.

## Comparacion efectiva

El constructor:

- considera equivalentes `null`, `undefined` y una propiedad ausente;
- ignora el orden de claves de objetos;
- considera significativo el orden de arreglos;
- reconoce fechas ISO equivalentes con zona horaria sin interpretar texto
  arbitrario como fecha;
- no produce campos para valores sin cambios;
- mantiene orden estable en listas y claves del resultado;
- devuelve solo `{ "politica_version": 1 }` si no hay cambios reales.

## Creaciones y eliminaciones

La politica sigue siendo conservadora:

- creacion: solo `campos_registrados`;
- eliminacion: solo `campos_eliminados`;
- nunca se guarda el snapshot creado o eliminado;
- valores nulos no se listan;
- campos `FORBIDDEN` desaparecen tambien de las listas.

Los identificadores internos `id_entidad`, `paciente_id` y `embarazo_id` se
guardan en sus columnas existentes, no dentro del JSON. El camino privado
valida su forma antes de entregarlos al repositorio.

## Productores migrados

- Autenticacion: `login_exitoso`, `login_fallido`,
  `login_usuario_inactivo`, `logout` y `logout_all`.
- Usuarios: creacion, actualizacion nominal por nombre de campo, activacion,
  desactivacion, cambio de rol, cambio/reinicio de password y eliminacion.
- Permisos: reemplazo efectivo con codigos agregados y retirados; una entrada
  sin diferencia no genera evento.
- Sesiones: creacion, revocacion individual o masiva, inactividad, expiracion y
  deteccion de reutilizacion de refresh.
- Documentos: los cuatro PDF clinicos existentes, auditados solo como emision
  documental con tipo e identificadores internos.
- Reportes: Excel y PDF de censos con tipo, formato, periodo validado y cantidad.
- Pacientes: creacion, actualizacion efectiva y sincronizaciones con embarazo;
  solo IDs internos y nombres de campos, nunca valores nominales o clinicos.
- Embarazos: creacion, actualizacion de fechas y cambios de estado; solo
  `activo`, `puerperio` y `cerrado` pueden conservarse como valores.
- Controles prenatales: creacion/upsert, actualizacion y eliminacion existentes.
  Los laboratorios son columnas del mismo control, no una entidad ni evento separado.

## Criticos y best effort

Comparten la transaccion y usan `obligatorio: true`:

- cambio o reinicio de password;
- cambio de rol;
- activacion o desactivacion;
- reemplazo efectivo de permisos;
- eliminacion de usuario;
- creacion y actualizacion de paciente;
- creacion y actualizacion de embarazo;
- transiciones de estado de embarazo;
- creacion, actualizacion y eliminacion de controles prenatales;
- creacion, actualizacion y eliminacion de ficha de riesgo obstetrico;
- creacion, actualizacion y eliminacion de vacunas del embarazo seleccionado;
- las auditorias de sesion que ya eran parte de una operacion atomica, excepto
  expiracion o inactividad automatica.

Permanecen informativos o best effort:

- login y sus fallos;
- logout sin cambio porque la sesion ya estaba revocada;
- inactividad y expiracion automatica;
- generacion de PDF;
- generacion de Excel/PDF de reporte y exportacion de censo.

Una falla best effort se advierte sin romper una descarga ya generada. Una
falla obligatoria se relanza para que el coordinador transaccional haga
rollback.

## Payload permitido por categoria

- Autenticacion: `resultado`, `motivo_codigo`, `metodo`; `usuario_id` solo en
  columna y solo si se conoce.
- Usuarios: `campos_registrados`, `campos_eliminados`, nombres de campos
  sensibles modificados, transiciones de `rol`/`activo` y
  `password_cambiado: true`.
- Permisos: `permisos_agregados` y `permisos_retirados` dentro de `cambios`.
- Sesiones: resultado, motivo controlado, banderas booleanas y
  `cantidad_sesiones_revocadas`; nunca listas de IDs.
- Documentos/reportes: tipo, formato, `desde`, `hasta`, `cantidad_filas`,
  resultado e identificadores internos en columnas.
- Pacientes: `campos_registrados`, `campos_eliminados` o
  `campos_sensibles_modificados`, resultado y motivo controlado. CUI, expediente,
  nombre, telefono, direccion y comunidad aparecen como maximo por nombre de campo.
- Embarazos: los mismos listados de campos, IDs internos y transiciones cerradas
  de `estado_embarazo`. `numero_embarazo`, FUR, FPP y observaciones nunca conservan valor.
- Controles prenatales: IDs internos y `campos_registrados`,
  `campos_eliminados` o `campos_sensibles_modificados`. Signos vitales, fechas,
  numero de control, observaciones y laboratorios aparecen solo por nombre.
  Ningun resultado VIH, positivo/negativo o valor numerico se conserva.
- Riesgo obstetrico: IDs internos y los mismos listados de nombres. Los criterios
  booleanos se agrupan como `factores_riesgo`; nunca se enumeran factores
  agregados o retirados. `tiene_riesgo` solo aparece como nombre cuando cambia
  el resultado generado, sin conservar `true`, `false`, observaciones ni texto.
- Vacunas: IDs internos y nombres de `tipo_vacuna`, `momento`, `numero_dosis` y
  `fecha_dosis`, nunca sus valores. Los antecedentes de otros embarazos y los
  registros legacy son lecturas; no existe productor independiente de escritura
  para `antecedente_vacunacion` ni se inventa un evento.

## Ejemplos permitidos

Cambio clinico, sin valores:

```json
{
  "politica_version": 1,
  "campos_sensibles_modificados": [
    "pa_sistolica",
    "tratamiento"
  ]
}
```

Transicion operativa de embarazo:

```json
{
  "politica_version": 1,
  "cambios": {
    "estado_embarazo": {
      "anterior": "activo",
      "nuevo": "puerperio"
    }
  }
}
```

Cambio de permisos:

```json
{
  "politica_version": 1,
  "cambios": {
    "permisos_agregados": [
      "reportes.exportar"
    ],
    "permisos_retirados": [
      "usuarios.editar"
    ]
  }
}
```

## Extensibilidad segura

`createAuditFieldPolicy` acepta reglas adicionales con categoria, entidad,
evento, campo y tipo. Una extension no puede reclasificar un dato prohibido,
clinico o de texto libre.

Toda ampliacion de valores requiere justificacion de utilidad forense y pruebas
negativas que demuestren que la regla no se aplica fuera de su contexto.

## Limitaciones actuales

- Los productores clinicos de morbilidad, plan de parto, puerperio clinico y
  referencias todavia usan el camino legado.
- No existen actualmente rutas HTTP de eliminacion de paciente o embarazo. El
  contrato privado de eliminacion esta validado, pero este sprint no crea endpoints.
- No existe una API nueva ni cambio en la interfaz de consulta de auditoria.
- No se han transformado eventos historicos.
- El esquema conserva `datos_anteriores` y `datos_nuevos` sin cambios.
- Las mascaras son una utilidad sin reglas activas para pacientes.
- Automatizaciones y otros productores no enumerados no fueron migrados en
  esta fase.

## Migracion siguiente

1. Migrar los demas modulos clinicos registrando
   exclusivamente nombres de campos y transiciones justificadas.
2. Revisar automatizaciones y productores restantes por separado.
3. Disenar el saneamiento de historicos como tarea independiente, con respaldo
   y dry-run.

Cada fase debe mantener el contrato publico de `registrarEvento` hasta que sus
consumidores sean migrados y probados explicitamente.

Sprint 4B.3C no cambio base de datos, `schema.sql`, migraciones, registros
historicos, `.env` ni `.env.example`.
