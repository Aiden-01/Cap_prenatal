# OCR Service - CAP Prenatal

Microservicio local para captura asistida de datos iniciales de una paciente. No guarda datos y no reemplaza la revision humana.

## Alcance

- Recibe una imagen de un documento fisico.
- Preprocesa la imagen con OpenCV.
- Extrae texto con Tesseract via `pytesseract`.
- Intenta detectar campos basicos: expediente, CUI, nombres, apellidos, edad, FUR y antecedentes obstetricos.
- Devuelve JSON preliminar para que el frontend lo muestre y el usuario decida si lo aplica al formulario.

## Instalacion en Ubuntu Server

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip tesseract-ocr tesseract-ocr-spa

cd /ruta/cap_prenatal/ocr-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Levantar localmente

```bash
cd /ruta/cap_prenatal/ocr-service
source .venv/bin/activate
PORT=5001 python app.py
```

El servicio escucha en:

```txt
http://127.0.0.1:5001
```

## Probar endpoint

```bash
curl -X POST http://127.0.0.1:5001/procesar-nueva-paciente \
  -F "documento=@/ruta/documento.jpg"
```

## Backend Node

Configurar:

```env
OCR_SERVICE_URL=http://127.0.0.1:5001
```

El frontend debe llamar al backend Node, no al OCR directamente:

```txt
POST /api/ocr/nueva-paciente
```

## Produccion sugerida

- Backend Node con PM2.
- OCR Python con `systemd` o PM2.
- OCR escuchando solo en `127.0.0.1`.
- Nginx expone solamente frontend y backend.
- No exponer el puerto `5001` publicamente.

## Limitaciones

- OCR puede fallar con fotos oscuras, borrosas, inclinadas o formularios con escritura manual.
- Las reglas actuales son expresiones regulares simples.
- La confianza es orientativa, no una validacion clinica.
- El usuario siempre debe revisar, corregir y confirmar antes de registrar la paciente.
