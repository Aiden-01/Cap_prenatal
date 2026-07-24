# Workflows n8n de CAP Prenatal

Este directorio contiene artefactos revisables y versionados. No contiene la
base SQLite de n8n, credenciales, claves de cifrado, ejecuciones, binarios ni
datos reales. `.n8n-local/` permanece ignorado por Git.

## Workflow disponible

`workflows/proximas-citas-v1.json` implementa el resumen agregado de próximas
citas del Sprint 5B.2B:

- nombre: `CAP Prenatal | Próximas citas agregadas | v1`;
- estado exportado: `active: false`;
- horario: todos los días a las `06:00`;
- zona: `America/Guatemala`;
- consulta: mañana solamente, con `offset_days=1` y `window_days=1`;
- máximo: tres intentos HTTP, con esperas de 1 y 5 minutos;
- formato: un correo de texto simple, nunca uno por paciente;
- persistencia de ejecuciones: deshabilitada en el propio workflow;
- credenciales: ausentes deliberadamente.

No activar el workflow sin autorización institucional. El archivo no puede
consultar el backend ni enviar correo hasta que se asignen manualmente Header
Auth y SMTP y se configuren los parámetros operativos.

## Diagrama textual

```text
Schedule 06:00
  -> preparar offset/window y validar URL privada
  -> GET interno intento 1
       -> solo conectividad/5xx: esperar 1 min -> intento 2
            -> solo conectividad/5xx: esperar 5 min -> intento 3
       -> 400/401/404/429: salida controlada sin reintento
  -> validar contrato estricto y descartar respuesta completa
  -> SHA-256(v1|range.from|range.to|recipient_alias)
  -> comprobar static data
       -> ya enviado: duplicate_skipped
       -> total=0: no_results
       -> construir texto agregado
            -> SMTP intento 1
                 -> rechazo transitorio inequívoco antes de aceptación:
                    esperar 1 min -> último intento
                 -> timeout ambiguo: mail_failed, sin reintento
            -> envío confirmado: guardar hash -> sent
```

## Contrato admitido

La raíz admite exactamente:

```json
{
  "schema_version": 1,
  "generated_at": "2026-07-23T12:00:00.000Z",
  "timezone": "America/Guatemala",
  "range": {
    "from": "2026-07-24",
    "to": "2026-07-24"
  },
  "total": 3,
  "summary_by_date": [
    {
      "date": "2026-07-24",
      "total": 3
    }
  ],
  "secure_path": "/dashboard"
}
```

El validador exige ISO válido, fechas reales `YYYY-MM-DD`, rango ascendente,
totales enteros entre 0 y 10000, resumen estrictamente ordenado, suma idéntica
al total, ausencia de campos adicionales y `secure_path=/dashboard`. Recorre
todo el objeto y rechaza nombres de campos personales o clínicos, incluso con
mayúsculas o acentos. Ante una violación conserva solo `CONTRACT_INVALID` y el
tipo de validación o nombre seguro del campo prohibido.

Después de validar, el workflow descarta `generated_at` y `summary_by_date`.
Solo conserva rango, total, ruta segura y el hash necesario para la salida
operativa.

## Correo

Asunto para un solo día:

```text
CAP Prenatal | Próximas citas — 2026-07-24
```

Contenido exacto de ejemplo:

```text
Se identificaron 3 citas prenatales programadas para 2026-07-24.

Ingrese al sistema CAP Prenatal para consultar el detalle:
https://cap-prenatal.example.invalid/dashboard

Este es un mensaje automático. No responda a este correo.
```

Para un rango, se usa `YYYY-MM-DD a YYYY-MM-DD`. No hay HTML, Markdown,
adjuntos, respuesta JSON, información técnica, pacientes, identificadores,
comunidad, riesgo ni información clínica.

`CAP_SYSTEM_BASE_URL` debe usar HTTPS en una ejecución programada. Solo una
prueba manual admite HTTP cuando el host es loopback. Los esquemas
`javascript:`, `data:` y `file:` se rechazan.

## Autenticación y configuración manual

1. Importar `n8n/workflows/proximas-citas-v1.json`.
2. Confirmar antes de cualquier cambio que aparece inactivo.
3. Abrir cada nodo `Consultar backend - intento N`.
4. Crear una credencial genérica `Header Auth` con nombre de header
   `X-CAP-Automation-Key` y la key original como valor. Asignar la misma
   credencial a los tres nodos. No copiarla a variables, expresiones o notas.
