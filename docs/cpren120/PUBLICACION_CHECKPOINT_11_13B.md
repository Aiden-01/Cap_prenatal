# CPREN-120 / CPREN-126: respaldo autorizado de CHECKPOINT-11 a 13B

2026-10-25, Casa / HP Victus / HUGUITO. Repositorio `C:\cap_prenatal`.
Rama exclusiva: `feature/cpren-120-editor-pdf-notas-clinicas`.
Base local y remota verificada tras `git fetch origin`:
`375da7a5b06f40f3fc0c828f39df326d0ea0c1f9`, sin divergencia.

El propietario confirmó la aprobación visual de las cuatro muestras de 13B y
autorizó el commit y push de los avances locales comprobados de 11/12/13/13B.
Este respaldo conserva ambos issues **En revisión**. La aprobación visual no es
aprobación clínica definitiva: el CAP debe validar la política de firma manuscrita
por hoja o únicamente en la última. El SHA del commit y la comprobación remota
se registran al terminar en Jira y en la entrega de publicación.

## Inventario del paquete

207 archivos: 20 de backend, 1 CSS de frontend, 2 informes de checkpoints,
182 evidencias sintéticas de Casa y este informe con su inventario JSON.

- Backend productivo: repositorio de notas, servicios de notas/PDF y seguimiento.
  Se conserva el contexto autorizado del control, la identidad histórica, la
  idempotencia del responsable externo y el formato institucional compartido.
- Pruebas: migraciones temporales, perfiles/renombrado y sesiones, snapshots,
  seguimiento, contexto/autorización PDF, casos de nombres y paginación.
- Herramientas: `validateCheckpoint11.cjs`, `validateCheckpoint13.cjs` y tres
  verificadores Python de PDF; fixture y pruebas específicas de CHECKPOINT-13/13B.
- Frontend: ajuste responsive de acciones de usuarios en `profesionales.css`.
- Documentación: informes CHECKPOINT-11 y CHECKPOINT-13/13B.
- Evidencias: `checkpoint12/` (99 archivos), `checkpoint13/` (41) y
  `checkpoint13b/` (42), excluyendo sus logs locales. Incluyen 37 PDF, capturas,
  resultados JSON y manifiestos históricos. Los PDF finales aprobados están en
  [`checkpoint13b/pdf/`](checkpoint13b/pdf/).

El [inventario completo](publicacion-checkpoints11-13b.json) enumera rutas, tamaños
y SHA256 de los archivos del paquete. Se excluye el hash del propio inventario
para evitar autorreferencia; Git identifica su contenido en el commit.

Las migraciones 028, 029 y 030, logos institucionales y antecedentes 09/10/11 ya
forman parte de la base `375da7a`; se mantienen en la historia, sin modificaciones
ni nuevas migraciones en este commit. No se modifica contenido de otras ramas.

## Revisión de publicación

Se revisaron diferencias e inventario completo. El análisis de los archivos de
texto no encontró claves privadas ni tokens reales. Las coincidencias de
contraseñas/secretos/cookies son fixtures explícitos de pruebas desechables;
los correos coincidentes usan exclusivamente `example.test`. No hay archivos
`.env`, sesiones exportadas, cookies reales, bases, respaldos ni logs en el paquete.

Se comprobaron los hashes de los tres manifiestos históricos, sin discrepancias,
y se leyeron los 37 PDF / 167 páginas: corresponden a las fixtures sintéticas
documentadas, con expedientes `SYN-` o `SIM-`, sin enlaces, anotaciones ni tokens.
Las capturas comparativas de usuarios y notas muestran cuentas y pacientes de
prueba, sin datos clínicos reales. Los PDF y PNG aprobados no se regeneraron.

Se conservan localmente **30 logs** mediante exclusiones locales específicas de
`.git/info/exclude` para `checkpoint12/*.log`, `checkpoint13/*.log` y
`checkpoint13b/*.log`. No se borran ni se publican. Los manifiestos originales
son fotografías históricas de la evidencia completa local y también enumeran
esos logs; el inventario de publicación enlazado arriba es la referencia de lo
incluido en GitHub. Los `git-state.json` y las frases «sin commit/push» o «pendiente
de revisión visual» de informes anteriores describen el momento de cada captura,
anterior a esta autorización; no representan el estado posterior a la publicación.

## Pruebas y resultados comprobados

Los resultados anteriores se contrastaron con sus logs locales y JSON, conservados
sin alteración. No se presentan como ejecuciones nuevas de esta publicación.

| Evidencia final | Resultado |
| --- | --- |
| Backend 13B | 1419 totales: 1362 aprobadas, 0 fallos, 57 opt-in omitidas |
| Chrome: muestras y regresiones 13B | 5/5, sin omisiones |
| Notas/seguridad/endpoint en PostgreSQL desechable 13B | 21/21, sin omisiones |
| Verificación de formato 13B | 17 PDF / 66 páginas; 12 PNG inspeccionados |
| Frontend 13B | lint y build aprobados |
| Frontend CHECKPOINT-12 | 191 lógicas y 300 DOM aprobadas; lint/build aprobados |
| Integraciones CHECKPOINT-12 | migraciones 7, catálogos 7, perfiles 16, autoría 15, notas 21, seguimiento/UI 20, PDF 2; sin fallos ni omisiones |

En esta publicación se repitió desde `backend`:

```text
node --test test/notaClinicaPdf.test.js test/notaClinicaPdfCheckpoint13.test.js test/notaClinicaPdfHttp.test.js test/notasClinicasService.test.js test/seguimientoNotas.test.js
```

Resultado: **18 totales, 16 aprobadas, 0 fallos, 2 opt-in omitidas**. El primer
intento tuvo dos conexiones localhost bloqueadas por el sandbox (`EACCES`);
la repetición fuera del sandbox pasó. Los rechazos HTTP simulados son aserciones
de seguridad esperadas. No se ejecutaron migraciones en bases persistentes.
También se ejecutaron `git diff --check`, validación JSON, hashes de evidencia
y lectura de privacidad de todos los PDF. No se suman conteos solapados.

## Límites y pendientes

Sin merge a main, despliegue AWS, cambios en datos clínicos reales ni CPREN-121.
Se publica exclusivamente la rama CPREN-120, sin force push. CPREN-120 y CPREN-126
continúan En revisión; queda pendiente validar clínicamente con el CAP la política
de firma manuscrita por hoja y el cierre definitivo de los issues.
