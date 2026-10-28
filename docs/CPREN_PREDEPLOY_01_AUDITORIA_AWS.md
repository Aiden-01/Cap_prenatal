# PREDEPLOY-01 — Auditoría real de AWS antes de integración clínica

**Diagnóstico de solo lectura. No hubo despliegue, migración, restauración ni
modificaciones de producción.** Casa / HP Victus / HUGUITO.

Auditoría remota: **2026-10-25, 21:55:55–22:14:26 America/Guatemala**
(2026-10-26, 03:55:55–04:14:26 UTC). GitHub/local verificados antes de conectar.
CPREN-120 y CPREN-126 permanecen **En revisión**.

## 1. Recomendación

**GO condicionado para preparar el release y autorizar un ensayo en staging
Linux aislado. NO-GO para migrar o desplegar ahora.** Tampoco se autoriza integrar
CHECKPOINT-14 sin su revisión final y autorización de commit/push/integración.

Se confirmó que producción corresponde al main conocido, está saludable en las
comprobaciones realizadas y tiene una base previa al módulo clínico, con migraciones
004–022 consistentes. Faltan restauración real comprobada en aislamiento, ensayo
del candidato completo en PostgreSQL 16/Linux, regularización institucional y
definición de la ventana/recuperación. No se encontró un defecto nuevo demostrado
que justifique corregir producción durante esta auditoría.

## 2. Acceso, identidad y preservación

Se usó exclusivamente el SSH operativo existente, con la identidad vigente de
`C:\SSH`, confirmada por el propietario. La clave privada no se mostró ni se
incluyó en herramientas de evidencia. Se exigió clave de host conocida
(`StrictHostKeyChecking=yes`); no se aceptó un host nuevo. Los inventarios
posteriores se ejecutaron además con `UpdateHostKeys=no`.
La conexión identificó Amazon EC2, instancia t3.small, Ubuntu 24.04.4 LTS; además
se verificaron repositorio origin, nombre del paquete, rutas y dominio CAP reales.

Los scripts diagnósticos se enviaron por stdin, sin crear archivos remotos. Python
se ejecutó con `-B`; Git con `GIT_OPTIONAL_LOCKS=0`; PostgreSQL con transacciones
`BEGIN TRANSACTION READ ONLY` terminadas con ROLLBACK, límites locales de sentencia
10 s y espera 2 s en las consultas de inventario. No se devolvieron nombres,
correos, CUI, identificadores de pacientes, contraseñas, tokens o narrativas.
Solo se consultaron metadatos, conteos agregados autorizados y salud pública.

Se leyeron antes CHECKPOINT-14, el plan clínico 115–126 y CPREN-125. El checkout
local tenía 65 rutas de trabajo de CHECKPOINT-14; sus hashes SHA256 iniciales
coinciden al cerrar. No hubo pull sobre ese árbol sucio, checkout, limpieza,
staging, commit, push, PR, merge ni cambios de main. Solo se hizo fetch local para
actualizar referencias; no se hizo fetch/pull en AWS.

| Referencia | SHA / estado observado |
| --- | --- |
| Rama local | `feature/cpren-120-editor-pdf-notas-clinicas` |
| HEAD local y origin clínico | `0f341d78d9fcfa6bb8178cd1a36bec141adf7b5e` |
| origin/main local actualizado | `d5fae677fa462af9ca5b7174a46d3ebf21e12196` |
| Checkout AWS | `/home/ubuntu/cap_prenatal`, rama `main` |
| HEAD AWS y origin/main conocido allí | `d5fae677fa462af9ca5b7174a46d3ebf21e12196` |
| Git AWS | Limpio al inicio de la auditoría de aplicación y al cierre |
| Origin AWS | Repositorio `Aiden-01/Cap_prenatal`, identidad comprobada |

