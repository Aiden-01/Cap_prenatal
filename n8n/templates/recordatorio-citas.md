# Plantilla: recordatorio de citas

Referencia documental para el nodo `Construir detalle operativo` de
`recordatorio-citas-resend-v1.json`. No contiene un destinatario ni datos
reales.

## Datos admitidos

Por cada cita:

- `date`: fecha ISO de la cita;
- `first_name`: primer nombre;
- `last_name`: primer apellido;
- `phone`: teléfono operativo;
- `community`: comunidad.

No incluir CUI, expediente, ID, dirección exacta, riesgo, diagnóstico,
observaciones u otros campos clínicos.

## Asunto

```text
CAP Prenatal | Recordatorio de citas | {{FECHA}}
```

## HTML genérico seguro

Los marcadores son ilustrativos. El workflow real valida la lista cerrada de
campos y escapa cada valor antes de construir filas.

```html
<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6">
  <h2 style="color:#7c3aed">Citas prenatales para mañana</h2>
  <p>Se identificaron <strong>{{TOTAL}}</strong> citas.</p>
  <table style="border-collapse:collapse;width:100%;max-width:720px">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="padding:8px;text-align:left">Paciente</th>
        <th style="padding:8px;text-align:left">Teléfono</th>
        <th style="padding:8px;text-align:left">Comunidad</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">{{NOMBRE}} {{APELLIDO}}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">{{TELEFONO}}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">{{COMUNIDAD}}</td>
      </tr>
    </tbody>
  </table>
  <p style="font-size:12px;color:#6b7280">
    Información confidencial para coordinación institucional.
  </p>
</div>
```

## Reglas

- Un solo correo por ejecución, no uno por paciente.
- Si `total=0`, no crear ni enviar mensaje.
- Rechazar el contrato si `appointments.length !== total`.
- Escapar `&`, `<`, `>`, comillas y apóstrofes.
- Usar `No registrado` solo como presentación; no inventar datos.
- Mantener el workflow inactivo mientras se prueba el contenido.
