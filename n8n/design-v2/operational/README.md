# Pipeline vigente: generacion, pruebas y actualizacion controlada

Estas instrucciones preparan un cambio revisable. No acreditan que el codigo local este desplegado ni autorizan acceso productivo, importacion, reinicio, envio o activacion. El flujo vigente es resumen ejecutivo mas Excel completo, con n8n nativo y ExcelJS 4.4.0; no Docker ni pantalla adicional de Inasistencias.

## Generacion y pruebas locales

`generate.cjs` carga `../components.cjs`, `views.cjs`, `nominal-attachment.cjs`, los seis `baseline/*.json` y `../previews/workflow-baseline.json`. Verifica hashes, conserva conexiones/configuracion y limita el delta de nodos a constructores, contratos de nombres completos y bindings binarios aprobados. El estado canonico esperado es inactivo.

Desde la raiz:

```text
node n8n/design-v2/operational/generate.cjs --check
node --test n8n/design-v2/operational/test.cjs n8n/design-v2/operational/phase4/safety.test.cjs n8n/design-v2/operational/summary-excel/retirement.test.cjs n8n/design-v2/operational/reminder-copy/message.test.cjs
```

`validate.cjs` solo permite ExcelJS al ejecutar fragmentos Code con fixtures sinteticos. `phase4/guard.cjs` impide PostgreSQL real, TCP externo y lectura de entornos reales. Las pruebas HTTP de aplicacion, cuando correspondan, usan servidores efimeros y dependencias simuladas en loopback. Ninguna prueba requiere importar ni activar workflows oficiales.

Las validaciones normales no escriben evidencia. Los resultados de una corrida se conservan fuera del repositorio. La opcion explicita de evidencia usa `CAP_PRENATAL_EVIDENCE_DIR` externo, sin sobrescribir resultados previos. Las fechas de las citas se tratan como calendario operativo; no se convierten a UTC para redactar el correo.

## Antes de una ventana de actualizacion n8n

1. Obtener autorizacion especifica para el entorno y la ventana. Confirmar version n8n fijada y compatibilidad del importador CLI instalado; si cambia la version, repetir ensayo aislado y no extrapolar resultados antiguos.
2. Confirmar los IDs de los seis workflows, pertenencia al proyecto, permisos y versiones exportadas actuales. Verificar individualmente `active=false`, `activeVersionId=null`, ejecuciones en curso y ausencia de cambios concurrentes. Si no se cumple, detener el procedimiento.
3. Coordinar despliegue de backend y workflows por nombres completos/limite 150. Resolver destinatario institucional unico autorizado y credenciales por un canal seguro; nunca incluirlos en el repositorio ni en informes.
4. Verificar ExcelJS 4.4.0 en el contexto real del Code node y task runner, resolucion de modulos, allowlist limitada a `exceljs`, almacenamiento binario y compatibilidad del transporte Resend. El launcher local es preparacion local, no prueba de configuracion Ubuntu.
5. Completar un ensayo nativo con perfiles y workflows sinteticos en un entorno autorizado. No usar los oficiales para pruebas. Comprobar fechas, IDs, contador e historial, proyecto/propietario/tags, ausencia de envio y rollback antes de habilitar una ventana real.

## Respaldo y procedencia de fechas

Antes de importar, guardar exportacion actual de definiciones y metadatos, snapshot consistente de SQLite mediante el mecanismo de backup soportado y configuracion/clave de cifrado en un directorio protegido fuera de Git. No copiar un SQLite activo como si fuera respaldo consistente; si el mecanismo requiere detener el servicio, obtener permiso de ventana y comprobar restauracion aislada. Registrar hashes, permisos, integridad y ubicacion protegida sin publicar contenidos sensibles.

El CLI necesita fechas ISO 8601 con zona explicita, normalizadas a UTC (`Z`). Preferir las fechas ya exportadas por el CLI instalado. Un valor SQLite sin zona NO se convierte agregando `Z` a ciegas: establecer procedencia UTC segun esquema/driver de la version instalada, validar calendario, precision y roundtrip, o detenerse. Esta regla corresponde a metadatos de workflows, no a fechas clinicas de calendario.

## Actualizacion mediante CLI

Usar exclusivamente el ejecutable n8n nativo fijado y el perfil/proyecto autorizados. El cambio debe prepararse desde la exportacion fresca, preservar IDs y metadatos no autorizados y aplicar solo el delta revisado; no importar directamente JSON locales con identidad ajena al entorno.

La operacion futura es `import:workflow` con archivo revisado, proyecto explicito y `--activeState=false`. No incluir comandos de activacion o publicacion. Los archivos y opciones concretos se revisan para cada ventana; los scripts historicos de CPREN-87 no son el procedimiento ejecutable actual.

En n8n 2.34.4, el importador genera una nueva `versionId` y el contador se gestiona sobre el estado importado/actual. Antes de cada importacion, usar el `versionCounter` vigente de una lectura/exportacion fresca; no reutilizar el contador del respaldo original. Tras importar, volver a exportar y comprobar la nueva version y el incremento esperado en el ensayo para esa version instalada, historial conservado, fechas UTC sin perdida de precision y contenido exacto autorizado. No editar SQLite ni forzar valores de version para eludir discrepancias.

## Rollback y verificacion posterior

Si hay desviacion, detener el procedimiento; no reintentar automaticamente. Preparar rollback con las definiciones protegidas, pero con el contador vigente leido despues de la importacion fallida/parcial. Una restauracion por CLI es otra revision: conserva el contenido anterior pero genera nueva identidad de version/incremento de contador; no borra el historial para fingir que nada paso.

Exportar y comparar despues de actualizar y despues de restaurar: seis IDs, fechas, contenido aprobado, conexiones/settings, estados inactivos/no publicados, propietario/proyecto/tags, credenciales sin cambios y ninguna ejecucion ni envio provocado por la operacion. La restauracion completa de base/configuracion es una contingencia separada que exige permiso, ventana y prueba de integridad.

## Puertas pendientes antes de activacion

Confirmar destinatario, credenciales, acceso institucional y custodia del Excel; verificar runtime y binarios en el entorno destino; completar prueba sintetica nativa sin envio, autorizacion separada para entrega real y revision de presentacion/limites de adjuntos; validar coordinacion backend/contratos, respaldo y rollback. Activacion requiere autorizacion expresa independiente. Los oficiales deben seguir intencionalmente inactivos hasta entonces.

## Antecedentes

Los directorios de fases y procedimientos anteriores se mantienen fisicamente locales, excluidos por rutas precisas. Incluyen estados de runtime y ventanas que pudieron cambiar. Su resultado actual es **No verificable** sin evidencia nueva suficiente; no confundir bitacoras locales con un despliegue presente ni repetir un envio por conservar un marcador antiguo.
