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
    "no_expediente": (492, 8, 92, 18),
    "cui": (445, 30, 150, 30),
    "establecimiento": (70, 76, 190, 20),
    "distrito": (360, 76, 120, 22),
    "nombres": (55, 136, 230, 28),
    "apellidos": (335, 136, 245, 28),
    "domicilio": (55, 160, 230, 27),
    "municipio": (335, 160, 245, 30),
    "territorio": (55, 186, 95, 22),
    "sector": (335, 186, 95, 22),
    "comunidad": (55, 207, 230, 22),
    "telefono": (345, 194, 165, 32),
}

DATE_FIELDS = {
    "fecha_nacimiento": (0, 250, 68, 28),
    "fur": (350, 443, 80, 34),
    "fpp": (350, 465, 80, 34),
}

NUMERIC_FIELDS = {
    "cui",
    "telefono",
}

NON_PATIENT_FIELDS = {
    "establecimiento",
    "distrito",
}

FOCUSED_FIELDS = {"no_expediente", "cui", "nombres", "apellidos", "telefono"}

FOCUSED_BOXES = {
    "no_expediente": (470, 0, 120, 34),
    "cui": (445, 24, 150, 38),
    "nombres": (55, 124, 230, 22),
    "apellidos": (335, 124, 230, 22),
    "telefono": (345, 194, 165, 32),
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


def _warp_form(image, points):
    src = _order_points(points.reshape(4, 2).astype("float32"))
    dst = np.array(
        [[0, 0], [PAGE_W - 1, 0], [PAGE_W - 1, PAGE_H - 1], [0, PAGE_H - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(image, matrix, (PAGE_W, PAGE_H))


def _find_page_quad(contours, image_area):
    candidates = sorted(contours, key=cv2.contourArea, reverse=True)[:12]
    for contour in candidates:
        area = cv2.contourArea(contour)
        if area < image_area * 0.18:
            continue
        perimeter = cv2.arcLength(contour, True)
        for epsilon in (0.015, 0.02, 0.03, 0.045):
            approx = cv2.approxPolyDP(contour, epsilon * perimeter, True)
            if len(approx) == 4 and cv2.isContourConvex(approx):
                return approx

    for contour in candidates[:4]:
        area = cv2.contourArea(contour)
        if area < image_area * 0.22:
            continue
        rect = cv2.minAreaRect(contour)
        box = cv2.boxPoints(rect).astype("float32").reshape(4, 1, 2)
        box_area = cv2.contourArea(box)
        if box_area >= image_area * 0.22:
            return box

    return None


def rectify_form(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    image_area = image.shape[0] * image.shape[1]

    edges = cv2.Canny(blur, 50, 170)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    quad = _find_page_quad(contours, image_area)
    if quad is not None:
        return _warp_form(image, quad)

    thresh = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        9,
    )
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8), iterations=2)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    quad = _find_page_quad(contours, image_area)
    if quad is not None:
        return _warp_form(image, quad)

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
    blue_mask = cv2.inRange(hsv, np.array([82, 20, 20]), np.array([150, 255, 245]))

    if cv2.countNonZero(blue_mask) > 12:
        prepared = 255 - blue_mask
    else:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.bilateralFilter(gray, 7, 40, 40)
        prepared = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    prepared = cv2.resize(prepared, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    kernel = np.ones((2, 2), np.uint8)
    return cv2.morphologyEx(prepared, cv2.MORPH_OPEN, kernel)


def _best_ocr_candidate(candidates, numeric=False):
    cleaned = [re.sub(r"\s+", " ", candidate or "").strip() for candidate in candidates]
    cleaned = [candidate for candidate in cleaned if candidate]
    if not cleaned:
        return ""

    if numeric:
        return max(cleaned, key=lambda value: len(re.sub(r"\D", "", value)))

    def score(value):
        letters = len(re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", value))
        digits = len(re.findall(r"\d", value))
        return (letters * 2) - digits + min(len(value), 30) / 30

    return max(cleaned, key=score)


def ocr_crop(crop, numeric=False, multiline=False, whitelist=None):
    prepared = prepare_crop(crop)
    candidates = []
    psm_values = [6, 7, 8, 13] if numeric else ([6, 7] if multiline else [7, 8, 13])
    for psm in psm_values:
        config = f"--oem 1 --psm {psm} -c preserve_interword_spaces=1"
        if LOCAL_TESSDATA.exists():
            config += f" --tessdata-dir {LOCAL_TESSDATA}"
        if whitelist:
            config += f" -c tessedit_char_whitelist={whitelist}"
        elif numeric:
            config += " -c tessedit_char_whitelist=0123456789/-"
        try:
            candidates.append(pytesseract.image_to_string(prepared, lang="spa", config=config))
        except pytesseract.TesseractError:
            candidates.append(pytesseract.image_to_string(prepared, config=config))
    return _best_ocr_candidate(candidates, numeric=numeric)


def prepare_blue_crop(crop, scale=4, morph=None):
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    blue_mask = cv2.inRange(hsv, np.array([82, 20, 20]), np.array([150, 255, 245]))
    prepared = 255 - blue_mask
    prepared = cv2.resize(prepared, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    if morph == "open":
        prepared = cv2.morphologyEx(prepared, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    elif morph == "close":
        prepared = cv2.morphologyEx(prepared, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
    return prepared


def ocr_blue_variants(crop, numeric=False, psm_values=(6, 7, 8, 13), scales=(4, 5), morphs=(None, "open", "close")):
    candidates = []
    for scale in scales:
        for morph in morphs:
            prepared = prepare_blue_crop(crop, scale=scale, morph=morph)
            for psm in psm_values:
                config = f"--oem 1 --psm {psm} -c preserve_interword_spaces=1"
                if LOCAL_TESSDATA.exists():
                    config += f" --tessdata-dir {LOCAL_TESSDATA}"
                if numeric:
                    config += " -c tessedit_char_whitelist=0123456789/-"
                try:
                    candidates.append(pytesseract.image_to_string(prepared, lang="spa", config=config))
                except pytesseract.TesseractError:
                    candidates.append(pytesseract.image_to_string(prepared, config=config))
    return [re.sub(r"\s+", " ", candidate or "").strip() for candidate in candidates if candidate]


def clean_text(value):
    value = re.sub(r"[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ /.-]+", " ", value or "")
    value = re.sub(r"\s+", " ", value).strip(" -/")
    return value


def clean_digits(value):
    return re.sub(r"\D", "", value or "")


def clean_cui(value):
    digits = clean_digits(value)
    return digits if len(digits) == 13 else ""


def clean_phone(value):
    digits = clean_digits(value)
    if len(digits) == 8:
        return f"{digits[:4]}-{digits[4:]}"
    return ""


def clean_phone_candidate(value):
    digits = clean_digits(value)
    if len(digits) == 8:
        if digits[0] not in {"2", "3", "4", "5", "6", "7"}:
            return ""
        return f"{digits[:4]}-{digits[4:]}"
    if len(digits) == 9 and digits[0] in {"0", "1", "9"}:
        digits = digits[1:]
        if digits[0] not in {"2", "3", "4", "5", "6", "7"}:
            return ""
        return f"{digits[:4]}-{digits[4:]}"
    return ""


def clean_expediente(value):
    digits = clean_digits(value)
    if len(digits) >= 8 and digits.endswith("2026"):
        return f"{digits[:-4]}/{digits[-4:]}"
    if len(digits) >= 4:
        return digits
    return clean_text(value)


def normalize_box_date(value):
    digits = clean_digits(value)
    if len(digits) >= 8:
        digits = digits[-8:]
        return normalize_date(f"{digits[:2]}/{digits[2:4]}/{digits[4:]}")
    if len(digits) == 6:
        return normalize_date(f"{digits[:2]}/{digits[2:4]}/{digits[4:]}")
    return normalize_date(value)


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


def is_plausible_location(value):
    if re.search(r"[0-9./_]", value or ""):
        return False
    tokens = [token for token in re.split(r"\s+", value.strip()) if token]
    if not tokens or any(len(token) <= 1 for token in tokens):
        return False
    letters = re.findall(r"[A-Za-zÃÃ‰ÃÃ“ÃšÃœÃ‘Ã¡Ã©Ã­Ã³ÃºÃ¼Ã±]", value)
    return len(letters) >= 3 and len(tokens) <= 4


def is_reviewable_suggestion(value, field):
    value = clean_text(value)
    if not value or re.search(r"[0-9_./]", value):
        return False
    if re.search(r"\b[A-Za-zÃÃ‰ÃÃ“ÃšÃœÃ‘Ã¡Ã©Ã­Ã³ÃºÃ¼Ã±]\b", value):
        return False

    tokens = [token for token in re.split(r"\s+", value) if token]
    if not tokens or len(tokens) > 4:
        return False

    if field in {"nombres", "apellidos"}:
        return all(len(token) >= 3 for token in tokens) and len("".join(tokens)) >= 5

    return all(len(token) >= 2 for token in tokens) and any(len(token) >= 3 for token in tokens)


def clean_person_candidate(value):
    value = clean_text(value)
    value = re.sub(r"[^A-Za-zÃÃ‰ÃÃ“ÃšÃœÃ‘Ã¡Ã©Ã­Ã³ÃºÃ¼Ã± ]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    if re.search(r"[0-9_./]", value):
        return ""
    tokens = [token for token in value.split() if len(token) > 1]
    value = " ".join(tokens)
    if not value or not is_reviewable_suggestion(value, "nombres"):
        return ""
    return value.title()


def best_person_candidate(candidates):
    cleaned = [clean_person_candidate(candidate) for candidate in candidates]
    cleaned = [candidate for candidate in cleaned if candidate]
    if not cleaned:
        return ""
    return max(cleaned, key=lambda value: (len(value.split()), len(value)))


def best_phone_candidate(candidates):
    cleaned = [clean_phone_candidate(candidate) for candidate in candidates]
    cleaned = [candidate for candidate in cleaned if candidate]
    if not cleaned:
        return ""
    return max(cleaned, key=lambda value: candidates.count(value))


def extract_focused_fields(form):
    fields = {}
    confidence = {}
    raw_parts = []

    name_crop = crop_field(form, FOCUSED_BOXES["nombres"], pad=2)
    name_candidates = ocr_blue_variants(name_crop, psm_values=(6, 7, 8, 13), scales=(4, 5), morphs=(None, "open", "close"))
    raw_parts.append(f"nombres_focus: {' | '.join(name_candidates[:8])}")
    nombres = best_person_candidate(name_candidates)
    if nombres:
        fields["nombres"] = nombres
        confidence["nombres"] = 0.58

    last_crop = crop_field(form, FOCUSED_BOXES["apellidos"], pad=2)
    last_candidates = ocr_blue_variants(last_crop, psm_values=(6, 7, 8, 13), scales=(4, 5), morphs=(None, "open", "close"))
    raw_parts.append(f"apellidos_focus: {' | '.join(last_candidates[:8])}")
    apellidos = best_person_candidate(last_candidates)
    if apellidos:
        fields["apellidos"] = apellidos
        confidence["apellidos"] = 0.5

    phone_crop = crop_field(form, FOCUSED_BOXES["telefono"], pad=8)
    phone_candidates = ocr_blue_variants(phone_crop, numeric=True, psm_values=(6,), scales=(3, 4), morphs=("open", "close"))
    raw_parts.append(f"telefono_focus: {' | '.join(phone_candidates[:8])}")
    telefono = best_phone_candidate(phone_candidates)
    if telefono:
        fields["telefono"] = telefono
        confidence["telefono"] = 0.72

    cui_crop = crop_field(form, FOCUSED_BOXES["cui"], pad=10)
    cui_candidates = ocr_blue_variants(cui_crop, numeric=True, psm_values=(6, 7), scales=(3, 4), morphs=(None, "open", "close"))
    raw_parts.append(f"cui_focus: {' | '.join(cui_candidates[:8])}")
    for candidate in sorted(cui_candidates, key=lambda value: len(clean_digits(value)), reverse=True):
        cui = clean_cui(candidate)
        if cui:
            fields["cui"] = cui
            confidence["cui"] = 0.64
            break

    expediente_crop = crop_field(form, FOCUSED_BOXES["no_expediente"], pad=6)
    expediente_candidates = ocr_blue_variants(expediente_crop, numeric=True, psm_values=(6, 7, 8, 13), scales=(4, 6, 8), morphs=(None, "open", "close"))
    raw_parts.append(f"no_expediente_focus: {' | '.join(expediente_candidates[:8])}")
    for candidate in sorted(expediente_candidates, key=lambda value: len(clean_digits(value)), reverse=True):
        expediente = clean_expediente(candidate)
        if len(clean_digits(expediente)) >= 4:
            fields["no_expediente"] = expediente
            confidence["no_expediente"] = 0.58
            break

    return fields, confidence, "\n".join(raw_parts)


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
    review_suggestions = {}
    focus_fields, focus_confidence, focus_raw = extract_focused_fields(form)
    fields.update(focus_fields)
    confidence.update(focus_confidence)
    raw_parts = [focus_raw]

    for name, box in TEXT_FIELDS.items():
        if name not in FOCUSED_FIELDS or name in fields:
            continue
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
            whitelist="0123456789/-" if name in {"no_expediente", "cui", "telefono"} else None,
        )
        raw_parts.append(f"{name}: {value}")
        if not value:
            continue
        if name in NON_PATIENT_FIELDS:
            continue

        if name == "cui":
            value = clean_cui(value)
            if not value:
                continue
        elif name == "no_expediente":
            value = clean_expediente(value)
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
                if is_reviewable_suggestion(value, name):
                    review_suggestions[name] = value.title()
                continue
            if name in {"domicilio", "municipio", "comunidad"} and not is_plausible_location(value):
                if is_reviewable_suggestion(value, name):
                    review_suggestions[name] = value.title()
                continue

        fields[name] = value.title() if name not in NUMERIC_FIELDS and name != "no_expediente" else value
        if name == "telefono":
            confidence[name] = 0.72
        elif name in NUMERIC_FIELDS or name == "no_expediente":
            confidence[name] = 0.66
        else:
            confidence[name] = 0.42

    split_name_if_needed(fields, "\n".join(raw_parts))

    return {
        "campos_detectados": fields,
        "confianza": confidence,
        "sugerencias_revision": review_suggestions,
        "texto_extraido": "\n".join(raw_parts),
    }
