import os
import re
from pathlib import Path

import cv2
import numpy as np
import pytesseract

from services.parse_patient import normalize_date


ROOT_DIR = Path(__file__).resolve().parents[1]
LOCAL_TESSDATA = ROOT_DIR / "tessdata"
WINDOWS_TESSERACT = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")

if os.getenv("TESSERACT_CMD"):
    pytesseract.pytesseract.tesseract_cmd = os.getenv("TESSERACT_CMD")
elif WINDOWS_TESSERACT.exists():
    pytesseract.pytesseract.tesseract_cmd = str(WINDOWS_TESSERACT)

PAGE_W = 612
PAGE_H = 936

TEXT_FIELDS = {
    "no_expediente": (470, 0, 120, 34),
    "cui": (445, 24, 150, 38),
    "establecimiento": (70, 76, 190, 20),
    "distrito": (360, 76, 120, 22),
    "nombres": (55, 124, 230, 22),
    "apellidos": (335, 124, 230, 22),
    "domicilio": (55, 148, 230, 22),
    "municipio": (335, 158, 230, 22),
    "territorio": (55, 176, 80, 20),
    "sector": (335, 176, 80, 20),
    "comunidad": (55, 198, 230, 22),
    "telefono": (345, 194, 165, 32),
}

DATE_FIELDS = {
    "fecha_nacimiento": (0, 238, 65, 35),
    "fur": (350, 443, 80, 34),
    "fpp": (350, 465, 80, 34),
}

NUMERIC_FIELDS = {
    "cui",
    "telefono",
}


def _order_points(points):
    rect = np.zeros((4, 2), dtype="float32")
    sums = points.sum(axis=1)
    diffs = np.diff(points, axis=1)
    rect[0] = points[np.argmin(sums)]
    rect[2] = points[np.argmax(sums)]
    rect[1] = points[np.argmin(diffs)]
    rect[3] = points[np.argmax(diffs)]
    return rect


def read_color_image(image_bytes: bytes):
    data = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("No se pudo leer la imagen enviada")
    return image


def rectify_form(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 60, 180)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return cv2.resize(image, (PAGE_W, PAGE_H))

    image_area = image.shape[0] * image.shape[1]
    candidates = sorted(contours, key=cv2.contourArea, reverse=True)[:8]
    for contour in candidates:
        if cv2.contourArea(contour) < image_area * 0.2:
            continue
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) == 4:
            src = _order_points(approx.reshape(4, 2).astype("float32"))
            dst = np.array(
                [[0, 0], [PAGE_W - 1, 0], [PAGE_W - 1, PAGE_H - 1], [0, PAGE_H - 1]],
                dtype="float32",
            )
            matrix = cv2.getPerspectiveTransform(src, dst)
            return cv2.warpPerspective(image, matrix, (PAGE_W, PAGE_H))

    return cv2.resize(image, (PAGE_W, PAGE_H))


def crop_field(form, box, pad=3):
    x, y, w, h = box
    x1 = max(int(x - pad), 0)
    y1 = max(int(y - pad), 0)
    x2 = min(int(x + w + pad), PAGE_W)
    y2 = min(int(y + h + pad), PAGE_H)
    return form[y1:y2, x1:x2]


