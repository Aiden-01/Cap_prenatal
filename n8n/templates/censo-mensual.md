# Plantilla: censo mensual de embarazadas

Referencia documental común a los workflows de mes logístico 26 a 25 y mes
calendario cerrado. No contiene filas clínicas ni destinatarios reales.

## Asuntos

```text
CAP Prenatal | Censo mes logístico | {{DESDE}} al {{HASTA}}
CAP Prenatal | Censo mensual cerrado | {{DESDE}} al {{HASTA}}
```

## Mensaje con datos y archivo

```html
<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6">
  <h2 style="color:#7c3aed">Censo de embarazadas: {{TIPO_PERIODO}}</h2>
  <p><strong>Periodo:</strong> {{DESDE}} al {{HASTA}}</p>
  <p>Se adjunta el censo de {{TOTAL}} captadas en primer control.</p>
  <p style="font-size:12px;color:#6b7280">
    Documento confidencial para uso institucional. Proteja los datos de las pacientes.
  </p>
</div>
```

Adjunto esperado:

```text
Tipo: binaryData
Propiedad: data
MIME: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Nombre mes logístico: censo_mes_logistico_{{DESDE}}_{{HASTA}}.xlsx
Nombre mes cerrado: censo_mes_cerrado_{{DESDE}}_{{HASTA}}.xlsx
```

## Mensaje sin datos y sin archivo

```html
<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6">
  <h2 style="color:#7c3aed">Censo de embarazadas: {{TIPO_PERIODO}}</h2>
  <p><strong>Periodo:</strong> {{DESDE}} al {{HASTA}}</p>
  <p>No se registraron captadas en primer control durante este periodo.</p>
  <p style="font-size:12px;color:#6b7280">
    Mensaje automático para coordinación institucional.
  </p>
</div>
```

## Reglas

- Validar que el rango devuelto coincida exactamente con el solicitado.
- Con `total=0`, no consultar `/excel` y no adjuntar un archivo vacío.
- Con `total>0`, descargar el XLSX como `data` antes de Resend.
- No interpolar filas nominales en el cuerpo del correo.
- El XLSX es confidencial: limitar destinatarios, retención y reenvío.
- No guardar el binario en Git, Notion o logs.
