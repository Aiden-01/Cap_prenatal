# CPREN-91 — Procedimiento propuesto para Ubuntu, no ejecutado

En Fase 3 no se establece SSH ni se ejecuta ningún comando en Ubuntu. Esta revisión parte de la evidencia de solo lectura de Fase 1: n8n usa `cap-n8n`, no pertenece a `systemd-journal`, tiene `ProtectSystem=strict` y acceso de escritura limitado a su StateDirectory. Los respaldos y rclone permanecen privados para root/postgres.

## Separación de identidades

- Observador: identidad dedicada, sin shell de acceso, sin credenciales Resend/Drive/PostgreSQL y sin permiso para ejecutar el respaldo.
- API: identidad dedicada con acceso a la SQLite del monitor y al secreto de autenticación, sin acceso a journald, dumps o rclone.
- n8n: identidad actual. Solo necesita HTTP loopback a la API y la credencial Resend ya autorizada; no añadirlo al grupo postgres, root, adm ni systemd-journal.

La SQLite, WAL y SHM requieren directorio propio privado con permisos de grupo explícitos para las dos identidades del monitor. Propuesta: directorio root/grupo dedicado, 0770 o más restrictivo según usuarios, umask 0007, archivos 0660 para compartir exclusivamente observador/API. La CLI actual usa umask 0077: antes de instalar dos identidades debe revisarse y probarse ese punto o ejecutar ambos procesos bajo una única identidad dedicada, sin ampliar el acceso de n8n al directorio. **No afirmar que el despliegue multiusuario ya funciona con los permisos actuales.** El modelo de almacenamiento ya es independiente de la base clínica y de n8n.

## Lectura mínima de journald

`systemctl show` normalmente permite lectura sin root, pero debe comprobarse en el host. Dar acceso al grupo `systemd-journal` concede lectura de muchos servicios, no solamente del respaldo; no es la recomendación automática.

Alternativa recomendada para revisar antes del despliegue: un helper root-owned, de solo lectura y sin argumentos recibidos, que consulte exclusivamente `cap-prenatal-backup.service`, normalice los mensajes y entregue únicamente el contrato sanitizado. Su invocación se autorizaría mediante una regla exacta, sin comodines ni shell, para la identidad del observador. El helper no debe aceptar rutas, nombres de unidades, comandos ni consultas de n8n. Esto requeriría una adaptación explícita del lector y revisión de seguridad; **no está implementado ni instalado en Fase 3**.

Otras opciones: aprobar conscientemente el acceso más amplio a journald o aislar los logs en un namespace dedicado. La segunda altera la configuración existente del respaldo y requiere autorización separada. No se aplicó ninguna alternativa.

## Comprobaciones futuras, solo con autorización específica

1. Confirmar identidades, grupos, propietarios y unidades efectivas sin imprimir variables sensibles.
2. Probar lectura de metadatos systemd y del journal específico bajo la identidad elegida. La ausencia de permisos debe producir UNKNOWN, no un respaldo perdido o un éxito inventado.
3. Verificar que el observador y la API no pueden leer dumps, rclone.conf, PostgreSQL o el perfil n8n.
4. Probar concurrencia, WAL/SHM, reinicio y recuperación de la SQLite dedicada con esos permisos.
5. Confirmar listener exclusivamente 127.0.0.1:8766, autenticación obligatoria, ausencia de proxy Nginx o puerto público y exclusión del puerto en el firewall perimetral.
6. Establecer permisos privados del secreto fuera del repositorio y vincular la Header Auth por un canal autorizado. No reutilizar N8N_ENCRYPTION_KEY como credencial de la API.
7. Revisar límites de recursos, reinicio de procesos, salud del observador/API y protección ante disco lleno. Una caída de todo AWS necesita un observador externo aprobado; el propio servidor no puede alertar durante esa caída.
8. Crear respaldos y rollback antes de instalar servicios. No modificar `cap-prenatal-backup.service`, su timer, rclone o los seis workflows clínicos como parte implícita de ese paso.

No se preparan instrucciones de activación automática. La validación Windows con fixtures no sustituye estas comprobaciones Linux.
