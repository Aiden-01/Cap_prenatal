import re
from datetime import datetime


DATE_RE = re.compile(r"\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b")


def normalize_date(value: str | None):
    if not value:
        return None

    value = value.strip()
    formats = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"]
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def first_match(pattern: str, text: str, flags=re.IGNORECASE):
    match = re.search(pattern, text, flags)
    return match.group(1).strip() if match else None


def confidence(value, base=0.72):
    return base if value else None


def parse_patient_text(text: str):
    compact = re.sub(r"[ \t]+", " ", text or "")
    fields = {}
    scores = {}

    cui = first_match(r"\b(\d{13})\b", compact)
    if cui:
        fields["cui"] = cui
        scores["cui"] = 0.88

    expediente = first_match(
        r"(?:no\.?\s*)?(?:expediente|registro|historia\s+clinica|historia\s+cl[ií]nica)\s*[:#-]?\s*([A-Z0-9-]{3,30})",
        compact,
    )
    if expediente:
        fields["no_expediente"] = expediente
        scores["no_expediente"] = 0.82

    edad = first_match(r"\bedad\s*[:#-]?\s*(\d{1,3})\b", compact)
    if edad:
        fields["edad"] = edad
        scores["edad"] = 0.85

    fecha_nacimiento = first_match(
        r"(?:fecha\s+de\s+nacimiento|nacimiento|fec\.?\s*nac\.?)\s*[:#-]?\s*(" + DATE_RE.pattern[2:-2] + r")",
        compact,
    )
    normalized_birth = normalize_date(fecha_nacimiento)
    if normalized_birth:
        fields["fecha_nacimiento"] = normalized_birth
        scores["fecha_nacimiento"] = 0.76

    fur = first_match(
        r"(?:\bfur\b|fecha\s+(?:de\s+)?[uú]ltima\s+regla|ultima\s+regla)\s*[:#-]?\s*(" + DATE_RE.pattern[2:-2] + r")",
        compact,
    )
    normalized_fur = normalize_date(fur)
    if normalized_fur:
        fields["fur"] = normalized_fur
        scores["fur"] = 0.82

    fpp = first_match(r"(?:\bfpp\b|fecha\s+probable\s+de\s+parto)\s*[:#-]?\s*(" + DATE_RE.pattern[2:-2] + r")", compact)
    normalized_fpp = normalize_date(fpp)
    if normalized_fpp:
        fields["fpp"] = normalized_fpp
        scores["fpp"] = 0.78

    obstetric_map = {
        "gestas": r"(?:\bgestas\b|\bgesta\b|\bg\b)\s*[:#-]?\s*(\d{1,2})\b",
        "partos": r"(?:\bpartos\b|\bparto\b|\bp\b)\s*[:#-]?\s*(\d{1,2})\b",
        "abortos": r"(?:\babortos\b|\baborto\b|\ba\b)\s*[:#-]?\s*(\d{1,2})\b",
        "cesareas": r"(?:\bces[aá]reas\b|\bcesarea\b|\bc\b)\s*[:#-]?\s*(\d{1,2})\b",
    }

    for key, pattern in obstetric_map.items():
        value = first_match(pattern, compact)
        if value:
            fields[key] = value
            scores[key] = 0.7

    # Nombre/apellidos por etiquetas explícitas. Se dejan con confianza media.
    nombres = first_match(r"\bnombres?\s*[:#-]?\s*([A-ZÁÉÍÓÚÑ ]{3,80})", compact)
    apellidos = first_match(r"\bapellidos?\s*[:#-]?\s*([A-ZÁÉÍÓÚÑ ]{3,80})", compact)
    if nombres:
        fields["nombres"] = re.sub(r"\s+", " ", nombres).strip()
        scores["nombres"] = 0.62
    if apellidos:
        fields["apellidos"] = re.sub(r"\s+", " ", apellidos).strip()
        scores["apellidos"] = 0.62

    return {
        "campos_detectados": fields,
        "confianza": scores,
        "requiere_revision": True,
    }
