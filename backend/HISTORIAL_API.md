# Historial de auditoria

`GET /api/auditoria` requiere sesion activa y permiso explicito `auditoria.ver`.
La migracion 018 lo asigna solo a los directores existentes; seed y
defaults de creacion/cambio de rol mantienen esa asignacion. Personal de salud
no puede recibirlo. El director puede concederlo o retirarlo manualmente a admin.
La migracion 019 retira concesiones automaticas a admin y cualquier concesion a
personal_salud, conservando las concesiones manuales a admin y revocando las
sesiones de los usuarios afectados. No se ejecuta la migracion automaticamente al iniciar
el servidor.
El arranque exige que 018 y 019 estén registradas con el checksum versionado;
si faltan, bloquea el inicio y solicita ejecutar el flujo oficial de migraciones.
Ambos endpoints rechazan personal_salud incluso ante concesiones antiguas.

## Consulta

Todos los parametros son opcionales; parametros desconocidos o repetidos se
rechazan con 400.

- `q`: texto literal de 1 a 100 caracteres, sin distinguir mayusculas. Busca
  username/nombre del actor, accion, ID del evento y modulos/entidades reconocidos.
  No busca descripciones libres, JSON ni informacion de pacientes.
- `tipo`: accion del catalogo de auditoria.
- `usuario_id`: entero positivo PostgreSQL.
- `modulo`: codigo del catalogo declarado en `auditoria.schemas.js`, conservando
  el modulo persistido. Los productores clinicos privados usan `pacientes`.
- `desde`, `hasta`: dias reales `YYYY-MM-DD` en `America/Guatemala`; ambos
  extremos incluyen el dia completo. Cada limite puede usarse por separado.
- `cursor`: valor opaco devuelto por la pagina anterior; reenviar los mismos
  filtros. No admite limit/offset ni numero de pagina.

Orden: `COALESCE(fecha_hora, created_at) DESC NULLS LAST, id DESC`.
Pagina fija de hasta 25 eventos. El cursor preserva microsegundos y BIGINT sin
conversion numerica JavaScript; incluye version y huella de filtros. Es un
marcador de navegacion validado, no una credencial. Fechas completamente nulas
se ubican al final y avanzan por ID.

## Respuesta

```json
{
  "items": [
    {
      "id": "123",
      "fecha": "2026-09-27T06:00:00.123456Z",
      "tipo": "crear",
      "modulo": "pacientes",
      "entidad": "paciente",
      "presentacion": {
        "titulo": "Registró información",
        "modulo": "Pacientes",
        "categoria": "Cambios de información"
      },
      "usuario": { "id": 2, "username": "operador", "nombre_completo": "Operador" }
    }
  ],
  "next_cursor": null,
  "has_more": false
}
```

`fecha` y `usuario` pueden ser null. Codigos historicos fuera del catalogo se
presentan como `desconocido`/`desconocida`. Solo se seleccionan columnas de la
allowlist; nunca se devuelven payloads, descripciones libres, IP, user-agent,
IDs de paciente/embarazo ni valores clinicos. La respuesta usa `no-store`.
No incluye totales, estadisticas ni contadores.

`GET /api/auditoria/usuarios` usa la misma autenticacion y permiso, y devuelve
un catalogo minimo `{ id, username, nombre_completo }` para el filtro desktop.
Incluye usuarios inactivos existentes para poder consultar su actividad; no
expone hashes, roles, permisos ni referencias clinicas. Usa `no-store`.

`presentacion` añade textos derivados del mapeo central puro
`services/audit/auditHistoryPresentation.js`, sin reemplazar los codigos tecnicos.
El modulo visible distingue entidades clinicas conocidas cuando el modulo
persistido es `pacientes` (por ejemplo vacuna → Vacunas). Los filtros siguen
usando los codigos persistidos. Las categorias son Acceso y seguridad, Cambios
de informacion, Consultas, Documentos y exportaciones u Otros eventos.
Una accion desconocida muestra Realizó una acción no identificada; un modulo
desconocido muestra Módulo no identificado. Nunca se interpola texto libre.

Errores: 401 sin sesion, 403 sin permiso, 400 por filtros invalidos o cursor
invalido/incompatible (`AUDIT_CURSOR_INVALID` para cursor de formato base64url
con contenido invalido). Los fallos de base siguen el manejador central.

## Verificacion

`node --test test/auditoria.test.js` cubre HTTP, permisos, contrato, privacidad,
filtros, validacion y cursores. `auditoriaPostgres.test.js` es opt-in y crea
siempre un cluster temporal propio: `RUN_AUDITORIA_TEMP_POSTGRES=1` y
`AUDITORIA_POSTGRES_BIN` apuntando a los binarios instalados. No lee DATABASE_URL
ni usa la base real; detiene el cluster y conserva su carpeta temporal para
diagnostico.
