# CPREN-115 — Catálogos profesionales, fase 1

> Documento histórico de la fase original. CHECKPOINT-10 sustituye sus contratos de perfiles/directorio: la arquitectura vigente usa cargo y clasificación, sin Especialidades; las altas requieren email. Véase [arquitectura y contratos actuales](CPREN_120_CHECKPOINT_10_PROFESIONALES_USUARIOS.md). Se conserva el contenido original como evidencia histórica.

## Alcance y decisiones

Dos catálogos independientes: `cargos_personal` (puesto real) y
`especialidades_personal` (formación especializada opcional). Los roles de acceso
siguen siendo `director`, `admin` y `personal_salud`. No se incorporan relaciones
ni columnas a usuarios; esa integración pertenece a CPREN-116.

Se reutiliza la arquitectura routes → controllers → services → repositories.
Las fábricas comparten la lógica para evitar diferencias entre catálogos; las
únicas tablas admitidas son una lista fija del repositorio. Todos los valores
SQL usan parámetros.

Lectura para cualquier sesión autenticada; escritura para `admin` y `director`,
siguiendo usuarios.js. Se eligió este criterio sobre el de comunidades (solo
director), porque estos catálogos preparan la administración de personal.
`autorizarEscritura` concentra el punto para incorporar permisos granulares
posteriormente. No se otorgan permisos por cargo, especialidad ni códigos.

## Base de datos

Migración nueva: `backend/src/db/migrations/023_catalogos_profesionales.sql`.
La última migración encontrada antes del cambio era `022_pacientes_version.sql`.
Ninguna migración anterior cambia. El mismo SQL está incluido en schema.sql y
023 se exige en schemaCompatibility.js con su checksum versionado.

Ambas tablas tienen:

| Campo | Tipo y reglas |
| --- | --- |
| id | SERIAL, clave primaria |
| codigo | VARCHAR(40), opcional, único cuando existe |
| nombre | VARCHAR(150), obligatorio, único |
| descripcion | VARCHAR(500), opcional |
| activo | BOOLEAN NOT NULL DEFAULT TRUE |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW(), conservado al editar |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW(), actualizado por trigger |

La función SQL inmutable `catalogo_personal_clave` aplica Unicode NFKD, elimina
marcas U+0300–U+036F, colapsa espacios, recorta extremos y pasa a minúsculas.
Los índices únicos usan esta clave para nombre y código, incluyendo inactivos.
Por ejemplo `MÉDICO`, `médico` y ` médico ` colisionan. También `ñ` y `n`
comparten clave; signos como `/` permanecen. Un espacio interno único se conserva:
`AB 01` y `AB01` son códigos distintos. Los valores visibles conservan sus acentos.
Se eligió esta función sobre unaccent para no depender de extensiones ni de
envoltorios de inmutabilidad que podrían quedar desactualizados.
Requiere PostgreSQL >= 13 y codificación UTF8; verificado en 18.3.

Checks impiden nombres/códigos vacíos y NULL en los campos obligatorios. Los
índices únicos protegen también escrituras concurrentes y clientes SQL directos.
El índice `(activo, nombre, id)` acompaña los listados. No se implementa borrado
físico ni endpoint DELETE: la desactivación preserva los identificadores para
su uso histórico futuro.

Semilla de ocho cargos: Auxiliar de Enfermería (AE), Enfermera Profesional (EP),
Médico/a, Nutricionista, Laboratorista, Digitador/a, Auxiliar de Archivo y Técnico
de Salud Rural (TSR). Los códigos son referencias aportadas, sin equivalencias ni
certificación profesional implícita. Especialidades empieza vacío hasta que CAP
confirme nombres. La semilla no sobrescribe registros existentes.

## API

Base: `/api/catalogos`. Sustituir `{tipo}` por `cargos` o `especialidades`.
Autenticación y CSRF siguen las reglas generales de docs/API.md.

| Método | Ruta | Acceso y respuesta |
| --- | --- | --- |
| GET | `/{tipo}` | Autenticado, 200 `{ data, total }` |
| GET | `/{tipo}/:id` | Autenticado, 200 registro, incluye inactivos |
| POST | `/{tipo}` | admin/director, 201 registro activo |
| PUT | `/{tipo}/:id` | admin/director, 200 registro actualizado |
| PATCH | `/{tipo}/:id/desactivar` | admin/director, 200 registro |
| PATCH | `/{tipo}/:id/reactivar` | admin/director, 200 registro |