def prepare_crop(crop):
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    blue_mask = cv2.inRange(hsv, np.array([85, 25, 20]), np.array([145, 255, 230]))

    if cv2.countNonZero(blue_mask) > 12:
        prepared = 255 - blue_mask
    else:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.bilateralFilter(gray, 7, 40, 40)
        prepared = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    prepared = cv2.resize(prepared, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    kernel = np.ones((2, 2), np.uint8)
    return cv2.morphologyEx(prepared, cv2.MORPH_OPEN, kernel)


def ocr_crop(crop, numeric=False, multiline=False):
    prepared = prepare_crop(crop)
    config = "--psm 6" if multiline else "--psm 7"
    if LOCAL_TESSDATA.exists():
        config += f" --tessdata-dir {LOCAL_TESSDATA}"
    if numeric:
        config += " -c tessedit_char_whitelist=0123456789/-"
    text = pytesseract.image_to_string(prepared, lang="spa", config=config)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_text(value):
    value = re.sub(r"[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ /.-]+", " ", value or "")
    value = re.sub(r"\s+", " ", value).strip(" -/")
    return value


def clean_digits(value):
    return re.sub(r"\D", "", value or "")


def clean_phone(value):
    digits = clean_digits(value)
    if len(digits) == 8:
        return f"{digits[:4]}-{digits[4:]}"
    return ""


def is_plausible_text(value, min_letters=2):
    letters = re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", value or "")
    return len(letters) >= min_letters


def is_plausible_name(value):
    if re.search(r"[0-9./_]", value or ""):
        return False
    tokens = [token for token in re.split(r"\s+", value.strip()) if token]
    if not tokens or any(len(token) <= 1 for token in tokens) or not any(len(token) >= 3 for token in tokens):
        return False
    letters = re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", value)
    return len(letters) >= 4 and len(tokens) <= 4


def split_name_if_needed(fields, raw_text):
    if fields.get("nombres") or fields.get("apellidos"):
        return

    match = re.search(r"(?:NOMBRE COMPLETO|PACIENTE)\s*[:#-]?\s*([A-ZÁÉÍÓÚÑ ]{6,80})", raw_text, re.IGNORECASE)
    if not match:
        return

    parts = clean_text(match.group(1)).split()
    if len(parts) >= 4:
        fields["nombres"] = " ".join(parts[:2]).title()
        fields["apellidos"] = " ".join(parts[2:]).title()


def extract_template_fields(image_bytes: bytes):
    image = read_color_image(image_bytes)
    form = rectify_form(image)
    fields = {}
    confidence = {}
    raw_parts = []

    for name, box in TEXT_FIELDS.items():
        value = ocr_crop(
            crop_field(form, box, pad=3 if name in {"no_expediente", "cui", "telefono"} else 1),
            numeric=name in NUMERIC_FIELDS,
            multiline=name
            in {
                "nombres",
                "apellidos",
                "domicilio",
                "municipio",
                "comunidad",
            },
        )
        raw_parts.append(f"{name}: {value}")
        if not value:
            continue

        if name == "cui":
            value = clean_digits(value)
            if len(value) != 13:
                continue
        elif name == "no_expediente":
            value = clean_text(value)
            if len(clean_digits(value)) < 4:
                continue
        elif name == "telefono":
            value = clean_phone(value)
            if not value:
                continue
        elif name == "territorio":
            value = clean_text(value).upper()
            value = re.sub(r"[^0-9]", "", value)
            if value not in {"1", "2", "3", "4"}:
                continue
        elif name == "sector":
            value = clean_text(value).upper()
            value = re.sub(r"[^A-Z]", "", value)
            if value not in {"A", "B"}:
                continue
        else:
            value = clean_text(value)
            if len(value) < 2 or not is_plausible_text(value):
                continue
            if name in {"nombres", "apellidos"} and not is_plausible_name(value):
                continue

        fields[name] = value.title() if name not in NUMERIC_FIELDS and name != "no_expediente" else value
        if name == "telefono":
            confidence[name] = 0.72
        elif name in NUMERIC_FIELDS or name == "no_expediente":
            confidence[name] = 0.66
        else:
            confidence[name] = 0.48

    for name, box in DATE_FIELDS.items():
        value = ocr_crop(crop_field(form, box, pad=1), numeric=True)
        raw_parts.append(f"{name}: {value}")
        normalized = normalize_date(value)
        if normalized:
            fields[name] = normalized
            confidence[name] = 0.62

    split_name_if_needed(fields, "\n".join(raw_parts))

    return {
        "campos_detectados": fields,
        "confianza": confidence,
        "texto_extraido": "\n".join(raw_parts),
    }
