import pytesseract


def extract_text(image) -> tuple[str, str]:
    try:
        return pytesseract.image_to_string(image, lang="spa"), "spa"
    except pytesseract.TesseractError:
        return pytesseract.image_to_string(image), "default"
