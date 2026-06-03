import os

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from services.env import load_local_env

load_local_env()

from services.google_vision import extract_google_vision_fields
from services.template_form import extract_template_fields


app = FastAPI(title="CAP Prenatal OCR Service")


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "ocr-service",
        "ocr_engine": "google-vision+tesseract-local" if os.getenv("GOOGLE_VISION_API_KEY") else "tesseract-local",
        "google_vision_enabled": bool(os.getenv("GOOGLE_VISION_API_KEY")),
    }


@app.post("/procesar-nueva-paciente")
async def procesar_nueva_paciente(documento: UploadFile = File(...)):
    try:
        image_bytes = await documento.read()
        if not image_bytes:
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "campos_detectados": {},
                    "confianza": {},
                    "texto_extraido": "",
                    "requiere_revision": True,
                    "errores": ["Archivo vacio"],
                },
            )

        google_result = extract_google_vision_fields(image_bytes)
        template_result = extract_template_fields(image_bytes)

        campos_detectados = dict(template_result["campos_detectados"])
        confianza = dict(template_result["confianza"])
        sugerencias_revision = dict(template_result.get("sugerencias_revision", {}))
        texto_extraido = template_result["texto_extraido"]
        ocr_lang = "spa-template"
        advertencias = [
            "OCR local gratuito: no se aplican lecturas dudosas automaticamente. Si no detecta campos, capture manualmente."
        ]

        if google_result:
            campos_detectados.update(google_result["campos_detectados"])
            confianza.update(google_result["confianza"])
            texto_extraido = f"google_vision:\n{google_result['texto_extraido']}\n\ntesseract:\n{texto_extraido}"
            ocr_lang = "google-vision+spa-template"
            advertencias = [
                "Google Vision aplicado. Revise los campos antes de registrar; no se sobrescriben datos ya llenos."
            ]
        elif os.getenv("GOOGLE_VISION_API_KEY"):
            advertencias = [
                "Google Vision esta configurado pero no respondio correctamente; se uso OCR local como respaldo."
            ]

        return {
            "ok": True,
            "campos_detectados": campos_detectados,
            "confianza": confianza,
            "sugerencias_revision": sugerencias_revision,
            "texto_extraido": texto_extraido,
            "requiere_revision": True,
            "ocr_lang": ocr_lang,
            "google_vision_enabled": bool(os.getenv("GOOGLE_VISION_API_KEY")),
            "advertencias": advertencias,
        }
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "campos_detectados": {},
                "confianza": {},
                "texto_extraido": "",
                "requiere_revision": True,
                "errores": [str(exc)],
            },
        )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "5001"))
    uvicorn.run(app, host="127.0.0.1", port=port)
