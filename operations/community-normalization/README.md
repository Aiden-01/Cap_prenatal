# CPREN-127 — Comunidad de residencia

## Contrato

Para un vínculo catalogado, `pacientes.comunidad_id` identifica la comunidad. El nombre, territorio y sector vigentes se leen de `comunidades`, incluso si la comunidad se desactiva o se renombra. Los expedientes, listados, informes, documentos y citas conservan sus campos de respuesta.

Los documentos que precargan la residencia desde la paciente usan la proyección vigente. La residencia escrita expresamente en un plan de parto se conserva como parte de ese documento.

En pacientes sin vínculo, `comunidad` admite texto libre de hasta 150 caracteres y `territorio` y `sector` conservan su captura independiente. El resumen por comunidad mantiene el grupo «Sin comunidad catalogada». El mapa de El Chal y el conteo de casos activos por comunidad usan vínculos explícitos y el municipio de El Chal. Una ubicación libre puede seguir en el expediente sin aparecer en el mapa. La comunidad lingüística sigue siendo independiente.

| Escritura sobre la paciente | Efecto |
| --- | --- |
| Omitir `comunidad_id` | Conserva el vínculo previo, incluso si se envía texto o el catálogo está inactivo. |
| Enviar el ID ya vinculado | Conserva el vínculo y descarta duplicados de nombre, territorio y sector del cuerpo. |
| Enviar un ID nuevo | Exige una comunidad activa del catálogo de El Chal y municipio El Chal. |
| Enviar `comunidad_id: null` | Desvincula. Si se omite el texto libre, conserva como texto el último nombre vigente. Un texto vacío explícito limpia ese valor. |
| Cambiar un municipio vinculado a otro fuera de El Chal | Se exige desvinculación explícita en la misma actualización. Los vínculos históricos con municipio discordante permanecen hasta corregirlos. |

El formulario separa la búsqueda del catálogo de la ubicación guardada. Buscar y salir del campo no cambia la selección. Elegir una comunidad nueva o «No aparece en el catálogo» sí modifica la ubicación.

Los consumidores nominales de n8n reciben el mismo JSON y el nombre resuelto. El límite de 120 unidades de texto en `community` sigue aplicándose únicamente al preparar esos mensajes para respetar sus validadores. El catálogo, la API clínica y la base conservan hasta 150. Los workflows y los resúmenes sin datos nominales conservan sus contratos.

## Inventario agregado previo

Ejecutar consultas de solo lectura en el entorno autorizado. Revisar los totales y cualquier dependencia de columnas de ubicación en integraciones externas antes de aplicar 033.

```sql
BEGIN READ ONLY;

SELECT COUNT(*) AS pacientes,
       COUNT(*) FILTER (WHERE p.comunidad_id IS NULL) AS sin_vinculo,
       COUNT(*) FILTER (WHERE c.id IS NOT NULL AND p.comunidad IS DISTINCT FROM c.nombre) AS nombre_divergente,
       COUNT(*) FILTER (WHERE c.activo IS FALSE) AS vinculadas_a_inactivas,
       COUNT(*) FILTER (WHERE c.id IS NOT NULL AND lower(btrim(coalesce(p.municipio, ''))) <> 'el chal') AS municipio_discordante,
       COUNT(*) FILTER (WHERE p.comunidad_id IS NULL AND lower(btrim(coalesce(p.municipio, ''))) <> 'el chal') AS sin_vinculo_fuera_o_sin_municipio,
       max(char_length(p.comunidad)) AS max_texto_paciente
FROM pacientes p
LEFT JOIN comunidades c ON c.id = p.comunidad_id;

SELECT max(char_length(nombre)) AS max_nombre_catalogo FROM comunidades;

WITH aliases AS (
  SELECT regexp_replace(translate(lower(btrim(alias)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g') AS texto,
         comunidad_id
  FROM comunidades_aliases
), compartidos AS (
  SELECT texto FROM aliases WHERE texto <> ''
  GROUP BY texto HAVING count(DISTINCT comunidad_id) > 1
)
SELECT count(*) AS aliases_compartidos FROM compartidos;

WITH libres AS (
  SELECT id, regexp_replace(translate(lower(btrim(comunidad)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g') AS texto
  FROM pacientes
  WHERE comunidad_id IS NULL AND lower(btrim(municipio)) = 'el chal'
    AND nullif(btrim(comunidad), '') IS NOT NULL
), opciones AS (
  SELECT id AS comunidad_id, nombre AS texto, false AS es_alias FROM comunidades
  UNION ALL
  SELECT comunidad_id, alias, true FROM comunidades_aliases
), claves AS (
  SELECT comunidad_id, es_alias,
         regexp_replace(translate(lower(btrim(texto)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g') AS texto
  FROM opciones
), ambiguas AS (
  SELECT l.id
  FROM libres l
  JOIN claves c ON c.texto <> '' AND (
    l.texto = c.texto OR (c.es_alias AND l.texto LIKE '%' || c.texto || '%')
  )
  GROUP BY l.id HAVING count(DISTINCT c.comunidad_id) > 1
)
SELECT count(*) AS pacientes_con_coincidencias_ambiguas FROM ambiguas;

COMMIT;
```

El inventario sirve para revisión administrativa. Ningún alias ni coincidencia por nombre se convierte en FK mediante 033.

## Migración y recuperación

1. Verificar el destino y sus migraciones. Detener escrituras antes del respaldo para disponer de un punto de restauración consistente. Crear un respaldo completo con `pg_dump -Fc`, verificar que sea legible y comprobar su restauración en otra base aislada antes de intervenir el destino.
2. Ejecutar el migrador versionado. La 033 amplía `pacientes.comunidad`, archiva los valores originales de cada fila ya vinculada en `pacientes_ubicacion_legado`, limpia los duplicados y activa la restricción en una sola transacción. Las filas no vinculadas, las FK, los municipios y las lenguas se conservan.
3. Comparar antes y después los conteos de pacientes y vínculos. El número de filas archivadas inicialmente debe coincidir con las vinculadas antes de migrar. Probar un renombrado con datos sintéticos y verificar expedientes, PDF, reportes, mapa, citas y salidas nominales.
4. Si la migración falla dentro de la transacción, el ejecutor revierte DDL, datos y registro de la migración. Si debe revertirse después de confirmar, mantener las escrituras suspendidas, restaurar el respaldo en otra base y verificar conteos, longitudes y la ausencia del registro 033 antes de volver a la aplicación anterior. Si hubo escrituras después del respaldo, reconciliarlas explícitamente antes del cambio. Reducir `VARCHAR(150)` a 100 podría perder datos nuevos.

La prueba optativa `backend/test/comunidadesNormalizacionPostgres.test.js` crea y elimina su propio clúster en loopback. Con `RUN_CPREN127_TEMP_POSTGRES=1` y, si aplica, `CPREN127_POSTGRES_BIN`, verifica el rollback transaccional, el respaldo restaurado en una segunda base sintética, los vínculos históricos y el resultado de renombrar el catálogo.

Consultar el [diccionario de datos](../../docs/DATA_DICTIONARY.md) para los campos y su semántica.