Los otros worktrees locales permanecen en sus ramas: main en `d5fae67` y hotfix
CPREN-125 en `da8f250`. CHECKPOINT-14 sigue siendo un cambio local adicional al
SHA clínico publicado; ninguna firma de última hoja se activó en AWS.

## 3. Aplicación, frontend y servicios reales

**Express está administrado por PM2**, aplicación `cap-prenatal-api`, usuario
`ubuntu`, cwd `/home/ubuntu/cap_prenatal/backend`, entrada `src/index.js`, modo fork.
La unidad systemd es `pm2-ubuntu.service`, no una unidad Express separada. El
daemon supervisa **tres aplicaciones**: se observaron tres entradas guardadas y
tres procesos hijos actuales. No se consultaron sus datos de negocio.

Una futura ventana debe detener/reiniciar **solo la aplicación CAP en PM2**,
después de la autorización correspondiente. Reiniciar `pm2-ubuntu.service` o usar
`pm2 restart all` afectaría aplicaciones ajenas y no es el procedimiento propuesto.
El dump PM2 se utilizó solo para proyección de metadatos operativos; no se copió
su entorno ni se ejecutó resurrect/jlist u otro comando PM2.

| Componente | Estado y evidencia al cierre |
| --- | --- |
| Nginx | `nginx.service`, active/running, PID 1300613 |
| Supervisor Express | `pm2-ubuntu.service`, active/running, PID 947508 |
| Proceso API CAP | PID 1196210, hijo del supervisor, cwd backend CAP; GET health 200 |
| PostgreSQL | `postgresql@16-main.service`, active/running, PID 1300642, puerto 5432 |
| n8n | `cap-prenatal-n8n.service`, active/running, PID 1067440, usuario `cap-n8n` |
| Monitor API de respaldos | `cap-prenatal-backup-monitor-api.service`, active/running, PID 1300575 |
| Observador de respaldos | `cap-prenatal-backup-observer.service`, active/running, PID 1300576 |
| Publicador de evidencia | Oneshot con última salida 0/success; timer propio continúa publicando |
| Respaldo diario | Oneshot inactive/dead tras éxito, salida 0; timer active/waiting |

Los PID de los seis servicios persistentes indicados y del proceso API se mantuvieron
durante la auditoría. No se reinició ni se recargó ningún servicio. El estado
`postgresql.service=active/exited` corresponde al wrapper; se verificó también el
clúster 16/main online y su unidad efectiva. `inactive/dead` del backup oneshot
no es un fallo si terminó con éxito.

### Frontend efectivamente servido

Configuración CAP observada en `/etc/nginx/sites-enabled/cap-prenatal`:

- Dominio `prenatal.hercor-nexus.com`.
- Root `/home/ubuntu/cap_prenatal/frontend/dist`.
- API hacia `http://127.0.0.1:3335`.
- Escucha HTTPS 443 y HTTP 80, IPv4/IPv6 según el vhost.

GET seguros a través de ese vhost HTTPS, con SNI y certificado verificado y destino
loopback mediante `curl --resolve`:

| Petición | Resultado |
| --- | --- |
| `/login` | HTTP 200, 1307 bytes, coincide exactamente con index.html del root |
| `/api/health` | HTTP 200, status `ok`, sistema CAP El Chal, versión informativa `2.1.0` |

SHA256 de `index.html` y del HTML recibido:
`ef7f15773d89f51cf30dc8c24e2cb3bfcf69b945dd84ab47bd3a87171d4c3ba6`.
Última modificación del índice: 2026-10-23 04:29:27 UTC. Sus cuatro referencias
de assets existen; www-data puede leer el índice. Root dist 0755; checkout/backend
0775. Se comprobó salud/lectura, no escritura del usuario de servicio.

