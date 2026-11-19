# Diccionario de datos territorial

| Tabla y campo | Tipo | Significado |
| --- | --- | --- |
| `comunidades.id` | `INTEGER`, PK | Identidad estable de la comunidad del catálogo de El Chal. |
| `comunidades.nombre` | `VARCHAR(150)`, obligatorio | Nombre vigente. Cambiarlo modifica las lecturas de los registros ya vinculados. |
| `comunidades.territorio`, `comunidades.sector` | `SMALLINT` de 1 a 4, `CHAR(1)` A/B | División territorial vigente de la comunidad. |
| `comunidades.activo` | `BOOLEAN` | Disponibilidad para nuevas selecciones. Un registro inactivo puede conservar vínculos. |
| `pacientes.comunidad_id` | `INTEGER`, FK nullable a `comunidades.id` | Única relación territorial con el catálogo. |
| `pacientes.comunidad` | `VARCHAR(150)`, nullable | Ubicación declarada libre o histórica sin FK. Con vínculo es NULL. La API utiliza este nombre de campo para proyectar el nombre vigente o el texto libre, según corresponda. |
| `pacientes.territorio`, `pacientes.sector` | `VARCHAR(100)`, `VARCHAR(80)`, nullable | Valores libres o legados sin FK. Con vínculo son NULL y la API proyecta los valores vigentes como texto. |
| `pacientes.municipio` | `VARCHAR(100)`, nullable | Municipio declarado. Las nuevas vinculaciones al catálogo requieren El Chal. |
| `pacientes.comunidad_linguistica` | `VARCHAR(80)`, nullable | Comunidad lingüística declarada. Independiente de residencia, sector, territorio y catálogo. |
| `pacientes_ubicacion_legado.paciente_id` | `INTEGER`, PK/FK a `pacientes.id` | Identifica la paciente cuyo vínculo existía antes de 033. El archivo se elimina en cascada si se elimina la paciente. |
| `pacientes_ubicacion_legado.comunidad_id_original` | `INTEGER`, obligatorio | ID original antes de 033. Se conserva como dato histórico si posteriormente cambia la relación. |
| `pacientes_ubicacion_legado.comunidad`, `territorio`, `sector` | `VARCHAR(150)`, `VARCHAR(100)`, `VARCHAR(80)`, nullable | Valores originales de filas vinculadas al migrar. Archivo interno de reconciliación y recuperación, sin exposición en la API ni actualización en cambios futuros. |
| `comunidades_aliases.comunidad_id`, `alias` | FK a `comunidades.id` y texto; único por par | Alias históricos. Un alias puede identificar más de una comunidad; el mapa usa la FK de la paciente. |

`pacientes_ubicacion_catalogada_check` exige que nombre, territorio y sector físicos estén vacíos si existe una FK. La proyección de lectura y los límites de integración se describen en [CPREN-127](../operations/community-normalization/README.md).
