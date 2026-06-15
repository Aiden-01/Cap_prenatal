# Integracion n8n

El proyecto puede usar n8n como motor de automatizaciones externas. La prioridad recomendada es enviar recordatorios operativos, por ejemplo citas prenatales programadas para manana.

## Opcion local sin Docker

Para pruebas locales puedes correr n8n con Node.js, sin levantar Docker.

Requisitos:

- Node.js 20 o superior recomendado.
- Backend corriendo en `http://localhost:3001`.
- n8n corriendo en `http://localhost:5678`.

Desde la raiz del proyecto:

```bash
npm run n8n:local
```

Ese comando carga variables desde `backend/.env` y luego inicia n8n. Tambien puedes ejecutarlo directo, pero en ese caso n8n no cargara automaticamente las variables SMTP del proyecto:

```bash
npx n8n
```

La primera vez puede tardar porque descarga n8n. Despues abre:

```txt
http://localhost:5678
```

### Variables para backend local

Si backend corre fuera de Docker, configura estas variables en `backend/.env` o en tu terminal antes de iniciar el backend:

```env
AUTOMATION_SECRET=change_me_to_a_long_random_automation_secret
NOTIFICATIONS_ENABLED=false
N8N_WEBHOOK_URL=http://localhost:5678/webhook/cap-prenatal-alertas
N8N_WEBHOOK_SECRET=change_me_to_a_long_random_webhook_secret
N8N_WEBHOOK_TIMEOUT_MS=5000
```

Para el flujo de citas de manana, la variable indispensable es `AUTOMATION_SECRET`.

### Credenciales SMTP locales

Si inicias n8n con `npm run n8n:local`, puedes crear credenciales SMTP usando expresiones con variables de entorno:

```txt
Host: {{$env.SMTP_HOST}}
Port: {{$env.SMTP_PORT}}
User: {{$env.SMTP_USER}}
Password: {{$env.SMTP_PASSWORD}}
From: {{$env.SMTP_FROM}}
SSL/TLS: true
```

Para Gmail:

```txt
Host: smtp.gmail.com
Port: 465
SSL/TLS: true
```

### URL del HTTP Request en n8n local

Cuando n8n corre sin Docker, el nodo `HTTP Request` debe usar:

```txt
http://localhost:3001/api/automatizaciones/proximas-citas?dias=1
```

Header:

```txt
x-cap-prenatal-secret: TU_AUTOMATION_SECRET
```

## Servicios Docker

`docker-compose.yml` incluye el servicio `n8n` en el puerto `5678` con volumen persistente `n8n_data`.

```bash
docker compose up -d n8n
```

Interfaz local:

```txt
http://localhost:5678
```

## Variables del backend

Por seguridad, las notificaciones por evento vienen apagadas por defecto. El endpoint de automatizaciones usa un secreto compartido entre backend y n8n.

```env
NOTIFICATIONS_ENABLED=true
N8N_WEBHOOK_URL=http://n8n:5678/webhook/cap-prenatal-alertas
N8N_WEBHOOK_SECRET=change_me_to_a_long_random_webhook_secret
N8N_WEBHOOK_TIMEOUT_MS=5000
AUTOMATION_SECRET=change_me_to_a_long_random_automation_secret
```

En produccion cambia `N8N_WEBHOOK_SECRET` y `AUTOMATION_SECRET` por valores largos y privados.

## Workflow recomendado: citas de manana

1. Crear un workflow en n8n.
2. Agregar nodo `Schedule Trigger`.
3. Programarlo diariamente, por ejemplo 6:00 a. m.
4. Agregar nodo `HTTP Request`.
5. Metodo: `GET`.
6. URL segun entorno:

Local sin Docker:

```txt
http://localhost:3001/api/automatizaciones/proximas-citas?dias=1
```

Dentro de Docker:

```txt
http://backend:3001/api/automatizaciones/proximas-citas?dias=1
```

7. Header:

```txt
x-cap-prenatal-secret: TU_AUTOMATION_SECRET
```

8. Agregar un nodo `IF` antes de enviar el mensaje.
9. Condicion:

```txt
debe_enviar = true
```

10. Si `debe_enviar` es `true`, enviar un solo mensaje diario usando `mensaje_resumen` o `tabla_html`.
11. Si `debe_enviar` es `false`, finalizar el workflow sin enviar nada.
12. Conectar el canal configurado:
   - `Send Email`
   - `Telegram`
   - `Google Sheets`
   - `HTTP Request`

Respuesta del endpoint:

```json
{
  "dias": 1,
  "total": 2,
  "debe_enviar": true,
  "fecha_objetivo": "16/6/2026",
  "generated_at": "2026-06-15T00:00:00.000Z",
  "mensaje_resumen": "CAP El Chal - Recordatorio de citas prenatales\n\nSe informa que las siguientes pacientes tienen cita prenatal programada para el dia de manana, 16/6/2026:\n\n| No. | Paciente | Expediente | Comunidad | Control | Riesgo |\n| --- | --- | --- | --- | --- | --- |\n| 1 | Paciente Demo | EXP-001 | El Chal | 2 | Con riesgo |\n\nSe recomienda verificar asistencia y actualizar el expediente correspondiente.",
  "tabla_markdown": "| No. | Paciente | Expediente | Comunidad | Control | Riesgo |\n| --- | --- | --- | --- | --- | --- |\n| 1 | Paciente Demo | EXP-001 | El Chal | 2 | Con riesgo |",
  "tabla_html": "<table>...</table>",
  "citas": [
    {
      "paciente_id": 1,
      "embarazo_id": 1,
      "nombre": "Paciente Demo",
      "no_expediente": "EXP-001",
      "telefono": "55555555",
      "comunidad": "El Chal",
      "control_id": 10,
      "numero_control": 2,
      "cita_siguiente": "2026-06-16",
      "tiene_riesgo": true,
      "mensaje_sugerido": "Recordatorio: Paciente Demo tiene cita prenatal programada para 16/6/2026. Expediente EXP-001."
    }
  ]
}
```

## Workflow opcional: riesgo detectado

Cuando se registra o actualiza una ficha con riesgo obstetrico activo, el backend envia:

```json
{
  "event": "riesgo_obstetrico.detectado",
  "source": "cap-prenatal",
  "occurred_at": "2026-06-15T00:00:00.000Z",
  "payload": {
    "accion": "crear",
    "paciente_id": 1,
    "embarazo_id": 1,
    "ficha_id": 1,
    "tiene_riesgo": true,
    "referida_a": "Hospital",
    "fecha": "2026-06-15"
  }
}
```

La integracion esta disenada para no romper el guardado clinico si n8n no responde. El backend registra una advertencia y continua.
