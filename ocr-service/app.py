import os

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from services.template_form import extract_template_fields


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

        template_result = extract_template_fields(image_bytes)

        return {
            "ok": True,
            "campos_detectados": template_result["campos_detectados"],
            "confianza": template_result["confianza"],
            "texto_extraido": template_result["texto_extraido"],
            "requiere_revision": True,
            "ocr_lang": "spa-template",
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
