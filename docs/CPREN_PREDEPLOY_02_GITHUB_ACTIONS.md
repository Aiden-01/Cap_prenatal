# PREDEPLOY-02 — Validación clínica Linux mediante GitHub Actions

2026-11-01, America/Guatemala. Preparación en Casa / HP Victus / dispositivo Huguito.
**Segundo ensayo completado: FAILURE del lector de estado del sandbox; permisos corregidos.**
CPREN-120 y CPREN-126 permanecen **En revisión** por instrucción expresa.

**Primera ejecución autorizada por el propietario (2026-11-01):** se autoriza
revisar, crear un commit y hacer push exclusivamente a la rama clínica para
disparar su primer ensayo. No se autoriza main, PR, AWS ni despliegue. La
publicación posterior del informe con resultados requiere otra autorización.
Primer commit publicado: `607866cf015939edabb928a14014f6b7078e64e4`.
El propietario autorizó después un segundo commit/push limitado a las cuatro
rutas revisadas, para corregir permisos y permitir un único segundo ensayo.
No autoriza un tercer intento ni publicaciones posteriores sin nueva aprobación.

## Segundo ensayo real — cierre sin tercera ejecución

Segundo commit completo: **`23dc463eb27a6e121f599422871979531fc82c15`**.
Contiene exclusivamente las cuatro rutas autorizadas. Un único push a la rama
clínica; HEAD local y remoto idénticos. No hubo main, PR, AWS, n8n productivo,
migraciones persistentes ni instalaciones en la Victus. docs/tesis preservado.

