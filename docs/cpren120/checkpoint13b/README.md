# CHECKPOINT-13B — PDF para revisión visual

2026-10-25. Casa / HP Victus / HUGUITO. Datos exclusivamente sintéticos.

- [Evolución breve, 1 página](pdf/01-evolucion-breve.pdf).
- [Enfermería breve con nombres largos, 1 página](pdf/02-enfermeria-breve.pdf).
- [Evolución multipágina, 2 páginas](pdf/03-evolucion-dos-paginas.pdf).
- [Enfermería de estrés, 12 páginas](pdf/04-enfermeria-estres.pdf).
- [Comparación visual](contact-sheet.png) y [páginas PNG](pages/).
- [Informe vigente de CHECKPOINT-13/13B](../../CPREN_120_CHECKPOINT_13_AJUSTES_FINALES_PDF.md).
- [Verificación PDF](pdf-verification.json), [pruebas](test-results.json) y [preservación](preservation.json).

Identificación a 9 puntos. Sin leyenda administrativa y sin campo Capturista
cuando no se dispone de identidad histórica comprobada. Los PDF del endpoint
actual omiten ese campo. `boundaries/nombres-limite-historico.pdf` demuestra la
regla positiva con una identidad histórica exclusivamente sintética, no con datos
ni snapshots completados en una base real.

`regression/` conserva ejecuciones nuevas de los casos de 20 000 caracteres;
`boundaries/` verifica los límites de página y nombres; `endpoint/` contiene PDF
obtenidos con autorización real contra PostgreSQL desechable.

Evidencias 11/12/13 preservadas. Sin commit, push ni cambios de producción.
CPREN-120/126 siguen En revisión. Política de firma por hoja pendiente de
validación clínica; estas muestras esperan revisión visual del propietario.
