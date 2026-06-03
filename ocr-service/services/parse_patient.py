import re
import unicodedata
from datetime import datetime


DATE_VALUE = r"(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"


def strip_accents(value: str):
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(text: str):
    text = strip_accents(text).upper()
    text = text.replace("|", "1").replace("_", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def normalize_date(value: str | None):
    if not value:
        return None

    value = value.strip().replace(".", "/")
    formats = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"]
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def first_match(pattern: str, text: str, flags=re.IGNORECASE):
    match = re.search(pattern, text, flags)
    return match.group(1).strip(" :-#\n\t") if match else None


def clean_name(value: str | None):
    if not value:
        return None

    value = re.split(
        r"\b(?:APELLIDOS?|EDAD|CUI|DPI|EXPEDIENTE|REGISTRO|FECHA|FUR|FPP|DOMICILIO)\b",
        value,
        maxsplit=1,
    )[0]
    value = re.sub(r"[^A-Z ]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value if len(value) >= 3 else None


def clean_until_next_label(value: str | None):
    if not value:
        return None
    value = re.split(
        r"\b(?:CUI|DPI|NOMBRES?|APELLIDOS?|EDAD|FECHA|FUR|FPP|DOMICILIO|GESTAS?|PARTOS?|ABORTOS?|CESAREAS?)\b",
        value,
        maxsplit=1,
    )[0]
    value = re.sub(r"[^A-Z0-9-]+", "", value)
    return value if len(value) >= 3 else None


def parse_patient_text(text: str):
    compact = normalize_text(text)
    one_line = compact.replace("\n", " ")
    fields = {}
    scores = {}

    cui = first_match(r"\b(?:CUI|DPI)?\s*[:#-]?\s*((?:\d[\s-]?){13})\b", one_line)
    if cui:
        fields["cui"] = re.sub(r"\D", "", cui)
        scores["cui"] = 0.84

    expediente = first_match(
        r"(?:NO\.?\s*)?(?:EXPEDIENTE|REGISTRO|HISTORIA\s+CLINICA|HC)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s-]{2,30})",
        one_line,
    )
    expediente = clean_until_next_label(expediente)
    if expediente:
        fields["no_expediente"] = expediente
        scores["no_expediente"] = 0.78

    edad = first_match(r"\bEDAD\s*[:#-]?\s*(\d{1,3})\b", one_line)
    if edad and 0 < int(edad) < 120:
        fields["edad"] = edad
        scores["edad"] = 0.82

    fecha_nacimiento = first_match(
        rf"(?:FECHA\s+DE\s+NACIMIENTO|NACIMIENTO|FEC\.?\s*NAC\.?|F\.?\s*NAC\.?)\s*[:#-]?\s*{DATE_VALUE}",
        one_line,
    )
    normalized_birth = normalize_date(fecha_nacimiento)
    if normalized_birth:
        fields["fecha_nacimiento"] = normalized_birth
        scores["fecha_nacimiento"] = 0.74

    fur = first_match(
        rf"(?:\bFUR\b|FECHA\s+(?:DE\s+)?ULTIMA\s+REGLA|ULTIMA\s+REGLA)\s*[:#-]?\s*{DATE_VALUE}",
        one_line,
    )
    normalized_fur = normalize_date(fur)
    if normalized_fur:
        fields["fur"] = normalized_fur
        scores["fur"] = 0.8

    fpp = first_match(rf"(?:\bFPP\b|FECHA\s+PROBABLE\s+DE\s+PARTO)\s*[:#-]?\s*{DATE_VALUE}", one_line)
    normalized_fpp = normalize_date(fpp)
    if normalized_fpp:
        fields["fpp"] = normalized_fpp
        scores["fpp"] = 0.76

    obstetric_map = {
        "gestas": r"(?:\bGESTAS?\b|\bG\b)\s*[:#-]?\s*(\d{1,2})\b",
        "partos": r"(?:\bPARTOS?\b|\bP\b)\s*[:#-]?\s*(\d{1,2})\b",
        "abortos": r"(?:\bABORTOS?\b|\bAB\b|\bA\b)\s*[:#-]?\s*(\d{1,2})\b",
        "cesareas": r"(?:\bCESAREAS?\b|\bC\b)\s*[:#-]?\s*(\d{1,2})\b",
    }

    for key, pattern in obstetric_map.items():
        value = first_match(pattern, one_line)
        if value:
            fields[key] = value
            scores[key] = 0.68

    nombres = clean_name(first_match(r"\bNOMBRES?(?!\s+DEL)\s*[:#-]?\s*([A-Z ]{3,80})", one_line))
    apellidos = clean_name(first_match(r"\bAPELLIDOS?\s*[:#-]?\s*([A-Z ]{3,80})", one_line))
    nombre_completo = clean_name(first_match(r"\b(?:NOMBRE\s+COMPLETO|PACIENTE)\s*[:#-]?\s*([A-Z ]{6,100})", one_line))

    if nombres:
        fields["nombres"] = nombres.title()
        scores["nombres"] = 0.62
    if apellidos:
        fields["apellidos"] = apellidos.title()
        scores["apellidos"] = 0.62
    if nombre_completo and not nombres and not apellidos:
        parts = nombre_completo.split()
        if len(parts) >= 4:
            fields["nombres"] = " ".join(parts[:2]).title()
            fields["apellidos"] = " ".join(parts[2:]).title()
            scores["nombres"] = 0.55
            scores["apellidos"] = 0.55

    return {
        "campos_detectados": fields,
        "confianza": scores,
        "requiere_revision": True,
    }
