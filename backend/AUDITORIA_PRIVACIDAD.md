# Politica contextual de privacidad para auditoria

## Estado del Sprint 4B.1

Este sub-sprint crea y endurece un nucleo aislado para construir payloads de
auditoria minimos. El nucleo esta exportado y probado, pero todavia no se
conecta a `registrarEvento` ni a ningun productor.

No se modifican:

- la tabla `auditoria_eventos` ni sus columnas JSONB;
- `schema.sql` o las migraciones;
- eventos historicos;
- archivos `.env` o `.env.example`;
- API, frontend o comportamiento clinico.

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

## Matriz contextual

| Categoria | Entidad | Eventos permitidos | Campos con valor | Validacion |
| --- | --- | --- | --- | --- |
| `usuarios` | `usuario` | `actualizar`, `cambiar_rol` | `rol` | codigo controlado |
| `usuarios` | `usuario` | `actualizar`, `cambiar_estado` | `activo`, `estado` | booleano o `activo`/`inactivo` |
| `usuarios` | `usuario` | cambios o reinicios de password | `password_cambiado` | solo booleano |
| `usuarios` | `usuario` | asignacion o retiro de permisos | `permisos` | codigos `modulo.accion` |
| `usuarios` | `usuario` | eventos administrativos definidos | `motivo_codigo` | codigo controlado |
| `clinica` | `embarazo` | cambio de estado, cierre o puerperio | `estado_embarazo` | `activo`, `puerperio`, `cerrado` |
| `seguridad`, `sesiones` | `sesion`, `usuario` | autenticacion, revocacion o expiracion | `resultado`, `motivo_codigo`, banderas de sesion | codigos o booleanos |
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

Los identificadores internos `entidad_id`, `paciente_id` y `embarazo_id`
podran agregarse como metadata cuando se conecten los productores. Este nucleo
todavia no los incorpora ni cambia el contrato existente.

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

- El nucleo no se utiliza en `auditService.js`.
- Los productores actuales conservan su comportamiento previo.
- No existe API ni interfaz de consulta para esta politica.
- No se han transformado eventos historicos.
- El esquema conserva `datos_anteriores` y `datos_nuevos` sin cambios.
- Las mascaras son una utilidad sin reglas activas para pacientes.

## Migracion gradual siguiente

1. Incorporar contexto e identificadores internos en autenticacion y usuarios.
2. Migrar roles y permisos usando deltas de codigos.
3. Migrar pacientes sin valores nominales o de ubicacion.
4. Migrar embarazo conservando solo estados operativos permitidos.
5. Migrar modulos clinicos registrando exclusivamente nombres de campos.
6. Migrar documentos, reportes, sesiones y automatizaciones con sus allowlists.
7. Disenar por separado el saneamiento de historicos, con respaldo y dry-run.

Cada fase debe mantener el contrato publico de `registrarEvento` hasta que sus
consumidores sean migrados y probados explicitamente.
