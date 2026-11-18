# Control prenatal 032: fuentes y compatibilidad

La ficha utilizada por el proyecto (`backend/src/assets/mspas/ficha_clinica_embarazo_puerperio.pdf`, 4 páginas) imprime **Nombre y cargo / Atiende** en la página 1 y **Situación fetal / Presentación fetal** en la página 2. Estos últimos son renglones con celdas libres: no enumera sus opciones. El catálogo de la aplicación no debe atribuirse como catálogo impreso u homologado por MSPAS.

La aplicación distingue situación (Longitudinal, Transversa, Oblicua, No determinada) y presentación (Cefálica, Pélvica/podálica, Hombro, Cara, Frente, Compuesta, No determinada). Vacío significa sin evaluar; no se convierte automáticamente en No determinada. Los textos antiguos, incluidos valores fuera de catálogo, se conservan sin reclasificación.

Apoyo terminológico complementario:

- [OPS/CLAP, Guías para el continuo de atención de la mujer y el recién nacido](https://iris.paho.org/xmlui/bitstream/handle/123456789/51740/9789275321355_spa.pdf), p. 113: cefálica, pelviana/podálica y hombro.
- [Ministerio de Salud de Vanuatu, Obstetric, Gynaecology and Newborn Care, 2.ª edición, 2017](https://platform.who.int/docs/default-source/mca-documents/policy-documents/operational-guidance/VUT-MN-21-01-OPERATIONALGUIDANCE-2017-eng-Obstetric-Gynaecology-Newborn-Care-HW-Manual.pdf), p. impresa 83 / PDF 91: cara, frente y compuesta. Es un manual de Vanuatu alojado por OMS, no una norma guatemalteca ni una guía propia de OMS.
- [RCOG, Green-top Guideline 50](https://www.rcog.org.uk/guidance/browse-all-guidance/green-top-guidelines/umbilical-cord-prolapse-green-top-guideline-no-50/), resumen: presentación del cordón describe su relación con la parte fetal presentada y el cuello. Por esta distinción, Funicular no se ofrece como nueva presentación fetal; un registro histórico con ese texto se preserva.

Nombre libre y cargo de catálogo son datos declarados, no identidad ni autoría verificadas. Los consumidores usan el nombre capturado y el snapshot del cargo; no el catálogo vigente ni el perfil del capturista. Sin desglose nuevo, usan el texto combinado histórico intacto. Plan de parto usa solo el nombre nuevo (campo de nombre, máximo 150), con el fallback legado anterior; no concatena ni trunca el cargo. PDF y reportes presentan nombre y cargo, conservando geometría y el contrato `personal_atiende`.

Prueba PDF focal reproducible, sin BD:

```powershell
node backend/test/generateControl032Fixture.js tmp/pdfs/mspas-control-review/controles-sinteticos.pdf
pdftoppm -f 1 -l 2 -scale-to 1800 -png tmp/pdfs/mspas-control-review/controles-sinteticos.pdf tmp/pdfs/mspas-control-review/controles
```
