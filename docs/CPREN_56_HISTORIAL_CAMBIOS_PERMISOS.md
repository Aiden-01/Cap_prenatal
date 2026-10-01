# CPREN-56 — Cambios de permisos en Historial

Clasificación A: `Usuarios.jsx` carga originales y seleccionados y envía los códigos
por PUT `/usuarios/:id/permisos`. El controlador llama a permisosService; el servicio
bloquea el usuario, valida el catálogo, lee el conjunto anterior y reemplaza permisos.
auditDiffBuilder ya guarda solo `permisos_agregados` / `permisos_retirados` en
`auditoria_eventos.datos_nuevos.cambios`, con `politica_version: 1`.
No guarda los conjuntos completos. Auditoría obligatoria, reemplazo y revocación
de sesiones usan la misma transacción; un fallo revierte la operación.

La consulta de Historial omitía estos datos. Ahora proyecta exclusivamente ambas
listas para el productor `permisos_reemplazados`, módulo/entidad/tabla conocidos,
acción actualizar y política 1. El servicio valida listas, duplicados, conflictos,
longitud y pertenencia al catálogo vigente. Expone únicamente `detalle_permisos`
con `{codigo, anterior, nuevo}`; nunca metadata cruda ni snapshots completos.
El catálogo es interno y no sale en el DTO. Códigos ya retirados del catálogo
degradan a fallback sin detalle. No se reconstruyen eventos retrospectivamente.

El detalle muestra “Cambios de permisos” y “Asignado” / “No asignado”. Eventos
legacy, sin delta o malformados mantienen su actividad genérica, sin afirmar
“Sin cambios”. Actor y usuario afectado mantienen la resolución de CPREN-49.
Los eventos de revocación de sesiones permanecen independientes.

No hay migración ni cambios al endpoint de permisos. No se exponen credenciales,
request, datos clínicos, IP, cookies, tokens ni campos arbitrarios de auditoría.

Validación reproducible en PostgreSQL temporal: `RUN_AUDITORIA_TEMP_POSTGRES=1`
y `AUDITORIA_POSTGRES_BIN` apuntando al directorio bin local; ejecutar
`node --test test/auditoriaPostgres.test.js` desde backend. No acepta DATABASE_URL.
El caso CPREN-56 carga schema.sql real en un esquema aislado del clúster desechable,
comprueba JSONB y ejecuta repositorio/servicio productivos. Cubre grant, revoke,
multi, NULL, metadata malformada, productor/tabla/política incorrectos y privacidad.
El clúster escucha solo loopback, se detiene y se elimina al finalizar.
La ejecución real detectó y corrigió la ausencia de `permisos_reemplazados` en
DESCRIPTION_CODES: sin ese código la proyección del evento era NULL y el DTO
descartaba deltas válidos. La etiqueta genérica de actividad permanece igual.