Listado: `estado=activos|inactivos|todos` (predeterminado activos), `pagina`
(1–100000, predeterminado 1) y `limite` (1–100, predeterminado 20). Orden por
nombre e ID. Total cuenta todos los registros del filtro, antes de paginar.
Listado y conteo son consultas independientes; no ofrecen snapshot transaccional.

Body POST/PUT:

```json
{ "nombre": "Cargo confirmado por CAP", "codigo": "CAP-01", "descripcion": null }
```

PUT reemplaza nombre, código y descripción; nombre es obligatorio. Código y
descripción omitidos, vacíos o NULL se guardan como NULL. NFC y espacios se
normalizan antes de persistir. Estado solo se cambia mediante PATCH; campos
desconocidos se rechazan. IDs son enteros positivos hasta 2147483647.

Errores: 400 VALIDATION_ERROR, 401 AUTHENTICATION_REQUIRED, 403 ROL_REQUERIDO
o CSRF_INVALID, 404 CATALOGO_NOT_FOUND y 409 CATALOGO_DUPLICADO. Un duplicado
inactivo sigue reservado: editar o reactivar el registro existente.

## Auditoría y concurrencia

Escrituras y auditoría privada obligatoria comparten una transacción PostgreSQL.
Si la auditoría falla se revierte el cambio. Actualizaciones y cambios de estado
bloquean la fila con FOR UPDATE. No se registra evento si no hay cambios.
La auditoría incluye actor, entidad/ID, acción, campos modificados y resultado;
en estado conserva booleanos anterior/nuevo. No conserva nombre, código,
descripción, IP, user-agent ni datos clínicos. Se usa el módulo `catalogos`
y entidades `cargo_personal` / `especialidad_personal`.

## Verificación reproducible

Desde backend:

```powershell
npm test
$env:RUN_CATALOGOS_TEMP_POSTGRES = '1'
$env:CATALOGOS_POSTGRES_BIN = 'C:\Program Files\PostgreSQL\18\bin'
node --test test/catalogosPostgres.test.js
```

La integración crea su propio clúster con initdb en una carpeta temporal y el
puerto 55475, escucha solo en 127.0.0.1 y verifica data_directory antes del SQL.
No usa .env ni acepta URLs de bases existentes. Al finalizar cierra el clúster y
elimina únicamente su carpeta generada. Requiere el puerto libre y permisos para
procesos y conexiones locales. No requiere Docker ni acceso a AWS.

Incluye upgrade desde schema anterior con usuarios existentes, idempotencia de
023, instalación vacía con el migrador oficial y reejecución, HTTP con repositorio
y auditoría reales, restricciones SQL, duplicados de nombre/código concurrentes,
filtros, preservación de usuarios/roles y rollback ante fallo de auditoría.
catalogos.test.js comprueba Zod, autenticación sin token, roles, CSRF y rutas.

## Continuidad entre equipos

Trabajo local en `Aiden29`, equipo `Trabajo`, 22 de octubre de 2026.
Rama `feature/cpren-115-catalogos-profesionales`, base `e07cef0`.
Jira no respondió a la consulta de CPREN-115 (MCP request timed out).
No fue posible comprobar Epic/estado ni registrar avances; no se usó Notion.
El registro listo para Jira está en `CPREN_115_REGISTRO_SESION.md`.

CHECKPOINT-01 autoriza commit y publicación exclusiva de esta rama. La revisión,
el detalle de las 50 omisiones esperadas y las pruebas repetidas están en el
registro de sesión. La integración de catálogos pasó 9 pruebas en PostgreSQL
18.3 temporal; se verificó ausencia de directorios, procesos y conexiones
residuales. No se ejecutó migración en una base existente ni se accedió o
desplegó a producción. CPREN-116 permanece pendiente, sin iniciar.

Para recuperar desde el repositorio existente en casa, ejecutar primero
`git status --short --branch`; si hay cambios locales, preservarlos y detener
el cambio de rama. Con el árbol limpio y la publicación confirmada:

```powershell
git fetch origin
git switch --track origin/feature/cpren-115-catalogos-profesionales
git branch --show-current
git log -1 --format=fuller
git rev-parse HEAD
git rev-parse origin/feature/cpren-115-catalogos-profesionales
git status --short --branch
```

Si la rama local ya existe, usar `git switch feature/cpren-115-catalogos-profesionales`
y `git pull --ff-only origin feature/cpren-115-catalogos-profesionales` en lugar
de `git switch --track`. No forzar si las ramas divergen. Los dos SHA deben
coincidir con el SHA de la entrega CHECKPOINT-01 antes de continuar.
No ejecutar `npm run db:migrate` hasta verificar un destino local aislado.
