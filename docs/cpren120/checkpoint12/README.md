# CHECKPOINT-12: revisión técnica de CHECKPOINT-11 en Casa

2026-10-25, HP Victus / HUGUITO. Datos exclusivamente sintéticos.
Estado: técnicamente terminado para revisión del propietario, sin aprobación clínica.

El [informe completo](../../CPREN_120_CHECKPOINT_11_SIMPLIFICACION_NOTAS_USUARIOS.md)
documenta alcance, discrepancias históricas, correcciones, pruebas y pendientes.

- [Resultados consolidados](test-results.json).
- [Evolución médica, 10 páginas](pdf/cpren120-nota_evolucion-sintetica.pdf).
- [Enfermería, 10 páginas](pdf/cpren120-nota_enfermeria-sintetica.pdf).
- [Evolución, límite de 20 000 caracteres](pdf/cpren120-nota_evolucion-limite-sintetica.pdf).
- [Enfermería, límite de 20 000 caracteres](pdf/cpren120-nota_enfermeria-limite-sintetica.pdf).
- [Verificación automatizada PDF](pdf-verification.json) y [comparación de páginas](pdf-contact-sheet.png).
- [Páginas renderizadas con Poppler](pdf-pages/) y [comparaciones responsive](visual-comparisons/).
- [Identidad administrativa y reautenticación en Chrome](profiles-browser-evidence.json).
- [Solicitudes del recorrido de notas](http-evidence.json).
- [Manifest SHA256 de evidencias](evidence-manifest.json).

Los logs `backend-final`, `frontend-final`, `frontend-lint` y `frontend-build`
contienen las ejecuciones finales. Cada integración tiene su log y `*-result.json`.
`backend-baseline`/`frontend-baseline` documentan intentos iniciales afectados por
el sandbox; **no se usan como prueba de aprobación**.
`tracking-reproduced-error.log` conserva el fallo 409 externo antes de corregirlo.

Las capturas con la misma denominación en `checkpoint11/` fueron recuperadas del
CAP; las de esta carpeta fueron generadas nuevamente en Casa. Los diálogos y
tablas conservan desplazamiento cuando el contenido supera el área visible.

No se hicieron commit, push, merge a main, despliegues ni migraciones persistentes.
CPREN-120 y CPREN-126 siguen En revisión. El siguiente paso es revisar el formato
y autorizar posteriormente el respaldo en GitHub.