Esto demuestra qué HTML entrega ese Nginx; **no demuestra por sí solo el SHA del
build frontend**. No se encontró/validó aquí una atestación que lo vincule de forma
inequívoca al commit. El proceso API arrancó el 20/10 22:23:21 UTC; los cambios de
backend posteriores en main fueron únicamente una prueba CPREN-125, sin cambios
en backend/src o lockfiles en ese intervalo. Health tampoco expone un SHA runtime.
No se autenticaron cuentas reales ni se abrieron expedientes; la prueba no es un
recorrido desde una red externa ni una validación de login de usuario.

## 4. PostgreSQL: estado real, migraciones e integridad observable

Base CAP identificada inequívocamente mediante catálogo; esquema `public`,
**PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)**, UTF8, collation/ctype C.UTF-8,
no réplica. `transaction_read_only=on` fue comprobado en el inventario. Los
checksums físicos de páginas del clúster están off; es distinto de los checksums
SQL comparados abajo y no demuestra corrupción. No se cambió esa configuración.

Hay **19 migraciones registradas, 004–022**. Los archivos numerados existentes
empiezan en 004; no se infiere un error por no tener registros 001–003.
Todos los checksums son compatibles con los archivos de AWS y con el candidato
local, mediante la normalización LF/CRLF del migrador. No hubo discrepancias.

| Migración aplicada | SHA256 registrado | Comparación AWS/candidato |
| --- | --- | --- |
| 004_comunidades_catalogo.sql | `362022e269e68c2dde413efa3186b7e9e4823f2f5e404a75b3218c9779e02aa8` | Compatible |
| 005_vistas_bi.sql | `66297c0f3d01a0505272bc6e0aad71aa76ac29b401e6abdcfdc1dede1bab9c4b` | Compatible |
| 006_comunidades_admin.sql | `f1e1283c063a9f84e7c434ba834c30bd28c3a6e8c81fce157733cded97e5b678` | Compatible |
| 007_auth_sessions.sql | `c7b3e677743f18fad12fe3fc4d0fe156835ed779858f48742e780487e14fa022` | Compatible |
| 008_retirar_referencias_efectuadas.sql | `64676fe78adcdf15ce53722ae3a038a126409ca78e3eeef15369492605f5b17e` | Compatible |
| 009_vax2_reglas_vacunas.sql | `5c7e489fc967e936b14fc59467e0ae503ad31d93ba39a9d62b0a07c307eed8d1` | Compatible |
| 010_vax31_historias_parciales.sql | `334e43abb01ef7587d33a426633b9a8146eb181cc20a3e05bf2b95e54306b2a0` | Compatible |
| 011_vax4_influenza_aplicaciones_independientes.sql | `dfaa34e8c329c90f0c9a978943e99a81d20401882690ba397d20cc2fb17db54f` | Compatible |
| 012_vax5_correccion_final.sql | `b6289b8cae0f0ebd84343e2f395ab4a68f103bb3996eb6bd2c97a662f18b1e45` | Compatible |
| 013_plan_parto_horas_decimales.sql | `3450bcba66265b56018f2403accba0d1ab4a392b3082e5f091249cbeb4a0d09d` | Compatible |
| 014_citas_prenatales.sql | `95498c3bc21e989a03a76f548c32407079d705a471dba877c7e8921bd6457ee6` | Compatible |
| 015_automatizacion_despachos.sql | `7aaf2b6149c2926f51df995e95b15fb6d4a082702b4fd49ebabfe337f185a361` | Compatible |
| 016_riesgo_tiempo_horas_decimales.sql | `59d6e0ded497af2d6d69f215ae327ad7450f4750309d7fe8d5b74b84ac7e1d9b` | Compatible |
| 017_citas_inasistencias.sql | `48486f8d5c98d47f10c6b61c87472bfd214c71a2a70830ef3c261786a8d5c683` | Compatible |
| 018_auditoria_historial.sql | `8596185dfa17b0793fad2369764737804a572a96df3e540b1754ecd9180fa688` | Compatible |
| 019_auditoria_politica_roles.sql | `dfb8ac572d6e59aca1afecccfa0a05f7011e0f4d73a02a5465bb63d5bc0c898e` | Compatible |
| 020_retirar_permiso_pacientes_eliminar.sql | `5307e5df0cf8340b295ba633ec5041946696ff3a473a06acb15804de78e1d312` | Compatible |
| 021_integridad_paciente_embarazo.sql | `612b151f00f1699b68cb1b7094a1a0af114d566da5b40616be95acd9cde5b1d1` | Compatible |
| 022_pacientes_version.sql | `b33854588583fb6b2226e6abcb39995f604d20a45510ddbbd59d89e3beaf1bf7` | Compatible |

