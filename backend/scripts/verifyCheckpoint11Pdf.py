"""QA de PDF sintéticos de Casa: texto exacto, geometría y páginas Poppler."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
import pdfplumber
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/cpren120/checkpoint12'
RENDER = OUT / 'pdf-pages'
RENDER.mkdir(parents=True, exist_ok=True)
expected = '\n\n'.join(
    f'Párrafo {i}: Atención sintética con tildes áéíóú, ñ y saltos de línea. Evolución clínica documentada.\nContinuación del párrafo {i}.'
    for i in range(1, 101)
) + '\n' + 'TextoSinEspacios' * 80 + '\nFIN-SINTETICO-120'
normalize = lambda value: ''.join(value.split())
report = {'synthetic_only': True, 'machine': 'HUGUITO', 'equipo': 'Casa', 'documents': [], 'assets': []}
thumbs = []
renderer = shutil.which('pdftoppm')
assert renderer, 'Se requiere Poppler pdftoppm para inspección visual'
for kind in ['nota_evolucion', 'nota_enfermeria']:
    target = OUT / 'pdf' / f'cpren120-{kind}-sintetica.pdf'
    with pdfplumber.open(target) as pdf:
        assert len(pdf.pages) >= 3
        narrative = []
        paragraphs = continuations = 0
        for index, page in enumerate(pdf.pages, 1):
            assert (page.width, page.height) == (612, 792)
            text = page.extract_text()
            for label in ['CAP El Chal', 'DDRISS Petén Área Sur Oriente', 'FECHA /',
                          'Nombre y firma del responsable', 'No equivale a firma clínica',
                          f'Hoja No. {index} de {len(pdf.pages)}', 'Paciente:', 'Responsable:', 'Cargo:']:
                assert label in text, (kind, index, label)
            assert 'Hospital de San Benito' not in text
            assert len(page.images) == 2
            for img, ratio in zip(sorted(page.images, key=lambda image: image['x0']), [421 / 151, 158 / 151]):
                assert abs(img['width'] / img['height'] - ratio) < .02, 'Logo deformado'
                assert 29.99 <= img['x0'] < img['x1'] <= 582.01
                assert 0 <= img['top'] < img['bottom'] <= 64.5
            for char in page.chars:
                assert 29 <= char['x0'] <= char['x1'] <= 583, (kind, index, 'margen horizontal', char)
                assert 0 <= char['top'] < char['bottom'] <= 780, (kind, index, 'margen vertical')
            body = [char for char in page.chars if char['x0'] >= 101 and 90 <= char['top'] and char['bottom'] <= 691]
            narrative.append(''.join(char['text'] for char in body))
            rules = {round(edge['top'], 2) for edge in page.horizontal_edges
                     if edge['x0'] <= 102 and edge['x1'] >= 581 and 90 < edge['top'] < 691}
            for char in body:
                assert not any(char['top'] + .2 < y < char['bottom'] - .2 for y in rules), (kind, index, 'línea sobre texto')
            rows = {}
            for char in body:
                rows.setdefault(round(char['top'], 1), []).append(char)
            lines = [''.join(c['text'] for c in sorted(row, key=lambda c: c['x0'])).strip() for row in rows.values()]
            paragraphs += sum(line.startswith('Párrafo ') for line in lines)
            continuations += sum(line.startswith('Continuación del párrafo ') for line in lines)
            if index in {1, (len(pdf.pages) + 1) // 2, len(pdf.pages)}:
                prefix = RENDER / f'{kind}-pagina-{index}'
                subprocess.run([renderer, '-f', str(index), '-l', str(index), '-singlefile', '-r', '120', '-png', str(target), str(prefix)], check=True, capture_output=True)
                with Image.open(prefix.with_suffix('.png')) as rendered:
                    thumb = ImageOps.contain(rendered.convert('RGB'), (408, 528))
                    card = Image.new('RGB', (428, 565), 'white')
                    card.paste(thumb, ((428 - thumb.width) // 2, 8))
                    ImageDraw.Draw(card).text((10, 545), f'{kind} / {index}', fill='black')
                    thumbs.append(card)
        assert normalize(''.join(narrative)) == normalize(expected), 'Narrativa alterada, duplicada, recortada o perdida'
        assert paragraphs == continuations == 100, 'Saltos explícitos o párrafos alterados'
        report['documents'].append({'file': str(target.relative_to(ROOT)), 'pages': len(pdf.pages),
            'size_points': [612, 792], 'exact_narrative_verified': True, 'paragraphs': paragraphs,
            'accents_and_unbroken_word_verified': True, 'logos_each_page_original_ratio': True,
            'signature_and_page_numbers_each_page': True, 'within_printable_bounds': True,
            'no_ruling_over_text': True, 'rendered_pages': [1, (len(pdf.pages) + 1) // 2, len(pdf.pages)]})
for name in ['gobierno-guatemala-mspas.png', 'ddriss-peten-area-sur-oriente.png']:
    target = ROOT / 'backend/src/assets/institucional' / name
    with Image.open(target) as img:
        report['assets'].append({'file': name, 'size': list(img.size), 'mode': img.mode,
                                 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
for kind in ['nota_evolucion', 'nota_enfermeria']:
    target = OUT / 'pdf' / f'cpren120-{kind}-limite-sintetica.pdf'
    with pdfplumber.open(target) as pdf:
        content = []
        for index, page in enumerate(pdf.pages, 1):
            assert (page.width, page.height) == (612, 792)
            assert f'Hoja No. {index} de {len(pdf.pages)}' in page.extract_text()
            body = [c for c in page.chars if c['x0'] >= 101 and 90 <= c['top'] and c['bottom'] <= 691]
            assert all(c['x1'] <= 583 for c in body)
            content.append(''.join(c['text'] for c in body))
            rules = {round(edge['top'], 2) for edge in page.horizontal_edges if edge['x0'] <= 102 and edge['x1'] >= 581 and 90 < edge['top'] < 691}
            assert all(not any(c['top'] + .2 < y < c['bottom'] - .2 for y in rules) for c in body)
            assert 'Nombre y firma del responsable' in page.extract_text()
            assert len(page.images) == 2
            if index in {1, (len(pdf.pages) + 1) // 2, len(pdf.pages)}:
                prefix = RENDER / f'{kind}-limite-pagina-{index}'
                subprocess.run([renderer, '-f', str(index), '-l', str(index), '-singlefile', '-r', '120', '-png', str(target), str(prefix)], check=True, capture_output=True)
        assert normalize(''.join(content)) == ('ÁéíóúÑñ' * 2858)[:20000], 'Pérdida en narrativa al límite'
        report['documents'].append({'file': str(target.relative_to(ROOT)), 'pages': len(pdf.pages),
            'size_points': [612, 792], 'exact_narrative_verified': True, 'unbroken_accented_characters': 20000})
sheet = Image.new('RGB', (428 * 3, 565 * 2), '#ddd')
for index, card in enumerate(thumbs):
    sheet.paste(card, ((index % 3) * 428, (index // 3) * 565))
sheet.save(OUT / 'pdf-contact-sheet.png')
(OUT / 'pdf-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=True))
