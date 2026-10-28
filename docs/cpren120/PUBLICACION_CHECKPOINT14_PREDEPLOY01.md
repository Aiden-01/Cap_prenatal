# Publicación controlada de CHECKPOINT-14 y PREDEPLOY-01

2026-10-27, Casa / HP Victus / HUGUITO. Repositorio `C:\cap_prenatal`.
Rama exclusiva: `feature/cpren-120-editor-pdf-notas-clinicas`.
Base local y origin verificados tras fetch:
`0f341d78d9fcfa6bb8178cd1a36bec141adf7b5e`, sin divergencia.
Main local/origin permanece en
`d5fae677fa462af9ca5b7174a46d3ebf21e12196`.

## Autorización y alcance

El propietario comunicó la aprobación visual del PDF de evolución **de dos
páginas** de CHECKPOINT-14 y autorizó respaldar esta entrega en GitHub. Se registra
exactamente esa aprobación, sin extenderla a una aprobación clínica definitiva.
La firma manuscrita permanece exclusivamente en la última hoja.

PREDEPLOY-01 fue revisado: **GO condicionado para preparación; NO-GO para
desplegar**. La publicación del código/documentación no autoriza PR, integración
a main, migraciones, restauraciones ni despliegue. CPREN-120/126 siguen En revisión.

Las evidencias e informes originales describen sus ejecuciones del 25/10. Sus
frases «sin commit/push», «pendiente de revisión» y campos Git son fotografías
históricas anteriores a la autorización actual. PREDEPLOY-01 documenta el estado
observado entonces en AWS; no es una auditoría remota nueva del 27/10. Este
respaldo no accede a AWS, SSH, PM2, n8n ni a datos clínicos reales. El SHA publicado
y su comprobación en GitHub se registran al terminar en Jira y la entrega final.

## Inventario preparado

**68 archivos:** 8 backend, 3 informes, 55 evidencias sintéticas y estos dos
documentos de publicación. El [inventario completo con hashes del contenido Git](publicacion-checkpoint14-predeploy01.json)
enumera cada ruta; excluye su propio hash para evitar autorreferencia.

Backend:

- `backend/src/services/notaClinicaPdf.js`: único archivo productivo; firma mediante
  pdf-lib tras paginar y hueco del pie preservado.
- `backend/test/notaClinicaPdf.test.js`.
- `backend/test/notaClinicaPdfCheckpoint13.test.js`.
- `backend/test/notasClinicasPostgres.test.js`.
- `backend/test/checkpoint14MigracionesPostgres.test.js`.
- `backend/scripts/validateCheckpoint14.cjs`.
- `backend/scripts/verifyCheckpoint14Pdf.py`.
- `backend/scripts/auditClinicalDeployment14.cjs`.

Informes:

- `docs/CPREN_120_CHECKPOINT_14_FIRMA_ULTIMA_HOJA.md`.
- `docs/CPREN_PLAN_DESPLIEGUE_CLINICO_115_126.md`.
- `docs/CPREN_PREDEPLOY_01_AUDITORIA_AWS.md`.

Evidencia en `docs/cpren120/checkpoint14/`: 19 PDF sintéticos, 14 páginas PNG y
una comparación visual, 20 JSON y README. Incluye las cinco muestras principales,
bordes, nombres largos, AE/EP, regresiones y endpoint sintético; resultados de
pruebas, ensayo de migración/restauración desechable, manifiesto e inventario.
No se generaron muestras nuevas ni se modificó ninguna evidencia aprobada.

Las 65 rutas previas de CHECKPOINT-14 coinciden con sus hashes iniciales de
PREDEPLOY-01; el informe PREDEPLOY-01 también conserva su hash original. Los 54
archivos referidos por el manifiesto de evidencia coinciden en tamaño y SHA256.
Se conservan los antecedentes anteriores, logos y migraciones históricas. No se
modifican frontend, main, CPREN-119, n8n, dependencias o scripts de despliegue.

## Revisión de seguridad y verificaciones

Se revisaron inventario y diferencias completos. No hay archivos `.env`, claves
privadas, cookies/sesiones exportadas, logs, dumps PostgreSQL o configuración
confidencial de servicios en los cambios. El análisis de secretos no encontró
claves/tokens reales. Las dos coincidencias de credenciales son fixtures de
JWT/CSRF explícitamente sintéticas en pruebas; la coincidencia de correo es el
nombre de unidad `postgresql@16-main.service`, no una dirección personal.

PREDEPLOY-01 publica únicamente metadatos operativos y agregados autorizados, sin
identificadores ni contenido clínico. Las trazas diagnósticas y scripts SSH de
`tmp_predeploy01/`, los logs de `tmp_cpren14/` y las verificaciones de
`tmp_publish14/` están ignorados y no se preparan para commit. Los nombres/hashes
de dumps en el ensayo 14 corresponden exclusivamente a bases sintéticas temporales;
no se incluyen los archivos de respaldo.

| Verificación de publicación, 27/10 | Resultado |
| --- | --- |
| `git diff --check` e índice preparado | Aprobados |
| JSON, inventario y hashes de evidencia | Aprobados; 54 entradas verificadas |
| Preservación de CHECKPOINT-14 / PREDEPLOY-01 | Sin cambios de contenido |
| Lectura PDF, sin regenerar | 19 documentos / 69 páginas; firma, línea y FIN DE NOTA solo al final |
| Pruebas unitarias/HTTP de PDF, servicio y seguimiento | 18 totales: **16 aprobadas, 0 fallos, 2 opt-in omitidas** |
| Workflow GitHub existente | Solo validación de política/tests; sin pasos de despliegue AWS |

La repetición unitaria usó datos sintéticos, sin habilitar integraciones PostgreSQL
o renderizados opt-in. Su comando desde backend:

```text
node --test test/notaClinicaPdf.test.js test/notaClinicaPdfCheckpoint13.test.js test/notaClinicaPdfHttp.test.js test/notasClinicasService.test.js test/seguimientoNotas.test.js
```

Resultados finales de CHECKPOINT-14 **contrastados ahora con sus logs/resultados
originales**, sin presentarlos como nuevas ejecuciones:

| Suite original | Resultado |
| --- | --- |
| Backend completo | 1420 totales: 1362 aprobadas, 0 fallos, 58 opt-in omitidas |
| Chrome muestras/regresiones | 5/5 |
| Migraciones/restauración desechable | 12/12 |
| Catálogos / autoría / notas | 7/7 · 15/15 · 21/21 |
| Perfiles | 15 aprobadas, 1 navegador omitido |
| Seguimiento | 18 aprobadas, 2 Chrome omitidas |
| Frontend | 191 lógicas + 300 DOM, 26 archivos DOM; 0 fallos |
| Lint / build production | Aprobados |

Los conteos se solapan y no se suman. No se ejecutaron migraciones en esta
publicación, tampoco locales; el ensayo documentado fue sintético y anterior.

## Pendientes conservados

Revisión/cierre institucional, candidato integrado autorizado, restauración real
en aislamiento y ensayo Linux/PG16/Chrome, regularización explícita de cargos y
permisos, ventana y recuperación con escrituras posteriores al respaldo. No se
concede firma electrónica ni se marca una nota como firmada al descargar el PDF.

Publicar únicamente esta rama con push normal, sin force; verificar HEAD local,
origin y ls-remote idénticos y árbol limpio. No acceder a producción para ese
respaldo. No cambiar main/PM2/n8n, crear PR, fusionar, desplegar ni iniciar CPREN-121.