**023–030 no están registradas ni disponibles en el checkout productivo actual.**
Se comprobó además la ausencia de cargos_personal, especialidades_personal,
notas_clinicas, controles_seguimiento_notas y controles_notas_requeridas, y de
las columnas usuarios.cargo_id, especialidad_id y email. No se asumió su ausencia
por el SHA: se consultó el catálogo/registro real.

Por tanto, no existen cargos/códigos clínicos actuales en esas tablas; duplicados
o contradicciones MED/AE/EP sobre ese catálogo son **No aplica en este estado**,
no un catálogo comprobado como regularizado. No hay dependencias actuales de la
tabla Especialidades porque no existe; futuras dependencias introducidas durante
un ensayo deberán volver a revisarse antes de 028.

Se observaron **tres cuentas, todas activas**, sin columna email todavía. Requerirán
la regularización administrativa explícita que permita 029/API, sin inventar
direcciones. No se extrajeron sus nombres, usernames, emails ni hashes de claves.
No están presentes los diez permisos clínicos ni el permiso nuevo de gestión
del catálogo. Las concesiones previas se mantienen; deben diseñarse y aprobarse
las nuevas de forma explícita, sin convertir roles en acreditación profesional.

### Restricciones, índices y concurrencia

En las tablas relevantes consultadas: **38 índices válidos y listos**, ninguno
invalid/not-ready. Las FKs de pertenencia paciente/embarazo/control/cita observadas
están validadas. Existen seis CHECK heredados marcados NOT VALID:

- embarazos_estado_check.
- pacientes_antec_diabetes_tipo_check.
- pacientes_categoria_servicio_check.
- pacientes_clasificacion_alfa_beta_check.
- pacientes_estado_civil_check.
- pacientes_nivel_estudios_check.

El schema versionado los define intencionalmente NOT VALID. No se contaron ni
extrajeron filas infractoras: no hay evidencia aquí de datos inválidos. No se
intentó VALIDATE, ALTER ni corrección alguna. Reproducirlos y evaluar su efecto
en el ensayo; no confundirlos con un error nuevo de 023–030 ni exigir modificar
historia para que desaparezca una etiqueta. La revisión se limitó a las tablas
enumeradas, no certifica todos los objetos de toda la instancia.

La muestra de pg_stat_activity y locks relevantes no mostró otras conexiones o
bloqueos en ese instante. **Una muestra vacía no demuestra ausencia permanente
de escritores**: Express, usuarios y jobs pueden abrir conexiones después. La
ventana debe drenar la API CAP y coordinar jobs que dependan de ella, conservando
n8n y otras aplicaciones; no ejecutar DDL con tráfico por asumir que estaba ociosa.

## 5. Compatibilidad técnica del candidato

