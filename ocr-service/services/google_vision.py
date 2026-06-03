import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

import cv2

from services.parse_patient import normalize_date
from services.template_form import (
    PAGE_H,
    PAGE_W,
    clean_cui,
    clean_digits,
    clean_expediente,
    clean_phone_candidate,
    clean_text,
    crop_field,
    read_color_image,
    rectify_form,
)


GOOGLE_FIELDS = {
    "no_expediente": (470, 0, 125, 34),
    "cui": (430, 24, 170, 40),
    "nombres": (45, 118, 250, 38),
    "apellidos": (325, 118, 265, 38),
    "telefono": (330, 188, 200, 45),
    "fecha_nacimiento": (0, 238, 78, 45),
    "fur": (345, 438, 90, 38),
    "fpp": (345, 462, 90, 38),
}


def _box_contains(box, x, y):
    bx, by, bw, bh = box
    return bx <= x <= bx + bw and by <= y <= by + bh


def _word_text(word):
    return "".join(symbol.get("text", "") for symbol in word.get("symbols", []))


def _word_center(word):
    vertices = word.get("boundingBox", {}).get("vertices", [])
    xs = [vertex.get("x", 0) for vertex in vertices]
    ys = [vertex.get("y", 0) for vertex in vertices]
    if not xs or not ys:
        return 0, 0
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _extract_words(response):
    words = []
    pages = response.get("fullTextAnnotation", {}).get("pages", [])
    for page in pages:
        for block in page.get("blocks", []):
            for paragraph in block.get("paragraphs", []):
                for word in paragraph.get("words", []):
                    text = _word_text(word).strip()
                    if not text:
                        continue
                    x, y = _word_center(word)
                    words.append({"text": text, "x": x, "y": y})
    return words


def _texts_in_box(words, box):
    selected = [word for word in words if _box_contains(box, word["x"], word["y"])]
    selected.sort(key=lambda word: (round(word["y"] / 8), word["x"]))
    return [word["text"] for word in selected]


def _clean_person(tokens):
    text = clean_text(" ".join(tokens))
    text = re.sub(r"[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    parts = [part for part in text.split() if len(part) >= 2]
    if not parts:
        return ""
    text = " ".join(parts)
    if len(re.sub(r"[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", "", text)) < 3:
        return ""
    return text.title()


def _clean_date(tokens):
    text = " ".join(tokens)
    direct = normalize_date(text)
    if direct:
        return direct

    digits = clean_digits(text)
    if len(digits) >= 8:
        digits = digits[-8:]
        return normalize_date(f"{digits[:2]}/{digits[2:4]}/{digits[4:]}")
    if len(digits) == 6:
        return normalize_date(f"{digits[:2]}/{digits[2:4]}/{digits[4:]}")
    return None


def _fix_fur_year(fields):
    fur = fields.get("fur")
    fpp = fields.get("fpp")
    if not fur or not fpp:
        return

    from datetime import datetime

    try:
        fur_date = datetime.strptime(fur, "%Y-%m-%d")
        fpp_date = datetime.strptime(fpp, "%Y-%m-%d")
        corrected_fur = fur_date.replace(year=fur_date.year - 1)
        if fur_date > fpp_date and 260 <= (fpp_date - corrected_fur).days <= 300:
            fields["fur"] = corrected_fur.strftime("%Y-%m-%d")
    except ValueError:
        return


def _normalize_fields(words):
    fields = {}
    confidence = {}
    raw_parts = []

    for field, box in GOOGLE_FIELDS.items():
        tokens = _texts_in_box(words, box)
        raw_parts.append(f"{field}: {' '.join(tokens)}")
        if not tokens:
            continue

        value = ""
        if field == "cui":
            value = clean_cui("".join(tokens))
        elif field == "no_expediente":
            value = clean_expediente(" ".join(tokens))
            if len(clean_digits(value)) < 4:
                value = ""
        elif field == "telefono":
            value = clean_phone_candidate(" ".join(tokens))
        elif field in {"fecha_nacimiento", "fur", "fpp"}:
            value = _clean_date(tokens)
        else:
            value = _clean_person(tokens)

        if value:
            fields[field] = value
            confidence[field] = 0.86

    _fix_fur_year(fields)
    return fields, confidence, "\n".join(raw_parts)


def _annotate(image_bytes):
    api_key = os.getenv("GOOGLE_VISION_API_KEY")
    if not api_key:
        return None

    payload = {
        "requests": [
            {
                "image": {"content": base64.b64encode(image_bytes).decode("ascii")},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                "imageContext": {"languageHints": ["es"]},
            }
        ]
    }
    query = urllib.parse.urlencode({"key": api_key})
    request = urllib.request.Request(
        f"https://vision.googleapis.com/v1/images:annotate?{query}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    responses = data.get("responses", [])
    if not responses or responses[0].get("error"):
        return None
    return responses[0]


def extract_google_vision_fields(image_bytes):
    image = read_color_image(image_bytes)
    form = rectify_form(image)
    ok, buffer = cv2.imencode(".jpg", form, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        return None

    response = _annotate(buffer.tobytes())
    if not response:
        return None

    words = _extract_words(response)
    fields, confidence, raw_text = _normalize_fields(words)
    return {
        "campos_detectados": fields,
        "confianza": confidence,
        "texto_extraido": raw_text,
    }
