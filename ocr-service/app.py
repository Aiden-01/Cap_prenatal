import os

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from services.extract_text import extract_text
from services.parse_patient import parse_patient_text
from services.preprocess import preprocess_image


app = FastAPI(title="CAP Prenatal OCR Service")


@app.get("/health")
async def health():
    return {"ok": True, "service": "ocr-service"}


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

        processed = preprocess_image(image_bytes)
        text, lang = extract_text(processed)
        parsed = parse_patient_text(text)

        return {
            "ok": True,
            "campos_detectados": parsed["campos_detectados"],
            "confianza": parsed["confianza"],
            "texto_extraido": text,
            "requiere_revision": True,
            "ocr_lang": lang,
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