| Requisito | Observado / condición pendiente |
| --- | --- |
| PostgreSQL UTF8 y normalize de 023 | 16.15/UTF8 satisface el requisito SQL declarado >=13; ensayar en 16, no sustituirlo por la prueba local 18.3 |
| Cadena clínica | Aplicar 023→030 solo en ventana posterior autorizada, con migrador y checksums intactos |
| Node/npm | Node v20.20.2; npm 10.8.2 identificado desde su paquete, sin ejecutar instalación/build |
| Puppeteer | 24.43.1, engine >=18; Node observado cumple esa declaración |
| Vite | 8.2.1, engine ^20.19.0 o >=22.12.0; Node observado cumple la declaración |
| PDF-lib | 1.17.1 instalado, sin dependencia nueva para CHECKPOINT-14 |
| Chrome seleccionado | 148.0.7778.97 en caché del usuario ubuntu, ejecutable/legible por la app; coincide con revisión esperada por Puppeteer |
| Librerías | ldd no encontró dependencias faltantes en ese Chrome |
| Fuentes | fonts-liberation 2.1.5-3 instalado; 17 archivos en /usr/share/fonts. No se exige instalar DejaVu/Noto sin una necesidad demostrada |
| Configuración | .env de app presente con modo 0600, propietario operativo; se verificó presencia de DB_*, JWT_SECRET, NODE_ENV y ruta Chrome, sin devolver sus valores secretos |
| Automatización | Variables de integración n8n presentes; presencia no prueba valor efectivo ni permite copiar credenciales a staging |

No se inició Chrome ni se generaron PDF en producción. Versión y librerías
disponibles no prueban sandbox, fuentes, paginación o cuota del candidato. El
ensayo local de 14 usó Node 24, Chrome 155 y PostgreSQL 18.3; falta el ensayo Linux
con versiones equivalentes al destino, bajo el usuario de servicio previsto.
No se instaló nada ni se deshabilitó el sandbox. La configuración existente de
Puppeteer no requiere una variable ficticia PUPPETEER_DISABLE_SANDBOX.

El inventario local del candidato ya publicado frente a main es de 399 archivos,
9 commits y 8 migraciones; CHECKPOINT-14 se suma localmente. No cambian lockfiles
ni plantillas de entorno respecto a main. El resultado final usa solo códigos
MED/AE/EP para autoría clínica, sin Especialidades/clasificación activas; conserva
snapshots legados y roles/permisos independientes. No hay código CPREN-121 nuevo.

El backend de main anterior no implementa contratos nuevos de notas/directorio/
correo; no debe mezclarse con frontend clínico ni usarse como fallback de escritura
sin validarlo. 028/030 son incompatibles con backends clínicos intermedios que
consultaban Especialidades o clasificación. En el estado real actual esos objetos
aún no existen, pero aparecerán/desaparecerán dentro de la cadena: no publicar
etapas intermedias. Un rollback de archivos no revierte SQL, ni autoriza restaurar
una base antigua sobre escrituras posteriores al respaldo.

## 6. Respaldos existentes: tres niveles distintos de evidencia

Servicio real `/usr/local/sbin/cap-prenatal-backup`, root, modo 0700; script SHA256
`7b7495a1312b1620daea6fa9d6ae3b5203688b86294648b95520ba33a4f7594f`.
Se reconocieron pg_dump custom, validación de listado pg_restore y SHA256 en el
código; no se ejecutó el script. El timer diario está active/waiting, programado
a las **02:00 America/Guatemala**, siguiente 26/10 08:00 UTC.

1. **Ejecución existente reportada:** último inicio 25/10 08:00:32 UTC y final
   08:01:03 UTC (02:00:32–02:01:03 Guatemala), salida 0, Result=success.
   Publicador, observador y API de monitor están operativos. Snapshot protegido
   `/run/cap-prenatal-backup-evidence/snapshot.json`, root/grupo monitor, 0640,
   actualizado durante la auditoría; ventana de siete días, history_status
   `retention_unproven`, sin afirmar historia completa más allá de ella.
2. **Integridad/verificación externa registradas:** siete eventos OK del 19 al
   25/10, todos con hash_match/external_verified y pruebas de inicio, validación
   local, hash, finalización, existencia, éxito y cierre. Método registrado
   `sha256_readback_temp_then_move_and_lsf`. El destino configurado del script
   es tipo **crypt sobre drive**. Solo se proyectaron tipos de backend, sin
   tokens, contraseñas de cifrado ni IDs/carpetas remotas. No se ejecutó rclone,
   listado nuevo de Drive ni readback: la última comprobación de ese objeto es
   **la reportada por el job del 25/10**, no una certificación fresca de Drive.