- [Segundo workflow publicado](https://github.com/Aiden-01/Cap_prenatal/blob/23dc463eb27a6e121f599422871979531fc82c15/.github/workflows/clinical-predeploy02.yml).
- [Segundo run 41355992542](https://github.com/Aiden-01/Cap_prenatal/actions/runs/41355992542), evento push, attempt 1 de ese run nuevo.
- Job `clinical` / `124996007506`: **22:12:57–22:14:44 UTC**,
  **16:12:57–16:14:44 Guatemala**, 2026-11-01; **107 segundos**.
- Resultado final **failure**, exit **1** del preflight. El error de permisos
  anterior quedó resuelto; **cero fases de suites clínicas iniciadas**.

| Control previo | Resultado efectivo del segundo run |
| --- | --- |
| Acceso clinical-ci | **PASS**: script legible, Chrome ejecutable, Node20/24, Python, pg_dump/pg_restore y Git en checkout comprobados como ese usuario antes de configurar Git |
| ACL / privilegios | Preparación **success**, 34 s; búsqueda nominativa con máscara conservada, sin chmod global ni sudo añadido al usuario |
| Identidad y candidato | Verificaciones de Linux/GitHub-hosted, repositorio/ref, usuario y SHA pasadas; sin diferencias productivas frente al candidato |
| Red | **PASS de las sondas**: rechazo de salida hacia TEST-NET IPv4 e IPv6, después de instalar reglas por UID; loopback/service PG funcionan |
| PostgreSQL | **16.15**, versión, base sintética, marcador y directorio del service comprobados; sin aplicar 023–030 |
| Chrome / sandbox | Chrome **148.0.7778.97** arrancó. Namespace, PID/network namespaces y seccomp activos según chrome://sandbox; sin flags que desactiven sandbox |
| Verificador de sandbox | **FAIL del harness**, por esperar una etiqueta de texto diferente; no porque Chrome declarara el sandbox desactivado |

El artefacto conserva el texto real que produjo el fallo:

```text
Layer 1 Sandbox                 Namespace
PID namespaces                  Yes
Network namespaces              Yes
Seccomp-BPF sandbox              Yes
Seccomp-BPF sandbox supports TSYNC Yes
You are adequately sandboxed.
```

El código exigía `/Namespace sandbox\s+Yes/i`. Esa etiqueta no aparece en esta
interfaz de Chrome148. Se clasifica como **Error del parser/contrato de diagnóstico
del harness**, no como fallo funcional del CAP ni sandbox inactivo. El navegador
reportó además Yama Broker Yes y Non-broker No; esos campos se conservan en el
resumen original y no se confunden con namespace/seccomp.

El controlador llegó a `preflight_stage=chrome-sandbox`, registró el rechazo de
red y terminó en **3.038 s**; el paso Actions duró 4 s. `phases=[]` confirma que no
se inició ninguna suite. La comprobación global de preflight sigue **fallida**,
aunque las observaciones de permisos, red y sandbox sean positivas.

| Runtime/componente | Versión real observada |
| --- | --- |
| OS / runner | Ubuntu **24.04.5 LTS**, runner **2.338.2**, GitHub-hosted ubuntu-24.04 |
| Node aplicación / npm | **v20.20.2 / 10.8.2** |
| Node Vitest / npm | **v24.22.1 / 11.19.1**; Vitest no llegó a ejecutarse |
| PostgreSQL service | **16.15 (Debian 16.15-1.pgdg12+2)** |
| Clientes PG del runner | **16.15 (Ubuntu 16.15-1.pgdg24.04+2)** |
| Chrome / Puppeteer | **Chrome/148.0.7778.97 / 24.43.1** |
| Python | **3.12.3** |

El banner de Actions informa imagen `20261025.353.1`; la variable ImageVersion
capturada en el artefacto informa `20261026.354.1`. Se conservan ambos valores
sin afirmar identidad de esas dos etiquetas. No afecta a la confirmación de
Ubuntu24.04.5 ni acredita equivalencia exacta con AWS.

| Etapas del segundo run | Aprobadas / fallidas / omitidas | Duración / exit |
| --- | --- | --- |
| backend | — / — / — | No ejecutado |
| frontend-logic / frontend-dom | — / — / — | No ejecutados |
| lint / build | — / — / — | No ejecutados |
| pdf-samples / pdf-geometry | — / — / — | No ejecutados |
| checkpoint10 / checkpoint14 | — / — / — | No ejecutados |
| catalogos / perfiles / autoria | — / — / — | No ejecutados |
| notas / seguimiento | — / — / — | No ejecutados |
| auth-sessions / citas-postgres | — / — / — | No ejecutados |

No existen conteos TAP/Vitest de estas 16 fases: no se presentan como aprobadas
ni como omisiones individuales. Migraciones023–030, datos/snapshots, cargos,
permisos, usuarios/correo/sesiones, notas/seguimiento, controles/citas, frontend,
lint/build y PDF siguen pendientes de validación Linux. **No se generaron PDF,
renders ni capturas clínicas sintéticas**.

### Evidencia conservada y bloqueo pendiente

Se publicó **un artefacto**, ID **13103336930**, ZIP de **3146 bytes**, que contiene
solo run-summary.json. Se descargó a la carpeta temporal ignorada y se verificó
su SHA256 contra el digest de Actions:
`7bc84ccbe481676265b19f9efbd69e56f58c94b8afd02caf669835a3274bc57e`.

- [Artefacto del run](https://github.com/Aiden-01/Cap_prenatal/actions/runs/41355992542/artifacts/13103336930).
- [Resumen original local](../tmp_predeploy02/second-run-41355992542/run-summary.json).
- [Metadatos y extractos sanitizados locales](../tmp_predeploy02/second-run-41355992542/evidence.json).

Los archivos temporales no forman parte de otro commit. No se guardan URLs
firmadas de descarga, credenciales ni logs completos en el informe/Jira. El
workflow n8n intacto pasó en el mismo SHA:
[run 41355992511](https://github.com/Aiden-01/Cap_prenatal/actions/runs/41355992511).

**NO-GO para avanzar a staging privado**: falta la ejecución clínica completa y
su evidencia PDF. El siguiente cambio necesario sería adaptar el lector de
chrome://sandbox en `.github/clinical/run-predeploy02.cjs`, exigiendo los campos
reales Layer1=Namespace, PID/Network=Yes y Seccomp-BPF=Yes, con casos negativos.
Ese archivo está **fuera de las cuatro rutas autorizadas**. No se modificó ni se
preparó otra corrección, commit, push o tercer ensayo. Requiere nueva autorización.

El informe de este resultado se actualiza **solo localmente** después del segundo
commit; no se publica. CPREN-120/126 permanecen En revisión. No hay autorización
de producción ni de restaurar un respaldo real.

## Preparación del segundo ensayo autorizado

Se revisaron completas las tres diferencias y el JSON nuevo del primer run.
Rama/HEAD inicial coinciden con `607866cf015939edabb928a14014f6b7078e64e4`;
Casa / dispositivo Huguito. Se preservan docs/tesis y los worktrees main/hotfix,
sin pull sobre el árbol con cambios.

La ACL concede exclusivamente búsqueda `--x` al usuario clinical-ci sobre los
ancestros necesarios. Se usa `setfacl -n` con máscara explícita: conserva una
máscara existente con x, o incorpora solo x si antes no había ACL extendida.
Una máscara extendida restrictiva sin x hace abortar para revisión, evitando
ampliar permisos efectivos de entradas ajenas. No hay chmod global, lectura,
escritura ni sudo nuevos para clinical-ci. Las herramientas acl se instalan solo
en el runner remoto.

Antes de Git se comprueba como clinical-ci: lectura del script, Chrome ejecutable,
versiones Node20/24, Python, pg_dump/pg_restore y acceso Git al checkout. Se
registra namei y un marcador explícito de acceso verificado. Firewall, sandbox,
identidad y separación de runtimes se conservan sin cambios. La segunda ejecución
confirmó el acceso; su fallo posterior y los límites están documentados arriba.

## Primera ejecución real — resultado y recomendación

- [Workflow publicado en el SHA exacto](https://github.com/Aiden-01/Cap_prenatal/blob/607866cf015939edabb928a14014f6b7078e64e4/.github/workflows/clinical-predeploy02.yml).
- [Run 41354289172, attempt 1](https://github.com/Aiden-01/Cap_prenatal/actions/runs/41354289172), evento push.
- Job `clinical`: 2026-11-01 **21:53:23–21:55:02 UTC**
  (**15:53:23–15:55:02 Guatemala**), duración **99 segundos**.
- Estado final **failure**; preparación con **exit code 128**.
- [Evidencia sanitizada por etapa](predeploy02/run-41354289172.json).

**NO-GO para continuar a staging privado con este resultado.** El candidato no
llegó a probarse: se acredita parte del aprovisionamiento, no compatibilidad
funcional Linux. No demuestra un defecto funcional del CAP. No se relanzó el run
ni se publicó otro commit para buscar un resultado verde.

| Paso observado | Resultado | Duración | Exit code verificable |
| --- | --- | ---: | --- |
| Inicializar service PostgreSQL | Success, healthy | 24 s | API no expone código numérico |
| Checkout del SHA clínico | Success | 4 s | API no expone código |
| Instalar Node24 / registrar ruta | Success | 1 s / <1 s | API no expone código |
| Instalar Node20.20.2 | Success | 4 s | API no expone código |
| Instalar lockfiles/herramientas PDF | Success | 31 s | API no expone código |
| Preparar usuario/red/Chrome | **Failure** al acceder al checkout | 28 s | **128** |
| Pruebas clínicas | **Skipped** por dependencia fallida | No ejecutado | No existe |
| Upload | Success del paso, **sin archivos / cero artefactos** | <1 s | No acredita publicación |
| Detener service/limpiar red Docker | Success | 3 s | API no expone código |

Versiones reales observadas en los logs:

| Componente | Verificado | Límite |
| --- | --- | --- |
| Sistema | Ubuntu **24.04.5 LTS**, imagen **20261025.353.1**, runner **2.338.2** | GitHub-hosted; sin self-hosted |
| Node aplicación | **v20.20.2**, npm **10.8.2** | Instalado y `--version`; suites no ejecutadas |
| Node Vitest | **v24.22.1**, npm **11.19.1** | Instalado; Vitest Linux no corrió |
| PostgreSQL | **16.15 (Debian 16.15-1.pgdg12+2)**, x64 | Service healthy y ALTER DATABASE sintético; sin migraciones clínicas |
| Chrome | **Google Chrome for Testing 148.0.7778.97** | Descargado y `--version`; no se lanzó navegador para PDF |
| GITHUB_TOKEN | Contents read, Metadata read | Confirmado; sin secretos CAP referenciados por el job |

Los actions v4 usan su runtime interno forzado a Node24 por GitHub, según aviso
del runner. Es independiente del Node20 instalado para aplicación y de Node24
reservado para Vitest.

No hay reportes de pruebas ni exit codes de las etapas siguientes. Los guiones
no significan aprobadas ni omisiones individuales de TAP/Vitest: el paso completo
de ejecución fue omitido. Son runtimes **previstos**, no utilizados por pruebas.

| Etapa | Runtime previsto | Aprobadas / fallidas / omitidas | Duración / exit |
| --- | --- | --- | --- |
| backend | Node20.20.2 | — / — / — | No ejecutado |
| frontend-logic | Node20.20.2 | — / — / — | No ejecutado |
| frontend-dom | Node24 | — / — / — | No ejecutado |
| lint | Node20.20.2 | — / — / — | No ejecutado |
| build | Node20.20.2 | — / — / — | No ejecutado |
| pdf-samples | Node20.20.2 / Chrome148 | — / — / — | No ejecutado |
| checkpoint10 (027→030) | Node20.20.2 / PG16.15 | — / — / — | No ejecutado |
| checkpoint14 (022→030) | Node20.20.2 / PG16.15 | — / — / — | No ejecutado |
| catalogos | Node20.20.2 / PG16.15 | — / — / — | No ejecutado |
| perfiles | Node20.20.2 / PG16.15 / Chrome | — / — / — | No ejecutado |
| autoria | Node20.20.2 / PG16.15 | — / — / — | No ejecutado |
| notas | Node20.20.2 / PG16.15 / Chrome | — / — / — | No ejecutado |
| seguimiento | Node20.20.2 / PG16.15 / Chrome | — / — / — | No ejecutado |
| auth-sessions | Node20.20.2 / PG16.15 | — / — / — | No ejecutado |
| citas-postgres | Node20.20.2 / PG16.15 | — / — / — | No ejecutado |
| pdf-geometry | Python / Poppler | — / — / — | No ejecutado |

Migraciones 023–030, conservación, cargos, permisos, correo/sesiones, notas,
seguimiento, controles/citas, lint/build y PDF siguen sin validación Linux. No hay
nuevos PDF, renders, capturas sintéticas ni artefactos para descargar. Se guardan
metadatos y extractos sanitizados; no el log completo en el repositorio.

### Causa y corrección local propuesta

Error exacto: `fatal: failed to stat '/home/runner/work/Cap_prenatal/Cap_prenatal': Permission denied`.
Ocurrió en `sudo -H -u clinical-ci git config --global ...`. El chown recursivo
del checkout no garantizó atravesar sus directorios padre para el nuevo UID.
El padre exacto que impide el recorrido **no fue inventariado**; no se atribuye
a un permiso concreto de /home/runner sin prueba. Es un **Error real del harness
de permisos**, no del producto ni una incompatibilidad Node/Vitest.

El script terminó antes de instalar el firewall por UID y antes de comprobar
namespace/seccomp en chrome://sandbox. Por tanto, **restricción de red y sandbox
efectivo: No verificable en este ensayo**. No se ejecutó ninguna prueba sin ellos.

Corrección preparada localmente, **no ejecutada en Linux ni publicada**:

1. Añadir `acl` solo a los paquetes del runner remoto.
2. Sustituir el chmod global del temporal por ACL de búsqueda `--x` solo para
   clinical-ci en los ancestros necesarios del checkout/temporales, sin
   lectura/listado/escritura de los padres ni sudo para ese usuario.
3. Registrar `namei -l` y comprobar acceso al script, Chrome, ambos Node, Python,
   pg_dump/pg_restore y checkout como clinical-ci antes de configurar Git.
   Conservar firewall y sandbox; no recalcular máscaras ACL ajenas.

Se sigue la [sintaxis oficial de setfacl](https://manpages.ubuntu.com/manpages/noble/man1/setfacl.1.html).
La corrección requiere revisión y otra ejecución autorizada. No se desactivaron
pruebas o protecciones. El workflow n8n intacto terminó en **success** en este SHA:
[run 41354289073](https://github.com/Aiden-01/Cap_prenatal/actions/runs/41354289073).
Ese resultado no valida el módulo clínico ni implica un cambio productivo de n8n.

## Alcance y estado

Candidato: `Aiden-01/Cap_prenatal`, rama
`feature/cpren-120-editor-pdf-notas-clinicas`, candidato base
`74a458a6e9621c74982c1de13ee1ee2ef99fa7a7`; HEAD publicado
`23dc463eb27a6e121f599422871979531fc82c15` (local/remoto idénticos).
Se leyeron el plan clínico 115–126, PREDEPLOY-01 y CHECKPOINT-14 antes de preparar
esta fase. Los documentos anteriores describen sus fechas/SHAs históricos;
no deben interpretarse como el estado actual de Git.

Se preservó el directorio previo sin seguimiento `docs/tesis/`. No se hizo pull
porque el árbol inicial no estaba limpio. Se publicó un commit autorizado de
20 archivos; no hubo PR, merge, cambios de main ni acceso a AWS. No se instaló software en la Victus,
ni se ejecutó PostgreSQL local, WSL, VM o Docker. Solo se utilizaron herramientas
ya instaladas para pruebas y comprobaciones de sintaxis.

**Compatibilidad clínica Linux: pendiente, no verificable.** El primer run falló
en preparación; no autoriza despliegue ni prueba con un respaldo real.

## Evaluación de GitHub Actions y cuotas

La API conectada confirmó el repositorio **público**, no archivado y con main
como rama predeterminada. Antes de esta publicación solo existía el workflow
`.github/workflows/n8n-email-policy.yml`: push/pull_request, ubuntu-latest,
Node 22, pruebas de política n8n/backup-monitor. No contiene despliegue y se
conserva sin cambios. Su ejecución para este mismo candidato fue exitosa:
[run 40623936110](https://github.com/Aiden-01/Cap_prenatal/actions/runs/40623936110),
2026-10-28 UTC. **Esa prueba no acredita la validación clínica Linux solicitada.**

Según [la documentación de facturación de GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
el cómputo de runners estándar para repositorios públicos es gratuito y no consume
la asignación de cómputo incluida. Se propone un único runner estándar
ubuntu-24.04, sin larger runner, matriz ni caché npm. Los artefactos se retienen
7 días y el almacenamiento tiene límites propios. No se afirma saldo disponible
ni espacio restante de la cuenta.

**No verificable:** plan de la cuenta, saldo/almacenamiento, presupuestos,
restricciones administrativas de acciones permitidas, obligatoriedad de SHA,
concurrencia efectiva y configuración actual de GITHUB_TOKEN. El conector rechazó
el endpoint de permisos de Actions como no soportado. El intento de lectura por
navegador terminó porque el control de Windows no pudo verificar con confianza
la URL de Opera. No se cambiaron ajustes ni se intentó eludir ese control.
Un run anterior exitoso demuestra habilitación en aquel momento, no garantiza
que todas las acciones nuevas estén permitidas hoy.

Los [límites oficiales](https://docs.github.com/en/actions/reference/limits)
incluyen 6 horas por job hospedado y concurrencia variable según cuenta. Esta
propuesta se limita a **45 minutos** por job y 10 minutos por fase de pruebas;
la concurrencia cancela el ensayo anterior de esta misma rama si llega otro push.
Antes del push autorizado debe verificarse en Settings/Actions y Billing que no
exista un bloqueo administrativo o de almacenamiento. No se asume cuota privada
ni se propone un runner en la Victus como alternativa.

**Comprobación previa a la primera publicación, 2026-11-01 21:48 UTC:** API
pública GitHub: workflow n8n `active`, artefactos totales **0**. No se observó
bloqueo efectivo. La credencial HTTPS de Git no está disponible en modo no
interactivo para consultar endpoints administrativos; no se ampliaron permisos
ni se cambiaron Settings/Billing. La comprobación pública no acredita saldo,
capacidad total de cuenta ni las políticas administrativas no observables.
En aquella consulta el remoto seguía en `74a458a…`. Tras el push se ejecutaron
los actions fijados y se aprovisionó el runner, sin bloqueo efectivo. Esto no
acredita el saldo ni las políticas completas de cuenta. Main/hotfix están intactos.

## Workflow propuesto y activación futura

Archivo: [clinical-predeploy02.yml](../.github/workflows/clinical-predeploy02.yml).

| Propiedad | Preparación |
| --- | --- |
| Evento | Solo push a la rama clínica exacta; job comprueba repositorio/ref |
| Runner | GitHub-hosted `ubuntu-24.04`, x64 |
| Permisos | `contents: read`; checkout sin persistir credenciales |
| Node de aplicación/pruebas | `20.20.2`, versión registrada en PREDEPLOY-01 |
| Node de Vitest | `24`, instalado únicamente en el runner; versión real en reporte |
| PostgreSQL | Service `16.15-bookworm`, digest Linux amd64 fijado |
| Chrome | Chrome for Testing `148.0.7778.97`, sin sustitución automática |
| Dependencias | `npm ci` con lockfiles vigentes, sin modificar versiones |
| Salida | Reportes, PDF/PNG sintéticos y manifiesto SHA256; retención 7 días |
| Acciones | checkout/setup-node/upload-artifact fijadas a SHA verificado |
| Despliegue | Ninguno; sin SSH, environments, OIDC ni secretos CAP |

Se usa push porque permite publicar el workflow exclusivamente en esta rama sin
registrarlo previamente en main. No hay workflow_dispatch, pull_request_target,
schedule ni workflow_run. Un push autorizado disparará además el workflow de
política ya existente por sus propios eventos; esta entrega no lo modifica.
El filtro evita ejecutar este nuevo job en main u otras ramas del repositorio.

La primera ejecución se publicó con la autorización recibida tras revisar
este inventario. Su resultado está al comienzo del informe.
El workflow
comprueba que el commit ejecutado descienda de `74a458a…` y que backend/src,
frontend/src, package.json y lockfiles no difieran del candidato. Si cambia el
producto, debe revisarse y actualizarse explícitamente el ancla; no se omite el
control para obtener un resultado favorable.

## PostgreSQL temporal y cobertura clínica

El único service usa credenciales públicas **inventadas, exclusivas del ensayo**,
base de control `cap_predeploy02_control` y publicación loopback
`127.0.0.1:55432`. No hay volumen persistente. Se verifica imagen, versión 16,
directorio del contenedor y marcador sintético de la base de control. Cada suite
crea su propia base vacía; rechaza nombres preexistentes y elimina exclusivamente
su base y sus bases auxiliares de la lista permitida. El helper solo admite
Linux/GitHub-hosted, repositorio/ref exactos y opt-in explícito. Nunca acepta un
destino de `.env`, DB_*, PGHOST o DATABASE_URL para esos siete harnesses.

Se reutilizan `migrate`/`applyMigration` y las pruebas existentes. No se editan
migraciones SQL ni el esquema del producto. El comportamiento anterior con
initdb sigue disponible fuera de CI; esta sesión no lo ejecutó.

| Fase | Comprobaciones preparadas |
| --- | --- |
| checkpoint14 | Schema/migraciones anteriores del SHA main `d5fae677…`, bootstrap hasta 022, usuarios y expedientes inventados, upgrade oficial 023–030, conservación exacta de pacientes/embarazos/controles/citas/sesiones/cuentas y permisos previos |
| Integridad | Checksums del registro contra SQL, rechazo de una variante alterada de 030 sin escribir el archivo histórico, registro intacto, segunda ejecución y bootstrap final |
| checkpoint10 | Estado intermedio 027→030, snapshots históricos, RESTRICT, contradicciones/duplicados MED/AE/EP, rollback por migración, retiro de Especialidades y clasificación |
| catalogos | Catálogo activo de cargos, unicidad, HTTP, auditoría y concurrencia |
| perfiles | Usuarios legados, email obligatorio en altas, unicidad, edición nombre/username, revocación de sesiones y recorrido UI escritorio/móvil |
| autoria | Permisos clínicos separados de rol y cargo, directorio mínimo, elegibilidad MED/AE/EP y rechazo de atribuciones implícitas |
| notas | Pertenencia, permisos, CSRF, borrador/finalización, versión, idempotencia, snapshots, auditoría obligatoria y PDF autorizado médico/enfermería |
| seguimiento | Controles nuevos frente a históricos, confirmaciones por tipo, concurrencia y dos recorridos UI de editor/recuperación/errores |
| auth-sessions | Migrador oficial en otra base vacía, login HTTP real con bcrypt y sesión PostgreSQL; actividad y throttling, rollback de fixtures |
| citas-postgres | Suite SQL existente de invariantes, relaciones e integridad de citas; base temporal propia |
| backend/frontend | Suites completas pertinentes, calendario/citas/auth/permisos/controles incluidas; lint y build en producción |

El runner base puede mostrar opt-in omitidos; se informan, sin sumarlos como
aprobados. Las selecciones clínicas, browser, auth y citas deben reportar pruebas
reales, **cero omitidas/canceladas/fallidas** y exit code 0. Las fases continúan
tras un fallo ordinario para reunir resultados independientes; el resultado
agregado será fallido. Un fallo de preflight impide iniciar pruebas.

El ensayo existente de CHECKPOINT-14 incluye dump/restore **solo sintético** antes
y después del upgrade. Los dumps se eliminan y nunca se suben como artefactos.
No es una restauración real del CAP ni acredita recuperabilidad del respaldo AWS.
La restauración real queda pendiente en infraestructura privada, separada y
expresamente autorizada por el propietario.

## PDF Linux y sandbox

Se regenerarán las cinco muestras de CHECKPOINT-14: evolución breve (1 página),
enfermería EP con nombres largos (1), evolución continua (2), enfermería de estrés
(12) y última hoja de 66 renglones (2). También se ejecutan bordes 32/33/34 y
65/66/67, nombres máximos, AE, regresiones extensas y dos PDF del endpoint real.

El verificador exige narrativa completa normalizada sin pérdida/duplicación,
fecha/hora originales, dos logos proporcionados, caracteres especiales, carta,
márgenes, identificación y numeración en todas las hojas, firma/línea solo en la
última, FIN DE NOTA solo al final, separación entre texto/pie/firma y ausencia de
hojas vacías o adicionales. La paginación de las referencias 13B sigue siendo
obligatoria donde existe antecedente. Las diferencias de posición de los rótulos
frente a **Windows/13B** se miden y registran en CI; la tolerancia histórica de
0.1 pt entre ejecuciones Windows no se interpreta como equivalencia entre SO y
fuentes. Se mantienen las comprobaciones geométricas absolutas y de separación.

Poppler renderiza las páginas seleccionadas y genera una hoja de contacto para
revisión humana posterior. Ni el upload ni el análisis geométrico constituyen
aprobación visual institucional. Ningún render Linux nuevo existe aún.

La consulta de metadatos al [catálogo oficial Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json)
encontró `148.0.7778.97`, revisión `1610480`. **No se descargó Chrome en la PC.**
Su descarga y versión binaria Linux se comprobaron; el navegador aún no se probó. Si deja de estar disponible o
falla, el job falla sin fallback. Si posteriormente se autoriza otra versión,
debe registrarse y no afirmarse equivalencia exacta con AWS.

Los tres helpers UI usan ahora las opciones de lanzamiento existentes del
producto; se retiran los dos `--no-sandbox` anteriores. Ubuntu 24.04 puede exigir
una excepción de AppArmor para Chrome descargado. Se prepara un perfil limitado
al ejecutable fijado, siguiendo la [alternativa por ruta de Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md)
y las [recomendaciones de Puppeteer](https://pptr.dev/troubleshooting).
No se desactiva AppArmor global, no se cambia sysctl y no se usan flags para
desactivar el sandbox. El preflight exige namespace sandbox y seccomp-BPF activos
en `chrome://sandbox`, además de registrar la versión real del navegador.

## Seguridad, evidencias y diferencias con AWS

Instalación de dependencias y Chrome: únicamente en el runner, usando registros
públicos y fuentes oficiales. Antes de las pruebas se crea `clinical-ci`, sin
sudo, con entorno explícito `env -i`. No recibe GITHUB_TOKEN, claves SSH,
configuración Resend/Drive/n8n, variables VITE de producción ni archivos .env.
El checkout rechaza archivos .env distintos de la plantilla admitida.

Reglas IPv4/IPv6 por UID rechazan salida externa del usuario de pruebas; permiten
loopback y exclusivamente el IP/puerto del service PostgreSQL tras DNAT. El
preflight comprueba rechazo hacia direcciones reservadas para documentación,
nunca hacia AWS/CAP. El agente de GitHub conserva su usuario/red para subir los
artefactos. No se modifica la red del equipo personal ni de producción.

Los logs crudos quedan en disco efímero fuera del upload. El reporte publica
comandos, conteos, nombres de pruebas fallidas y códigos, sin cuerpos HTTP,
cookies ni tokens. Solo después del filtro de publicación se copian JSON/PNG/PDF
sintéticos al directorio `tmp_predeploy02/publish`. Se rechazan symlinks,
extensiones inesperadas, claves privadas y patrones de tokens en JSON. Si falla
preflight/publicación se entrega únicamente el resumen controlado. No se suben
dist, bases, respaldos, .git, node_modules, .env ni logs generales.

El resumen vincula SHA, run/attempt, fechas UTC, Node/npm/Puppeteer/Chrome/PG,
imagen de runner y PostgreSQL, lockfiles, hashes de migraciones, estado del sandbox
y resultados por fase. La imagen PostgreSQL se fija al digest amd64 publicado
`sha256:cf5d353f55240ecc2f811827a15c7d1f2d562f08019b49dca12b5a59f4ab5962`,
consultado en [Docker Hub oficial](https://hub.docker.com/v2/repositories/library/postgres/tags/16.15-bookworm).
Se registra además el identificador real de imagen utilizado por Docker.

Este entorno no replica Nginx, TLS, PM2, systemd, memoria/CPU t3.small, permisos
del usuario ubuntu, jobs n8n, extensiones/grants/configuración de la base real,
fuentes instaladas ni tráfico productivo. Node20/Chrome148/PG16 coincidentes por
versión no prueban equivalencia operativa completa con AWS. Las versiones de AWS
citadas proceden de PREDEPLOY-01; no se revalidaron remotamente en esta sesión.

**Diferencia identificada y ajuste autorizado:** Vitest `5.0.0` del lockfile declara Node
`^22.12.0 || ^24.0.0 || >=26.0.0`; Vite admite `^20.19.0 || >=22.12.0` y jsdom
admite Node20.19+. Backend, integraciones PostgreSQL, navegador/PDF, pruebas
lógicas frontend, lint y build permanecen en Node **20.20.2**. La instalación
frontend y las pruebas DOM de Vitest usan Node **24** en pasos controlados;
el ejecutable se conserva antes de restaurar Node20 al PATH principal. Cada fase
registra runtime, duración, aprobadas/fallos/omisiones y exit code; Vitest usa su
reporte JSON para obtener los conteos sin interpretaciones optimistas. No se
modifican dependencias, lockfiles, Vitest ni Node del servidor. La prueba DOM en
Node24 valida ese tooling; no se presenta como una ejecución Vitest en Node20.

## Inventario local para autorización

**7 archivos nuevos:**

- `.github/workflows/clinical-predeploy02.yml`.
- `.github/clinical/prepare-predeploy02.sh`.
- `.github/clinical/run-predeploy02.cjs`.
- `.github/clinical/predeploy02-requirements.txt`.
- `backend/test/helpers/predeploy02Service.js`.
- `backend/test/predeploy02Safety.test.js`.
- `docs/CPREN_PREDEPLOY_02_GITHUB_ACTIONS.md`.

**13 archivos existentes modificados en ese commit**, exclusivamente herramientas/pruebas:

- `backend/scripts/verifyCheckpoint14Pdf.py`.
- `backend/test/{autoriaClinicaPostgres,catalogosPostgres,checkpoint10MigracionesPostgres,checkpoint14MigracionesPostgres,notasClinicasPostgres,perfilesProfesionalesPostgres,seguimientoNotasPostgres}.test.js`.
- `backend/test/{notaClinicaPdf,notaClinicaPdfCheckpoint13}.test.js`.
- `backend/test/helpers/{notasCheckpoint09Browser,perfilesBrowser,seguimientoNotasBrowser}.js`.

Total: **20 archivos publicados en el primer commit**. `tmp_predeploy02/` está ignorado e incluye
herramientas temporales de preparación, no forma parte del inventario a publicar.
`docs/tesis/` es previo y ajeno a esta entrega. Sin cambios de código productivo,
SQL histórico, dependencias, lockfiles ni workflow n8n existente.

## Verificación local y siguiente paso

Ejecuciones nuevas en **Windows / Node v24.11.1 / npm 11.21.0**, sin PostgreSQL:

| Comprobación | Resultado |
| --- | --- |
| Backend `npm test` | 1421 pruebas: 1363 aprobadas, 0 fallos, 58 opt-in omitidas |
| Frontend `npm test` | 191 lógicas + 300 DOM, 26 archivos DOM, 0 fallos |
| Frontend lint | Exit code 0 |
| Frontend build, NODE_ENV=production | Exit code 0 |
| Selección final seguridad/PDF sin navegador | 4 aprobadas, 2 opt-in omitidas; no nueva generación PDF |
| Sintaxis JS/Python/Bash y YAML | Comprobación estática; no sustituye ejecutar GitHub Actions |
| Git | Diff sin errores de whitespace; sin cambios productivos ni staging |

Aviso informativo de Browserslist desactualizado, sin actualizar dependencias.
Revisión previa al primer commit: el nuevo reporte JSON de Vitest se probó con
Node24 local. Dentro del sandbox Windows, 41 pruebas pasaron pero **22 archivos**
fallaron al inicializar por ENOENT en temporales del aislamiento (exit1). Tras
analizar esa evidencia se repitió fuera del sandbox con las mismas pruebas y
dependencias: **300/300**, sin fallos ni omisiones, exit0. Se clasifica como
incidencia del entorno de pruebas local; no se modificó el producto ni se omitió
la primera ejecución fallida. El reporte CI también registra errores de suites.
Git Bash existente comprobó únicamente `bash -n`; el sandbox Windows requirió
repetir esa lectura de sintaxis fuera del aislamiento. No se ejecutó el script
de preparación en Windows. Las consultas de Chrome/Docker fueron solo metadatos.

Segundo commit/push y segunda ejecución completados. Solo este informe queda
modificado localmente después de publicar el segundo commit. Sigue pendiente
autorizar una corrección del lector de sandbox fuera del alcance anterior y
obtener conteos clínicos y PDF en otro ensayo; no se ha iniciado un tercero.
**NO-GO para avanzar a staging privado por falta de validación clínica Linux.**
La restauración real sigue separada y requiere autorización expresa. Sin
autorización de producción ni criterios para cerrar CPREN-120/126.

Cuatro rutas autorizadas para el segundo commit: este informe,
`docs/predeploy02/run-41354289172.json`, `.github/clinical/prepare-predeploy02.sh`
y `.github/workflows/clinical-predeploy02.yml` (**4 rutas**). Las dos últimas
contienen la corrección de permisos y acl ya comprobada por el segundo ensayo.

## 2026-11-02 — Parser de Chrome148 corregido solo localmente

Autorización actual: corregir el lector, probarlo sin Chrome y documentarlo.
**No autoriza commit, push ni tercer workflow.** Se conserva íntegro el contenido
local previo de este informe; esta sección añade la corrección al historial.
Casa / dispositivo Huguito. Rama clínica y HEAD siguen en
`23dc463eb27a6e121f599422871979531fc82c15`, con tracking sin adelantos/atrasos.
Se preservan docs/tesis y los worktrees main/hotfix; no se hizo pull sobre el
árbol con cambios ni reset, clean o checkout.

### Causa y contrato implementado

El segundo run falló por exigir `/Namespace sandbox\s+Yes/i`, etiqueta ausente
en Chrome148. Su diagnóstico real decía Layer1=Namespace, PID/Network=Yes,
Seccomp-BPF=Yes y `You are adequately sandboxed.`. Ese fallo era del lector;
no equivale a protecciones desactivadas ni a una prueba de migraciones023–030.

Se introduce un único helper puro `validateChromeSandboxStatus`, compartido por
el runner y las pruebas. No lee archivos, red o entorno, ni inicia procesos.
Consume el diagnóstico completo como entradas de etiquetas y valores exactos,
independientes del orden, y exige conjuntamente:

- Layer 1 Sandbox = Namespace.
- PID namespaces = Yes.
- Network namespaces = Yes.
- Seccomp-BPF sandbox = Yes.
- Mensaje global exacto `You are adequately sandboxed.`.

Solo colapsa espacios ASCII, tabulaciones y finales LF/CRLF/CR. No convierte
mayúsculas, valores, puntuación o espacios Unicode. No busca un Yes genérico ni
acepta subcadenas positivas. Rechaza entradas no textuales/vacías, obligatorios
ausentes o con No/valor distinto, texto desconocido/truncado y mensajes globales
ausentes/negativos. Todo campo o confirmación repetido se rechaza, incluso si los
valores repetidos coinciden; así tampoco se acepta información contradictoria.

Las tres filas auxiliares conocidas (TSYNC y Yama Broker/Non-broker) no acreditan
ningún obligatorio. El No de Yama Non-broker en el texto real se conserva sin
confundirlo con un No de PID/Network/seccomp. Las filas auxiliares admiten valores
Yes/No exactos y también rechazan duplicados; no sustituyen los cinco controles.
Se resuelve primero la etiqueta larga TSYNC para no confundirla con seccomp.
Una etiqueta futura desconocida provoca rechazo hasta revisar el contrato.

El runner mantiene `chrome://sandbox`, la versión Chrome148 fijada y el rechazo
de flags que desactivan protecciones. Solo después de validar guarda el resumen
estructurado `chrome_sandbox_checks` y el diagnóstico original. Un rechazo lanza
`PREDEPLOY02_CHROME_SANDBOX_UNSAFE`: se conserva la salida fallida del preflight,
se cierra el navegador mediante finally y no se alcanza ninguna suite clínica.
No cambian ACL, firewall, identidad, credenciales, esquemas ni código productivo.

### Pruebas y verificación local focalizada

Comando ejecutado en Windows, **Node v24.11.1**:

```text
node --test --test-reporter=tap backend/test/predeploy02ChromeSandbox.test.js backend/test/predeploy02Safety.test.js
```

Resultado nuevo: **23 pruebas aprobadas** (22 parser + 1 seguridad), **0 fallos,
0 omitidas, 0 canceladas**, exit0. La fixture textual reproduce únicamente el
diagnóstico genérico del navegador, sin datos del servidor ni credenciales.

| Cobertura solicitada | Resultado |
| --- | --- |
| Texto real del segundo ensayo | Aceptado |
| Tabulaciones/espacios, LF/CRLF/CR, líneas vacías y valores/etiquetas repartidos por saltos de línea | Aceptados |
| PID=No, Network=No o Seccomp=No | Rechazados independientemente |
| Layer1 ausente o distinto de Namespace, incluido No | Rechazados |
| Cualquier obligatorio faltante | Rechazado independientemente |
| Diagnóstico truncado o confirmación global incompleta/ausente | Rechazados |
| Confirmación global negativa, incluso junto a una positiva | Rechazada |
| Positivos solo en TSYNC/otros campos, o como subcadena | Rechazados |
| Campos contradictorios, duplicados y texto residual | Rechazados |
| Entradas vacías/no textuales, valores con otra capitalización o Unicode | Rechazadas |

`node --check` aprobó runner, helper y prueba; `git diff --check` también pasó.
No se ejecutaron suites clínicas completas en Windows, Chrome real, PostgreSQL,
frontend, lint o build en esta sesión. No se instalaron paquetes ni software.
No se consultó AWS ni se ejecutó ningún workflow nuevo.

### Inventario propuesto para un tercer commit, todavía no autorizado

| Archivo | Estado / propósito |
| --- | --- |
| `.github/clinical/run-predeploy02.cjs` | Modificado: usa el helper, conserva versión/flags/acceso al diagnóstico |
| `.github/clinical/chrome-sandbox-status.cjs` | Nuevo: único validador puro con rechazo seguro |
| `backend/test/predeploy02ChromeSandbox.test.js` | Nuevo: 22 pruebas con el mismo helper; incluido por el glob habitual de backend |
| `backend/test/fixtures/chrome-sandbox-148.txt` | Nuevo: diagnóstico genérico del segundo ensayo |
| `docs/CPREN_PREDEPLOY_02_GITHUB_ACTIONS.md` | Modificado previamente y ampliado sin perder la evidencia anterior |

Son **5 rutas: 2 modificadas y 3 nuevas**. docs/tesis sigue como trabajo ajeno sin
seguimiento. El índice queda sin staging; HEAD no cambia. No hay commit/push, PR,
main, cambios de migraciones, datos, n8n, dependencias o lockfiles.

Pendientes: revisión/autorización de esos cinco archivos y de un tercer ensayo,
compatibilidad real del parser con Chrome en el runner y ejecución clínica Linux
completa, incluidos migraciones, conservación y PDF. Se mantiene **NO-GO para
avanzar a staging privado** hasta contar con esa evidencia. Las pruebas unitarias
del lector no acreditan las suites Linux ni una restauración PostgreSQL real.
CPREN-120 y CPREN-126 permanecen En revisión.

## 2026-11-02 — Autorización del tercer ensayo y revisión previa

El propietario autoriza ahora un único commit de las cinco rutas del parser y
un único push a la rama clínica, con su ejecución automática. No autoriza cuarto
intento ni publicaciones adicionales. El informe posterior quedará local.
Se repitieron las 23 pruebas focalizadas: 23 aprobadas, 0 fallos, 0 omitidas,
0 canceladas, exit0. Sintaxis de runner/helper/prueba y diff --check aprobados.
Se revisaron los cinco archivos completos y los controles obligatorios;
sin cambios de versión/flags, permisos o red. Remotos previos confirmados:
clínico `23dc463eb27a6e121f599422871979531fc82c15` y main `d5fae677fa462af9ca5b7174a46d3ebf21e12196`.
No existe todavía resultado de este tercer ensayo al preparar este commit.
