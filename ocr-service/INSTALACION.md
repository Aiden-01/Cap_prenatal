# Instalacion del Microservicio OCR

Guia para instalar y probar el microservicio OCR en otra maquina.

## 1. Requisitos

- Python 3.12 o superior.
- Tesseract OCR.
- Git o acceso a la carpeta del proyecto.
- Backend Node del sistema CAP Prenatal.

El microservicio debe correr localmente, escuchando solo en:

```txt
http://127.0.0.1:5001
```

No debe exponerse publicamente.

## 2. Instalacion en Windows

### Instalar Python

Con `winget`:

```powershell
winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
```

Cerrar y abrir de nuevo PowerShell. Luego verificar:

```powershell
py --version
```

Si `py` no responde, verificar la ruta:

```powershell
where py
```

Python suele instalarse en:

```txt
C:\Users\<usuario>\AppData\Local\Programs\Python\Python312
```

### Instalar Tesseract OCR

```powershell
winget install --id tesseract-ocr.tesseract -e --source winget --accept-package-agreements --accept-source-agreements
```

Verificar:

```powershell
& "C:\Program Files\Tesseract-OCR\tesseract.exe" --version
```

### Instalar idioma espanol

Crear carpeta local de modelos dentro del microservicio:

```powershell
cd C:\ruta\cap_prenatal
New-Item -ItemType Directory -Force -Path "ocr-service\tessdata"
```

Descargar `spa.traineddata`:

```powershell
Invoke-WebRequest `
  -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/spa.traineddata" `
  -OutFile "ocr-service\tessdata\spa.traineddata"
```

Verificar que Tesseract detecte el idioma:

```powershell
& "C:\Program Files\Tesseract-OCR\tesseract.exe" `
  --tessdata-dir "C:\ruta\cap_prenatal\ocr-service\tessdata" `
  --list-langs
```

Debe aparecer:

```txt
spa
```

## 3. Crear entorno virtual

Desde la carpeta del microservicio:

```powershell
cd C:\ruta\cap_prenatal\ocr-service
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Verificar dependencias:

```powershell
.\.venv\Scripts\python.exe -m py_compile app.py services\preprocess.py services\extract_text.py services\parse_patient.py
```

## 4. Levantar el microservicio

```powershell
cd C:\ruta\cap_prenatal\ocr-service
.\.venv\Scripts\python.exe app.py
```

Debe quedar escuchando en:

```txt
http://127.0.0.1:5001
```

Probar health:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:5001/health"
```

Respuesta esperada:

```json
{
  "ok": true,
  "service": "ocr-service"
}
```

## 5. Probar OCR manualmente

Con una imagen:

```powershell
curl.exe -X POST http://127.0.0.1:5001/procesar-nueva-paciente `
  -F "documento=@C:\ruta\documento.jpg"
```

Respuesta esperada:

```json
{
  "ok": true,
  "campos_detectados": {},
  "confianza": {},
  "texto_extraido": "Texto detectado",
  "requiere_revision": true
}
```

Los campos pueden venir vacios si la imagen esta borrosa, muy oscura, inclinada o escrita a mano.

## 6. Configurar backend Node

En el `.env` del backend agregar:

```env
OCR_SERVICE_URL=http://127.0.0.1:5001
```

El frontend no llama directamente al OCR Python. El flujo correcto es:

```txt
Frontend -> Backend Node /api/ocr/nueva-paciente -> OCR Python localhost
```

## 7. Levantar ambos servicios para pruebas

Terminal 1, OCR:

```powershell
cd C:\ruta\cap_prenatal\ocr-service
.\.venv\Scripts\python.exe app.py
```

Terminal 2, backend:

```powershell
cd C:\ruta\cap_prenatal\backend
npm run dev
```

Terminal 3, frontend:

```powershell
cd C:\ruta\cap_prenatal\frontend
npm run dev
```

## 8. Produccion recomendada

- Backend Node con PM2.
- OCR Python con PM2 o servicio de Windows/systemd.
- OCR escuchando solo en `127.0.0.1`.
- Nginx/IIS/proxy exponiendo solo frontend y backend.
- No abrir publicamente el puerto `5001`.

## 9. Problemas comunes

### `py` no se reconoce

Cerrar y abrir PowerShell. Si sigue fallando, usar la ruta directa:

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" --version
```

Para crear el venv:

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m venv .venv
```

### `python` abre Microsoft Store

Usar `py` o el Python del venv:

```powershell
.\.venv\Scripts\python.exe app.py
```

### Tesseract no se encuentra

Verificar:

```powershell
Test-Path "C:\Program Files\Tesseract-OCR\tesseract.exe"
```

El codigo ya busca esa ruta automaticamente en Windows. Tambien puede configurarse:

```powershell
$env:TESSERACT_CMD="C:\Program Files\Tesseract-OCR\tesseract.exe"
```

### No detecta espanol

Verificar que exista:

```txt
ocr-service/tessdata/spa.traineddata
```

Y probar:

```powershell
& "C:\Program Files\Tesseract-OCR\tesseract.exe" `
  --tessdata-dir "C:\ruta\cap_prenatal\ocr-service\tessdata" `
  --list-langs
```

### OCR devuelve pocos datos

Es esperado en imagenes de mala calidad. El OCR es ayuda opcional; el usuario siempre debe revisar y completar manualmente.

## 10. Seguridad

- El OCR no guarda pacientes.
- El OCR no inserta datos en BD.
- El OCR solo devuelve JSON preliminar.
- El usuario debe aplicar los datos al formulario y confirmar el registro normal.
- El registro final sigue pasando por `POST /api/pacientes`.