3. **Restauración realmente comprobada:** **No verificable / pendiente**. No se
   descargaron, copiaron, descifraron ni abrieron dumps, ni se restauró una base.
   Un hash correcto y pg_restore --list no equivalen a restauración integral.

En `/var/lib/cap-prenatal-backups/pending` se observaron tres archivos dump
históricos, total **830486 bytes**, con mtimes del 08/10 UTC, root0600 y directorio
root0700. Son metadatos, no lectura de sus contenidos ni prueba de que sean la
copia del último job; su condición pendiente/origen debe conciliarse sin borrarlos.
La configuración rclone utilizada es root0600 y no se modificó. No se halló un
helper de restauración CAP en /usr/local/bin o /usr/local/sbin; eso no demuestra
que no exista un procedimiento en otra custodia. Falta identificar/revisar el
runbook aprobado antes de autorizar el ensayo.

### Capacidad disponible

Base CAP: **10984471 bytes**, aproximadamente 10.5 MiB según pg_database_size;
esto no es el tamaño de todos los artefactos de una restauración. Disco raíz
aprox. 38 GiB, 34% usado, **27019657216 bytes libres** en la muestra (~25.2 GiB);
inodos ~11% usados. RAM 1906 MiB, 854 MiB disponible; swap 2047 MiB, 369 MiB usado
en la muestra final de recursos. No se hizo una prueba de carga.

Hay espacio para copias de esa DB por volumen observado, pero **no se propone
montar staging junto a producción**: la memoria es reducida y el host comparte
aplicaciones. Dimensionar en Linux separado el dump cifrado, DB restaurada,
índices/WAL, snapshots antes/después, dependencias, caché Chrome y PDF temporales,
con margen y límites de memoria/CPU/disco comprobados. El espacio libre actual
no es un ensayo de restauración ni garantiza capacidad bajo carga.

## 7. Propuesta de staging Linux aislado — no creado

1. Autorizar formalmente destino, custodia del respaldo, administradores, ventana,
   retención y criterios de aceptación. Preferir Linux separado del EC2 productivo,
   PostgreSQL 16 compatible y Node/Chrome equivalentes al destino. No usar la PC
   personal como almacén de dumps clínicos ni clonar toda la instancia/n8n.
2. Preparar la red **antes de restaurar datos**: sin acceso público, sin rutas a
   PostgreSQL/API productivos y salida denegada a Resend, correo, webhooks y
   automatizaciones. Administrar por canal controlado; servir app solo local/VPN.
   La obtención futura del archivo cifrado desde Drive debe hacerse en una zona
   operativa autorizada con alcance mínimo, verificando identidad, fecha, tamaño
   y hash, y transfiriéndolo cifrado al aislamiento. No hacerlo en esta ejecución.
3. Custodiar la clave crypt fuera del repositorio y del informe; no copiar .env,
   dump.pm2, perfiles n8n, tokens Drive/Resend ni credenciales DB productivas a
   archivos versionados. Aprovisionar solo lo estrictamente necesario en un canal
   privado temporal autorizado. Preservar un registro seguro del artefacto fuente.
4. Una vez autorizado el ensayo, descifrar/restaurar en una DB **nueva del entorno
   aislado**, nunca sobre producción. Registrar listado/hash y comprobar objetos,
   conteos y relaciones. Usar propietarios/ACL locales revisados, sin crear roles
   privilegiados productivos por restauración automática. No exportar hashes de
   contraseñas o filas clínicas; las comparaciones se realizan dentro del aislamiento
   y solo se registran agregados/resultado. No usar contraseñas de personas reales
   para un smoke de login: preparar cuentas sintéticas equivalentes a legado.
