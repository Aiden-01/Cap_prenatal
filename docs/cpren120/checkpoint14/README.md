# CHECKPOINT-14 — Firma manuscrita solo en última hoja

2026-10-25, Casa / HP Victus / HUGUITO. Datos exclusivamente sintéticos.
Muestras locales para revisión del propietario; sin commit, push ni despliegue.

- [Evolución breve, 1 hoja](pdf/01-evolucion-breve.pdf).
- [Enfermería EP, nombres largos, 1 hoja](pdf/02-enfermeria-breve.pdf).
- [Evolución, 2 hojas](pdf/03-evolucion-dos-paginas.pdf).
- [Enfermería extensa, 12 hojas](pdf/04-enfermeria-estres.pdf).
- [Última hoja llena, 66 renglones / 2 hojas](pdf/05-evolucion-limite-ultima-hoja.pdf).
- [Comparación visual](contact-sheet.png), [PNG de primeras/últimas](pages/),
  [resultados PDF](pdf-verification.json) y [pruebas](test-results.json).
- [Ensayo de migración/restauración sintético](migration-readiness.json),
  [inventario frente a main](deployment-inventory.json),
  [estado Git](git-state.json) y [manifiesto SHA256](evidence-manifest.json).
- [Informe CHECKPOINT-14](../../CPREN_120_CHECKPOINT_14_FIRMA_ULTIMA_HOJA.md).
- [Plan de despliegue, no ejecutado](../../CPREN_PLAN_DESPLIEGUE_CLINICO_115_126.md).

Cada documento tiene exactamente una línea y un rótulo de firma, en su última
página real. Las anteriores conservan identificación y número, sin firma.
FIN DE NOTA únicamente al terminar la narrativa. No se generan hojas para firmar.
Firma manuscrita no equivale a captura finalizada ni a firma electrónica.

`boundaries/`, `regression/` y `endpoint/` conservan pruebas nuevas con datos
sintéticos (incluidos AE, nombres máximos y autorizaciones HTTP en PostgreSQL
desechable). Total: 19 PDF / 69 páginas, 14 PNG inspeccionados.
Las evidencias 09–13B no se alteraron. Logs de ejecución locales en
`tmp_cpren14/logs/`, ignorados. No se guarda ningún dump en esta carpeta.

CPREN-120/126 En revisión. Falta revisión final de 14, preparación productiva
autorizada, respaldo real restaurado y validación del release en Linux/CAP.
No hubo acceso a AWS, cambios en n8n ni migraciones persistentes.
