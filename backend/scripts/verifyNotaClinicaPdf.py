"""QA de muestras sintéticas de test/notaClinicaPdf.test.js (pdfplumber + Pillow).

Ejecutar desde la raíz del repositorio después de generar las muestras y renderizar
sus páginas con pdftoppm en tmp/pdfs/cpren120/{medica,enfermeria}-N.png.
No accede a pacientes ni a bases de datos.
"""
import hashlib
import json
from pathlib import Path

import pdfplumber
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/cpren120'
OUT.mkdir(parents=True, exist_ok=True)
expected = '\n\n'.join(
    f'Párrafo {i}: Atención sintética con tildes áéíóú, ñ y saltos de línea. Evolución clínica documentada.\nContinuación del párrafo {i}.'
    for i in range(1, 101)
) + '\n' + 'TextoSinEspacios' * 80 + '\nFIN-SINTETICO-120'
normalize = lambda value: ''.join(value.split())
header_lines = {'CAP El Chal', 'DDRISS Petén', 'Área Sur Oriente'}
report = {'synthetic_only': True, 'documents': [], 'assets': []}
thumbs = []
for tipo, prefix in [('nota_evolucion', 'medica'), ('nota_enfermeria', 'enfermeria')]:
    target = ROOT / f'output/pdf/cpren120-{tipo}-sintetica.pdf'
    with pdfplumber.open(target) as pdf:
        assert len(pdf.pages) >= 3
        narrative = []
        for index, page in enumerate(pdf.pages, 1):
            assert (page.width, page.height) == (612, 792)
            text = page.extract_text()
            assert 'CAP El Chal' in text and 'DDRISS Petén' in text and 'Área Sur Oriente' in text
            assert f'Página {index} de {len(pdf.pages)}' in text
            assert len(page.images) == 2, 'Ambos logos deben aparecer en cada página'
            for img, ratio in zip(sorted(page.images, key=lambda img: img['x0']), [421 / 151, 158 / 151]):
                assert abs(img['width'] / img['height'] - ratio) < .02
                assert 30 <= img['x0'] < img['x1'] <= 582
                assert 0 <= img['top'] < img['bottom'] <= 85
            for char in page.chars:
                assert 30 <= char['x0'] <= char['x1'] <= 583, 'Texto fuera del área imprimible'
                assert 0 <= char['top'] < char['bottom'] <= 780
                # El cuerpo no invade las zonas reservadas a encabezado y pie.
                assert char['bottom'] <= 85 or 90 <= char['top'] and char['bottom'] <= 748 or char['top'] >= 760
            narrative.extend(line for line in text.splitlines()
                             if line not in header_lines and not line.startswith('CAP El Chal · Documento clínico'))
            image_path = ROOT / f'tmp/pdfs/cpren120/{prefix}-{index}.png'
            if image_path.exists():
                with Image.open(image_path) as rendered:
                    thumb = ImageOps.contain(rendered.convert('RGB'), (300, 400))
                    card = Image.new('RGB', (320, 430), 'white')
                    card.paste(thumb, ((320 - thumb.width) // 2, 20))
                    ImageDraw.Draw(card).text((10, 410), f'{tipo} / {index}', fill='black')
                    thumbs.append(card)
        assert normalize(expected) in normalize('\n'.join(narrative)), 'La narrativa debe recuperarse completa con acentos y sin truncar'
        report['documents'].append({'file': target.name, 'pages': len(pdf.pages), 'letter_portrait': True,
                                    'logos_each_page': True, 'full_narrative_accents_verified': True,
                                    'bounds_and_header_footer_separation_verified': True})
for name in ['gobierno-guatemala-mspas.png', 'ddriss-peten-area-sur-oriente.png']:
    target = ROOT / 'backend/src/assets/institucional' / name
    with Image.open(target) as img:
        report['assets'].append({'file': name, 'size': list(img.size), 'mode': img.mode,
                                 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
if thumbs:
    sheet = Image.new('RGB', (320 * 3, 430 * ((len(thumbs) + 2) // 3)), '#dddddd')
    for index, card in enumerate(thumbs):
        sheet.paste(card, ((index % 3) * 320, (index // 3) * 430))
    sheet.save(OUT / 'pdf-contact-sheet.png')
report_path = OUT / 'pdf-validation.json'
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=True))