5. Fijar el candidato integrado y aprobado que incluya 14; instalar/build solo en
   staging autorizado desde lockfiles. Configuración independiente con
   NODE_ENV=production, DB/secretos exclusivos y ambas flags de integración n8n
   en false. No instalar n8n ni timers de producción. No proporcionar claves Resend;
   el firewall denegado permanece como segunda barrera frente a envíos accidentales.
6. Capturar baseline y ejecutar **allí**, con autorización posterior, el migrador
   023→030, nunca schema.sql manual encima de la copia existente. Probar segunda
   ejecución/checksums y cambios conservados. Revisar los NOT VALID heredados,
   catálogos y nuevas restricciones sin reinterpretar historia por nombre/cargo.
7. Smoke con expedientes/cuentas exclusivamente sintéticos autorizados: login
   legado, correo obligatorio en nuevas cuentas, edición/renombrado y sesiones,
   concesiones explícitas, MED/AE/EP, directorio, controles/citas/seguimiento,
   borrador/recuperación/conflicto/finalización y PDF. Generar los cinco casos 14
   y estrés bajo el usuario de servicio, con firma solo en última, narrativa y
   paginación íntegra. No visualizar expedientes restaurados de personas para probar.
8. Comparar integridad de históricos dentro de la DB aislada; ensayar recuperación
   de una migración parcial y del candidato. Medir picos/tiempos y repetir salud,
   reportes, calendario y backups de staging sin notificaciones. Revisar los
   resultados con propietario/CAP. La eliminación del entorno/custodia posterior
   seguirá la política autorizada; no limpiar datos automáticamente en esta fase.

En una futura ventana real: mantenimiento solo del vhost/API CAP, drenar escrituras,
coordinar llamadas de n8n sin modificar workflows, respaldo final verificable y
PM2 solo de `cap-prenatal-api`. Nginx puede seguir sirviendo HTML viejo mientras
API esté detenida: impedir escrituras de usuarios de forma controlada. Conservar
n8n, monitorización y otras apps activas. Publicar frontend por el intercambio
atómico existente, tras verificar filesystem/rutas, backend compatible y permisos.
Reiniciar PostgreSQL o todo PM2 no es necesario por el cambio clínico y no está
autorizado. Mantener recuperación de SQL separada del intercambio de archivos.

## 8. Riesgos y bloqueadores

