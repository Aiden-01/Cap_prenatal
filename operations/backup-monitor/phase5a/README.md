# CPREN-91 — Fase 5A: configuración privada e historial publicable

El destinatario real se retira del árbol y de los dos commits reconstruidos. La variable `CAP_BACKUP_ALERT_RECIPIENT` debe suministrarse únicamente al proceso API mediante configuración privada fuera del checkout. No se creó ni instaló configuración real. Las direcciones `.invalid` son fixtures, nunca valores de envío por defecto. El remitente institucional permanece intacto.

## Contrato y confianza

`POST /v1/claim` sigue aceptando exclusivamente `{}` con autenticación. El evento mantiene su esquema cerrado y nunca transporta destinatarios. Para una reclamación no vacía, la API añade `recipient` desde el entorno privado, tras validar una dirección ASCII única sin listas, nombres de presentación, espacios, saltos de línea ni encabezados. Code vuelve a validar el contrato cerrado y el formato antes de devolver el destinatario al nodo Resend. No hay CC, BCC ni adjuntos.

La configuración privada constituye la autorización del operador. La validación sintáctica no demuestra propiedad del buzón. Deben aprobarse y protegerse la identidad del proceso y el EnvironmentFile en Ubuntu; usuarios que puedan editar ese entorno o el workflow están dentro del límite de confianza. La API autenticada en loopback es la fuente de confianza del destinatario; no se admite configurar la dirección mediante eventos, requests ni otro nodo de red.

Con configuración ausente o inválida, la API devuelve HTTP503 genérico antes de reclamar o consumir intentos: la alerta permanece pendiente. La primera reclamación HTTP fija la dirección por evento en `meta` dentro de la SQLite privada. Un cambio de configuración durante un reintento bloquea la operación y revierte la transacción; se debe revisar el resultado del proveedor antes de resolverlo. No cambiar la clave de idempotencia ni crear otro evento para forzar un reenvío. No se añade migración ni se altera el esquema de eventos.

## Preservación y redacción

La instantánea pública anterior al IF sustituye exclusivamente el destinatario por `alerts@example.invalid`. Se conserva el original exacto con los otros 30 archivos y un bundle incremental verificado en un directorio privado ignorado, con ACL restringida al usuario actual. El bundle necesita la base aprobada para restaurar los commits anteriores en un repositorio aislado. No restaurar sobre el checkout actual ni publicar ese bundle.

Los manifiestos y reportes de Fases 2/3 conservan su valor histórico: sus hashes identifican versiones anteriores, no el árbol vigente. `phase3/audit.cjs` pertenece a ese ensayo histórico y sus invariantes de igualdad total son anteriores al cambio de destinatario. No debe regenerar los reportes de Fase 3 usando esta versión. Para el árbol actual se usa `phase5a/audit.cjs`; `manifest.json` registra todos los archivos publicables salvo su propio hash, incluyendo los reportes históricos y la instantánea redactada. La copia privada permite comprobar los hashes históricos originales.

## Comprobaciones actuales

```text
python -B -m unittest discover -s operations/backup-monitor -p "test*.py" -v
node --test --test-reporter=tap operations/backup-monitor/workflow.test.cjs
node operations/backup-monitor/build-workflow.cjs --check
node operations/backup-monitor/phase3/runtime-test.py
node operations/backup-monitor/phase5a/audit.cjs
```

El ensayo n8n reutiliza exclusivamente el ejecutable instalado con otro perfil y SQLite sintéticos. Resend está interceptado por la guardia local antes de DNS/conexión externa. Se conservan los límites de aislamiento documentados en Fase 3; no es una garantía de sandbox para código o addons maliciosos. Las observaciones de respaldos, journald y proveedor son simuladas. No se prueba entrega de correo ni se accede a Ubuntu, Drive o datos clínicos.

`results.json` identifica las pruebas, el ensayo y las comparaciones de esta revisión. El auditor comprueba remitente y nodos anteriores, HTML idéntico en alerta/recuperación, guardia de aceptación, fuentes protegidas y ausencia de direcciones personales/artefactos privados en la lista cerrada. La auditoría completa del historial comprueba cada árbol y mensaje de los dos commits posteriores a la base, no solo HEAD; sus resultados y SHA finales se registran en Jira y en el informe de cierre para evitar referencias circulares dentro del commit.

## Recuperación y pendientes

Antes de reconstruir se verificaron rama, índice vacío, dos commits exactos y ausencia de rama remota. El bundle conserva la punta original, la base necesaria y los archivos originales. La reconstrucción utiliza la misma base, dos grupos explícitos de archivos y ningún push forzado. Los objetos antiguos pueden permanecer locales en reflog; no son antecesores de la rama nueva y no se publican al enviar exclusivamente esa rama. No publicar reflogs, bundle, perfiles ni una copia completa de `.git`.

La identidad Git local también contenía la dirección retirada. La auditoría de metadatos detuvo la primera preparación antes de modificar la rama. Los commits reconstruidos usan la identidad técnica `CAP Prenatal <cpren91@example.invalid>` únicamente mediante variables del proceso; no se altera la configuración Git del usuario. Los objetos provisionales rechazados permanecen locales, fuera de la ascendencia publicable. Se comprueban árboles, mensajes y metadatos completos antes de actualizar la referencia de rama.

Ubuntu sigue pendiente de autorización: destinatario aprobado en configuración externa, permisos mínimos de journald, almacenamiento/usuarios de API y observador, acceso privado a SQLite/WAL, credenciales Header Auth/Resend y ventana de instalación/rollback. Sin push, PR, merge, instalación, activación ni correos en esta fase.
