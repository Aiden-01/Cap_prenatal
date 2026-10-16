# Resumen ejecutivo y Excel completo: contratos y validacion vigente

Implementacion local para revision. Este documento no acredita despliegue, importacion ni activacion productiva. Los seis correos usan componentes institucionales V2; los oficiales deben permanecer intencionalmente inactivos y sin publicar hasta superar las puertas del procedimiento operativo.

## Matriz funcional

| Correo | HTML | Adjuntos |
| --- | --- | --- |
| Recordatorio de citas | Fecha operativa, total y aviso de listado | Una hoja: Citas programadas |
| Seguimiento de inasistencias | Resumen de nuevas y pendientes, aviso de adjunto | Nuevas inasistencias y Pendientes anteriores |
| Seguimiento Tdap | Resumen de oportunidades y pendientes | Nuevas oportunidades Tdap y Pendientes de Tdap, contrato original preservado |
| Dos censos de primer control | Periodo y resumen institucional V2 | Excel del servicio de reportes, transporte conservado |
| Watchdog de calidad | Resumen agregado institucional V2 | Sin listado nominal nuevo |

Recordatorio e Inasistencias usan Fecha de cita, Nombre completo, Telefono y Comunidad. Los nombres completos se reciben mediante `first_name`/`last_name`, limite 150 por campo; SQL conserva filtros, categorias, periodos y orden por primer componente. Tdap conserva sus campos anteriores. Las celdas se escriben como texto literal, incluyendo ceros iniciales y cadenas parecidas a formulas; el Excel serializado se reabre y valida antes de devolver un item al transporte. Si falla, no se devuelve un item enviable.

El HTML ejecutivo no contiene filas nominales, telefonos ni comunidades del fixture. No usa FULL/SUMMARY/AUTO, umbral experimental de 80000 bytes ni enlace a la pantalla de Inasistencias retirada. `safeReturn` conserva solamente destinos internos generales permitidos y no concede permisos.

## Pruebas portables

- `../fixtures.cjs`: datos sinteticos construidos en memoria, sin exportaciones ni SQLite.
- `../validate.cjs`: adaptador VM acotado a ExcelJS; no ejecuta grafos n8n ni transporte.
- `validate.cjs`: compara contratos no visuales contra los seis baselines versionables e invariantes de generacion. Ya no usa `backups/` ni `before-hashes.json`.
- `../test.cjs`: casos normales y de volumen, integridad del generador, deriva de baseline y texto literal.
- `retirement.test.cjs`: ausencia de pagina/endpoint descartados, rechazo de Excel corrupto/incompleto y estados vacios.
- `../reminder-copy/message.test.cjs`: nombres de meses, fechas limite/bisiestas, independencia respecto a `generated_at` y celdas/estructura del XLSX, sin resultados historicos ni archivos de salida.
- `backend/test/n8nNominalFullNames.test.js`: consultas contra un adaptador simulado, invariantes SQL, nombres completos y extremo de 150 caracteres. No necesita PostgreSQL ni copia privada de fuentes.

Desde la raiz:

```text
node n8n/design-v2/operational/generate.cjs --check
node --test n8n/design-v2/operational/test.cjs n8n/design-v2/operational/phase4/safety.test.cjs n8n/design-v2/operational/summary-excel/retirement.test.cjs n8n/design-v2/operational/reminder-copy/message.test.cjs
```

Desde `backend`: `npm test`, sin habilitar variables de integracion PostgreSQL. Desde `frontend`: `npm test`, `npm run lint` y `npm run build` en un arbol desechable cuando se exige que toda evidencia/cache quede fuera del repositorio. Los tests HTTP locales usan loopback con servicios simulados; las integraciones reales son validaciones separadas pendientes, no se simulan como realizadas.

La validacion es de solo lectura por defecto. `validate(true)` requiere un directorio externo explicito en `CAP_PRENATAL_EVIDENCE_DIR`; rechaza rutas dentro del repositorio y evita sobrescritura de evidencia. Los dos mapas de hashes historicos ya no son dependencias y permanecen locales junto a los respaldos. Los baselines y `previews/workflow-baseline.json` SI deben versionarse.

## Runtime y actualizacion

n8n nativo, sin Docker; ExcelJS 4.4.0 debe estar disponible en el Code node y runner del entorno destino. El launcher local valida la version y restringe modulos externos a `exceljs`; no demuestra aprovisionamiento remoto. Backend y validadores con limite 150 requieren coordinacion de actualizacion.

Para actualizacion CLI, metadatos UTC con procedencia comprobada, contador de version vigente, respaldo consistente y rollback, seguir `../README.md`. No ejecutar scripts historicos de importacion o envio como parte de las pruebas ni activar oficiales para comprobarlos.

## Limites y pendientes

Las medidas y envios de fases anteriores son antecedentes: **No verificable** para el estado presente sin nueva evidencia suficiente. No reutilizar sus IDs/resultados para acreditar estos cambios. Las pruebas de VM demuestran contratos sinteticos, no entrega de correo, presentacion en clientes ni funcionamiento del runtime n8n destino.

Antes de activar: confirmar encargada/destinatario unico autorizado, credenciales por canal seguro, integridad y transporte binario real, limites del proveedor/buzon y privacidad del Excel, ensayo sintetico nativo, respaldo y rollback, autorizacion separada de envio/activacion. No se incorporan secretos, datos clinicos identificables ni respaldos a Git.
