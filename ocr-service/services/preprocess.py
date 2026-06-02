import cv2
import numpy as np


def read_image(image_bytes: bytes):
    data = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("No se pudo leer la imagen enviada")
    return image


def preprocess_image(image_bytes: bytes):
    image = read_image(image_bytes)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, 20, 7, 21)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrasted = clahe.apply(denoised)

    threshold = cv2.adaptiveThreshold(
        contrasted,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )

    return threshold
