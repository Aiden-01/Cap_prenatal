import os
from pathlib import Path

import pytesseract


ROOT_DIR = Path(__file__).resolve().parents[1]
LOCAL_TESSDATA = ROOT_DIR / "tessdata"
WINDOWS_TESSERACT = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")

if os.getenv("TESSERACT_CMD"):
    pytesseract.pytesseract.tesseract_cmd = os.getenv("TESSERACT_CMD")
elif WINDOWS_TESSERACT.exists():
    pytesseract.pytesseract.tesseract_cmd = str(WINDOWS_TESSERACT)


def extract_text(image) -> tuple[str, str]:
    config_parts = ["--psm 6", "-c preserve_interword_spaces=1"]
    if LOCAL_TESSDATA.exists():
        config_parts.append(f"--tessdata-dir {LOCAL_TESSDATA}")
    config = " ".join(config_parts)

    try:
        return pytesseract.image_to_string(image, lang="spa", config=config), "spa"
    except pytesseract.TesseractError:
        return pytesseract.image_to_string(image, config="--psm 6"), "default"