5. Abrir ambos nodos `Enviar resumen - intento N`, crear una credencial SMTP
   aprobada y asignarla. No exportar nuevamente el workflow con IDs locales.
6. Crear variables de proyecto n8n:
   `CAP_NOTIFICATION_RECIPIENT`, `CAP_NOTIFICATION_FROM` y, opcionalmente,
   `CAP_NOTIFICATION_RECIPIENT_ALIAS`. El alias predeterminado es
   `responsable_salud_reproductiva`; no contiene el correo.
7. Confirmar `CAP_BACKEND_AUTOMATION_URL` como URL del backend en la red
   `automation_internal`, nunca proxy público, `localhost` productivo o IP fija.
   Confirmar `CAP_SYSTEM_BASE_URL` como URL HTTPS visible para el personal.
8. En un entorno aislado, ejecutar primero
   `node --test backend/test/n8nWorkflow.test.js`; esta prueba inyecta contratos
   sintéticos en el validador sin iniciar n8n. Para una prueba manual en n8n,
   usar un mock local que responda en la misma ruta con `total: 0`, de modo que
   no se alcance SMTP. No usar capturas ni payloads reales.
9. Revisar que el workflow importado no tenga `pinData`, que no guarde
   ejecuciones exitosas, fallidas, manuales o progreso y que la instancia
   productiva mantenga poda activa.
10. Verificar la concurrencia, egress y autorización institucional. Solo
    entonces publicar/activar el workflow.

Los valores `responsable@example.invalid` y `cap-prenatal@example.invalid` son
placeholders bloqueantes. El constructor devuelve `configuration_error` hasta
que se definan valores operativos válidos.

## Deduplicación y concurrencia

La clave es:

```text
SHA-256("v1|" + range.from + "|" + range.to + "|" + recipient_alias)
```

`static data` conserva únicamente hash y marca temporal, con máximo 90 entradas
y 45 días. La clave actual se agrega solo después de un envío confirmado. No
se guardan respuesta, resumen, cuerpo, correo real ni respuesta SMTP.

Static data es de mejor esfuerzo y no es una garantía transaccional. No
reemplaza una tabla de entregas y puede tener carreras si se ejecutan varios
workers. n8n 2.26.4 no serializa un límite por-workflow dentro del JSON; por
eso la concurrencia operativa debe quedar en 1 mediante
`N8N_CONCURRENCY_PRODUCTION_LIMIT=1` en la instancia de este sprint y debe
existir una sola copia activa del workflow. Si la instancia alojara otros
workflows, revisar el impacto global antes de activarlos.

## Errores y privacidad

Resultados permitidos: `sent`, `no_results`, `duplicate_skipped`,
`backend_unavailable`, `unauthorized`, `invalid_range`, `rate_limited`,
`contract_invalid`, `mail_failed` y `configuration_error`.

Las salidas no incluyen headers, key, URL, destinatario, texto del correo,
body del backend, respuesta SMTP o stack. No se envía correo técnico a la
responsable clínica. Un canal técnico futuro debe ser separado y no contener
datos de citas.

El workflow no recibe pacientes individuales. No tiene nodo PostgreSQL,
Execute Command, acceso a `data_internal`, `pinData` ni lectura global del
entorno. Los nombres de nodos tampoco contienen datos sensibles.

## Egress pendiente

Este sprint no habilita salida general a Internet. Las alternativas futuras
son:

- relay SMTP institucional en `automation_internal`;
- red de egress dedicada con firewall limitado al proveedor SMTP aprobado;
- servicio institucional de correo accesible desde red privada.

Se prefiere relay institucional o egress limitado. No conectar n8n a
`data_internal`, PostgreSQL o una red pública sin controles; no publicar 5678.

## Pruebas

```text
node --test backend/test/n8nWorkflow.test.js
node --test backend/test/n8nInfrastructure.test.js
node --test backend/test/automatizaciones.test.js
node --test backend/test/auditPrivacyPolicy.test.js
```

Las pruebas son estáticas o unitarias y no requieren n8n, Docker, SMTP ni una
base de datos real.