| ID / clase | Severidad, riesgo e impacto | Evidencia | Acción y momento |
| --- | --- | --- | --- |
| I1 — Integración | Alta: 14 local, sin revisión final/commit; un SHA publicado no incluye firma final | HEAD clínico 0f341d7 + 65 rutas locales preservadas | Revisar propietario y autorizar publicación/integración antes de generar candidato; no hacerlo aquí |
| I2 — Integración | Media: estados de gestión no reflejan todo el código | CPREN-115/116 figuran Tareas por hacer en la consulta de 14; evidencia histórica, no consulta nueva en esta fase | Conciliar Jira con responsables antes de cerrar alcance, sin duplicar issues |
| M1 — Migración | Crítica: no se ha demostrado restauración real del respaldo | Job y hash registrados, pero ningún restore autorizado ejecutado | Identificar runbook/custodia y ensayar restauración aislada antes de autorizar SQL productivo |
| M2 — Migración | Alta: cambio contractual 023–030 y backend/frontend desalineados | Registro real acaba en 022; nuevas tablas/columnas/permisos ausentes | Ensayar cadena completa con copia autorizada en PG16, fijar candidato coherente y ventana antes de migrar |
| M3 — Migración | Alta: tráfico/jobs pueden escribir después de la muestra o del respaldo | API/n8n activos; muestra de actividad vacía es puntual | Definir mantenimiento, drenaje y manejo de escrituras posteriores; antes del corte |
| P1 — Producción | Alta: reiniciar unidad PM2 completa afecta otras apps | Tres aplicaciones y tres procesos hijos bajo pm2-ubuntu | Runbook restringido al proceso CAP; validar intervención antes de autorizar ventana |
| P2 — Producción | Alta: PDF/Chrome/PG destino no ensayados con 14 | Linux Chrome148/Node20/PG16 frente a pruebas locales Chrome155/Node24/PG18 | Ejecutar validación completa equivalente en staging antes de liberar |
| P3 — Producción | Alta: falta regularización de cargo/código y concesiones; correo legado | Tablas/permiso clínico/email ausentes, tres cuentas actuales | Aprobación CAP y asignación explícita al introducir el módulo; sin inferencias ni permisos automáticos |
| P4 — Producción | Media: memoria compartida limitada y swap usada | 1906 MiB totales, ~854 disponibles; tres apps/n8n/PG | Staging separado y límites/medición antes de ensayar carga o publicar |
| V1 — Verificación | Media: Drive actual y restore no equivalen a evidencia anterior | Última verificación reportada 25/10; no listado/readback nuevo; retention_unproven | Verificación operativa autorizada del artefacto elegido y restauración; no declarar fallo de Drive ni integridad nueva |
| V2 — Verificación | Media: seis NOT VALID heredados, sin prueba de filas inválidas | pg_constraint + schema versionado coincidentes | Evaluar en copia/ensayo antes del go de migración; no reparar automáticamente ni declararlo Error |
| S1 — Seguimiento | Baja: tres dumps pendientes históricos y procedimiento de restauración no localizado en rutas estándar | stat protegido, mtimes 08/10; sin lectura de dumps | Conciliar custodia/origen y runbook antes del ensayo, sin borrar archivos |
| S2 — Mejora posterior | Baja: SHA de build/frontend no atestado y page checksums off | Se verifica hash servido y HEAD, no atestación; metadata PG | Registrar procedencia del próximo artefacto; evaluar hardening físico por tarea separada, sin cambios aquí |

No hubo denegación de permisos de lectura que impidiera los inventarios finales.
Una consulta auxiliar de codificación se reformuló contra pg_database y terminó
correctamente; fue una corrección del diagnóstico, no del servidor. No se crearon
issues de Error a partir de límites de verificación o estados históricos.

## 9. Próximos pasos y cierre

1. Revisar este informe y las muestras 14; conciliar pendientes institucionales y
   de gestión. Autorizar por separado cualquier commit/push/integración futura.
2. Aprobar el diseño/destino aislado y la custodia; identificar el respaldo real
   que se usará y su procedimiento de recuperación, sin trasladarlo a la PC personal.
3. Ejecutar solo tras nueva autorización el ensayo Linux/PG16 descrito, con salida
   de correo/automatizaciones bloqueada desde antes de restaurar.
4. Completar el runbook real con PM2 solo de CAP, respaldo del corte, SQL secuencial,
   publicación atómica, smoke y plan para datos escritos después del backup.
5. Decidir GO/NO-GO de producción a partir de ese ensayo; esta auditoría concede
   únicamente una recomendación de preparación, no autorización operativa.

Único entregable nuevo versionable de PREDEPLOY-01: este informe. Diagnósticos
sanitizados y scripts locales permanecen en `tmp_predeploy01/`, ignorado. Los
65 archivos previos de CHECKPOINT-14 se conservaron byte por byte. No se instalaron
dependencias ni se repitieron pruebas/migraciones locales: para este cambio de
documentación se verificaron fuentes, metadatos, hashes, Git y diff --check.

Al cierre remoto: mismo HEAD y árbol limpio, registro de 19 migraciones, servicios
persistentes estables. Al cierre local: mismo HEAD/origin, main intacto, sin staging,
commit/push, PR, merge o despliegue. Sin consultas identificables, copias de dumps,
restauraciones, cambios de usuarios, servicios, n8n, rclone o backups; sin CPREN-121.
Jira se actualiza solo con el resumen técnico no sensible, conservando ambos
issues En revisión.
