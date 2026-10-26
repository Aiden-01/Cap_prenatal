"""Verificación de PDF sintéticos CHECKPOINT-13: texto, referencias, cierre y PNG."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
import pdfplumber
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/cpren120/checkpoint13'
RENDER = OUT / 'pages'
RENDER.mkdir(parents=True, exist_ok=True)
normalize = lambda text: ''.join(text.split())
cases = json.loads((OUT / 'synthetic-cases.json').read_text(encoding='utf-8'))['cases']
cases.extend(json.loads((OUT / 'endpoint-cases.json').read_text(encoding='utf-8'))['cases'])
old_expected = '\n\n'.join(f'Párrafo {i}: Atención sintética con tildes áéíóú, ñ y saltos de línea. Evolución clínica documentada.\nContinuación del párrafo {i}.' for i in range(1, 101)) + '\n' + 'TextoSinEspacios' * 80 + '\nFIN-SINTETICO-120'
for kind in ['nota_evolucion', 'nota_enfermeria']:
    for limit in [False, True]:
        cases.append({'file': f'regression/cpren120-{kind}-' + ('limite-' if limit else '') + 'sintetica.pdf',
                      'data': {'nota': {'contenido': ('ÁéíóúÑñ' * 2858)[:20000] if limit else old_expected,
                                       'control_prenatal_id': 3 if kind == 'nota_evolucion' else None}}})
report = {'synthetic_only': True, 'equipo': 'Casa', 'machine': 'HUGUITO', 'documents': [], 'assets': []}
cards = []
renderer = shutil.which('pdftoppm')
assert renderer, 'Se requiere Poppler'
for case in cases:
    target = OUT / case['file']
    with pdfplumber.open(target) as pdf:
        if 'pages' in case:
            assert len(pdf.pages) == case['pages']
        actual = []
        signature_spaces = []
        renders = []
        for number, page in enumerate(pdf.pages, 1):
            assert (page.width, page.height) == (612, 792)
            text = page.extract_text()
            assert f'Hoja No. {number} de {len(pdf.pages)}' in text
            assert 'CAP El Chal' in text and 'DDRISS Petén Área Sur Oriente' in text
            assert text.count('FIN DE NOTA') == (1 if number == len(pdf.pages) else 0)
            assert normalize('Capturista: Nombre histórico no disponible') in normalize(text)
            assert 'Hospital de San Benito' not in text
            if not case['data']['nota']['control_prenatal_id']:
                assert 'Sin control asociado' in text
            elif case['data'].get('control'):
                control = case['data']['control']
                control_date = '/'.join(control['fecha'].split('-')[::-1])
                assert normalize(f"Control: N.º {control['numero']} · {control_date}") in normalize(text)
            else:
                assert 'Referencia no disponible' in text
            dates = ''.join(c['text'] for c in page.chars if c['x1'] < 97 and 60 < c['top'] < 130)
            clinical_date = '/'.join(case['data']['nota'].get('fecha_atencion', '2026-10-20').split('-')[::-1])
            clinical_time = case['data']['nota'].get('hora_atencion', '09:30')[:5]
            assert dates.count(clinical_date) == dates.count(clinical_time) == 1, (case['file'], number, dates)
            assert len(page.images) == 2
            for img, ratio in zip(sorted(page.images, key=lambda im: im['x0']), [421 / 151, 158 / 151]):
                assert abs(img['width'] / img['height'] - ratio) < .02
                assert 29.99 <= img['x0'] < img['x1'] <= 582.01
            for c in page.chars:
                assert 29 <= c['x0'] < c['x1'] <= 583, (case['file'], number, 'margen horizontal', c)
                assert 0 <= c['top'] < c['bottom'] <= 780
            body = [c for c in page.chars if abs(c['size'] - 10.5) < .01 and c['x0'] >= 101]
            assert body, 'No debe haber una hoja solo para el cierre'
            actual.append(''.join(c['text'] for c in body))
            rules = {round(e['top'], 2) for e in page.horizontal_edges if e['x0'] <= 102 and e['x1'] >= 581}
            assert all(not any(c['top'] + .2 < y < c['bottom'] - .2 for y in rules) for c in body), 'Regla sobre glifo'
            signature = page.search('Nombre y firma del responsable')[0]
            sign_rules = [e['top'] for e in page.horizontal_edges if 700 < e['top'] < signature['top'] and e['x1'] - e['x0'] > 100]
            assert sign_rules
            sign_y = max(sign_rules)
            metadata = [c for c in page.chars if 650 < c['top'] and c['bottom'] < sign_y and abs(c['size'] - 6.75) < .01]
            gap = sign_y - max(c['bottom'] for c in metadata)
            assert gap >= 30, ('Firma insuficiente', gap)
            signature_spaces.append(round(gap, 2))
            if number == len(pdf.pages):
                marker = page.search('FIN DE NOTA')[0]
                assert marker['top'] > max(c['bottom'] for c in body), 'Cierre superpuesto a narrativa'
                assert marker['bottom'] + 3 < min(c['top'] for c in metadata), 'Cierre superpuesto a identificación'
            selected = {1, len(pdf.pages), (len(pdf.pages) + 1) // 2}
            render = case['file'].startswith('pdf/') and number in selected
            render |= case['file'].startswith('boundaries/') and case['file'].endswith(('33.pdf', '66.pdf')) and number == len(pdf.pages)
            render |= case['file'].endswith('nota_evolucion-limite-sintetica.pdf') and number in {1, len(pdf.pages)}
            if render:
                prefix = RENDER / f'{target.stem}-pagina-{number}'
                subprocess.run([renderer, '-f', str(number), '-l', str(number), '-singlefile', '-r', '120', '-png', str(target), str(prefix)], check=True, capture_output=True)
                renders.append(str(prefix.with_suffix('.png').relative_to(OUT)))
                if case['file'].startswith('pdf/'):
                    with Image.open(prefix.with_suffix('.png')) as im:
                        thumb = ImageOps.contain(im.convert('RGB'), (408, 528))
                        card = Image.new('RGB', (428, 565), 'white')
                        card.paste(thumb, ((428 - thumb.width) // 2, 8))
                        ImageDraw.Draw(card).text((8, 545), f'{target.stem} / {number}', fill='black')
                        cards.append(card)
        assert normalize(''.join(actual)) == normalize(case['data']['nota']['contenido']), ('Narrativa alterada', case['file'])
        report['documents'].append({'file': case['file'], 'pages': len(pdf.pages), 'letter_points': [612, 792],
            'narrative_exact': True, 'original_date_time_each_page': True, 'human_control_reference': True,
            'neutral_capturer': True, 'end_marker_last_page_only': True, 'no_ruling_over_text': True,
            'signature_clearance_points_min': min(signature_spaces), 'rendered': renders})
for name in ['gobierno-guatemala-mspas.png', 'ddriss-peten-area-sur-oriente.png']:
    file = ROOT / 'backend/src/assets/institucional' / name
    report['assets'].append({'file': name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
sheet = Image.new('RGB', (428 * 3, 565 * ((len(cards) + 2) // 3)), '#ddd')
for i, card in enumerate(cards):
    sheet.paste(card, ((i % 3) * 428, (i // 3) * 565))
sheet.save(OUT / 'contact-sheet.png')
(OUT / 'pdf-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=True))
