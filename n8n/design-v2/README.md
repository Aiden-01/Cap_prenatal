# CAP Prenatal: correos institucionales V2

Este directorio contiene las fuentes locales y las pruebas de los seis correos institucionales V2. Los JSON canonicos estan en `n8n/workflows/`. Su inclusion en Git no demuestra importacion, despliegue ni activacion en ningun servidor.

## Arquitectura vigente

- Runtime n8n nativo, version fijada por `package.json` y `scripts/start-n8n-local.ps1`; sin Docker.
- Componentes compartidos en `components.cjs`, vistas en `operational/views.cjs` y generador en `operational/generate.cjs`.
- Recordatorio, Inasistencias y Tdap muestran resumen ejecutivo y adjuntan el Excel completo. No incluyen listas nominales en el HTML ni un enlace a la pantalla descartada.
- Recordatorio e Inasistencias generan su binario con ExcelJS 4.4.0 en `operational/nominal-attachment.cjs`. El contenido se reabre y valida antes de devolver el item al transporte. Tdap conserva su contrato de adjunto; los censos conservan su transporte binario.
- Backend entrega nombres y apellidos completos en las claves existentes `first_name` y `last_name`, con limite 150, para recordatorio e inasistencias. Backend y validadores n8n deben actualizarse de forma coordinada.
- Los seis workflows oficiales se mantienen intencionalmente inactivos y sin version publicada hasta superar la revision de activacion. Esta es una condicion requerida, no una comprobacion nueva de produccion.

## Fuentes e integridad

`operational/baseline/*.json` y `previews/workflow-baseline.json` son entradas inmutables de integridad anteriores a V2. Son necesarios para reproducir los canonicos; no son respaldos privados ni deben regenerarse a partir del estado V2. `previews` no se excluye completo por esa dependencia.

Desde la raiz del repositorio, con las dependencias del lockfile instaladas:

```text
node n8n/design-v2/operational/generate.cjs --check
node --test n8n/design-v2/operational/test.cjs n8n/design-v2/operational/phase4/safety.test.cjs n8n/design-v2/operational/summary-excel/retirement.test.cjs n8n/design-v2/operational/reminder-copy/message.test.cjs
```

`--check` no escribe workflows. `--plan` produce candidatos y `--apply` modifica los canonicos locales: requieren una tarea de cambio revisada; no son comandos de validacion ni despliegue automatico. Ninguno importa o activa workflows en n8n.

Las pruebas ejecutan unicamente fragmentos Code con fixtures sinteticos, dentro de una VM sin acceso al transporte real; no ejecutan los grafos oficiales en n8n. No necesitan respaldos privados, SQLite, resultados historicos ni una pantalla de Inasistencias. Las pruebas funcionales de backend/frontend se ejecutan con dependencias locales y servicios simulados.

## Evidencia y antecedentes

Por defecto, la validacion no escribe evidencia. Para guardar resultados sinteticos de forma explicita se requiere `CAP_PRENATAL_EVIDENCE_DIR` apuntando fuera del repositorio y llamar `validate(true)`; se rechaza el repositorio como destino y se evita sobrescribir archivos existentes. Las suites normales no guardan HTML, XLSX ni JSON de resultados.

Maquetas Fase 2, FULL/SUMMARY/AUTO, pantalla retirada, ensayos SSH/CLI y envios anteriores son antecedentes locales excluidos de Git. No deben reejecutarse para validar el pipeline actual. Resultados historicos sin evidencia vigente suficiente: **No verificable**. Jira CPREN-89 registra el alcance de esta preparacion; Notion no es fuente de gestion.

El procedimiento vigente y sus puertas de respaldo, CLI, UTC, versionado y rollback estan en `operational/README.md`. La matriz de contratos y pruebas esta en `operational/summary-excel/README.md`.
