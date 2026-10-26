"""QA sintética CHECKPOINT-13B: identificación 9 pt, omisiones y paginación."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
import pdfplumber
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/cpren120/checkpoint13b'
RENDER = OUT / 'pages'
RENDER.mkdir(parents=True, exist_ok=True)
norm = lambda value: ''.join(value.split())
cases = json.loads((OUT / 'synthetic-cases.json').read_text(encoding='utf-8'))['cases']
cases += json.loads((OUT / 'endpoint-cases.json').read_text(encoding='utf-8'))['cases']
expected = '\n\n'.join(f'Párrafo {i}: Atención sintética con tildes áéíóú, ñ y saltos de línea. Evolución clínica documentada.\nContinuación del párrafo {i}.' for i in range(1, 101)) + '\n' + 'TextoSinEspacios' * 80 + '\nFIN-SINTETICO-120'
for kind in ['nota_evolucion', 'nota_enfermeria']:
    for limit in [False, True]:
        cases.append({'file': f'regression/cpren120-{kind}-' + ('limite-' if limit else '') + 'sintetica.pdf',
                      'data': {'nota': {'contenido': ('ÁéíóúÑñ' * 2858)[:20000] if limit else expected,
                                       'control_prenatal_id': 3 if kind == 'nota_evolucion' else None}}})
report = {'synthetic_only': True, 'equipo': 'Casa', 'machine': 'HUGUITO', 'documents': [], 'assets': []}
renderer = shutil.which('pdftoppm')
assert renderer
cards = []
for case in cases:
    target = OUT / case['file']
    with pdfplumber.open(target) as pdf:
        if 'pages' in case:
            assert len(pdf.pages) == case['pages']
        narrative, clearances, renders = [], [], []
        for index, page in enumerate(pdf.pages, 1):
            assert (page.width, page.height) == (612, 792)
            text = page.extract_text()
            left_text = page.crop((29, 0, 334.6, 792)).extract_text()
            right_text = page.crop((343.6, 0, 583, 792)).extract_text()
            for forbidden in ['Captura finalizada', 'No equivale a firma clínica', 'Nombre histórico no disponible', 'Captura no finalizada']:
                assert forbidden not in text, (case['file'], index, forbidden)
            assert f'Hoja No. {index} de {len(pdf.pages)}' in text
            assert text.count('FIN DE NOTA') == int(index == len(pdf.pages))
            assert 'CAP El Chal' in text and 'DDRISS Petén Área Sur Oriente' in text
            historical = case['data'].get('capturistaHistorico')
            assert (('Capturista:' in text) == bool(historical))
            if historical:
                assert norm(historical['nombre_completo']) in norm(left_text)
            note = case['data']['nota']
            dates = ''.join(c['text'] for c in page.chars if c['x1'] < 97 and 60 < c['top'] < 130)
            date = '/'.join(note.get('fecha_atencion', '2026-10-20').split('-')[::-1])
            hour = note.get('hora_atencion', '09:30')[:5]
            assert dates.count(date) == dates.count(hour) == 1
            control = case['data'].get('control')
            reference = 'Sin control asociado' if not note['control_prenatal_id'] else 'Referencia no disponible'
            if control:
                reference = f"N.º {control['numero']} · {'/'.join(control['fecha'].split('-')[::-1])}"
            assert norm(reference) in norm(left_text)
            for name, column in [(case['data'].get('paciente', {}).get('nombres'), left_text),
                                 (case['data'].get('paciente', {}).get('apellidos'), left_text),
                                 (note.get('responsable_snapshot', {}).get('nombre_completo'), right_text),
                                 (note.get('responsable_snapshot', {}).get('cargo_nombre'), right_text)]:
                if name:
                    assert norm(name) in norm(column), ('Nombre perdido o recortado', case['file'], index)
            assert len(page.images) == 2
            for img, ratio in zip(sorted(page.images, key=lambda x: x['x0']), [421 / 151, 158 / 151]):
                assert abs(img['width'] / img['height'] - ratio) < .02
            for char in page.chars:
                assert 29 <= char['x0'] < char['x1'] <= 583, (case['file'], index, 'margen', char)
                assert 0 <= char['top'] < char['bottom'] <= 780
            body = [c for c in page.chars if abs(c['size'] - 10.5) < .01 and c['x0'] >= 101]
            assert body
            narrative.append(''.join(c['text'] for c in body))
            rules = {round(e['top'], 2) for e in page.horizontal_edges if e['x0'] <= 102 and e['x1'] >= 581}
            assert all(not any(c['top'] + .2 < y < c['bottom'] - .2 for y in rules) for c in body)
            label = page.search('Nombre y firma del responsable')[0]
            sign_y = max(e['top'] for e in page.horizontal_edges if 700 < e['top'] < label['top'] and e['x1'] - e['x0'] > 100)
            start = page.search('Paciente:')[-1]['top']
            metadata = [c for c in page.chars if start - 1 <= c['top'] and c['bottom'] < sign_y]
            assert metadata and all(abs(c['size'] - 9) < .01 for c in metadata), 'Identificación debe ser 9 pt'
            assert all(c['x1'] <= 334.6 or c['x0'] >= 343.6 for c in metadata), 'Columnas superpuestas'
            gap = sign_y - max(c['bottom'] for c in metadata)
            assert gap >= 30, ('Espacio de firma', gap)
            clearances.append(round(gap, 2))
            assert max(c['bottom'] for c in body) < start - 3, 'Narrativa invade identificación'
            if index == len(pdf.pages):
                marker = page.search('FIN DE NOTA')[0]
                assert marker['top'] > max(c['bottom'] for c in body)
                assert marker['bottom'] + 3 < start
            render = case['file'].startswith('pdf/') and index in {1, len(pdf.pages), (len(pdf.pages) + 1) // 2}
            render |= case['file'].endswith(('nombres-limite-historico.pdf', 'lineas-33.pdf', 'lineas-66.pdf')) and index == len(pdf.pages)
            render |= case['file'].endswith('nota_evolucion-limite-sintetica.pdf') and index in {1, len(pdf.pages)}
            if render:
                prefix = RENDER / f'{target.stem}-pagina-{index}'
                subprocess.run([renderer, '-f', str(index), '-l', str(index), '-singlefile', '-r', '120', '-png', str(target), str(prefix)], check=True, capture_output=True)
                renders.append(str(prefix.with_suffix('.png').relative_to(OUT)))
                if case['file'].startswith('pdf/'):
                    with Image.open(prefix.with_suffix('.png')) as im:
                        thumb = ImageOps.contain(im.convert('RGB'), (408, 528))
                        card = Image.new('RGB', (428, 565), 'white')
                        card.paste(thumb, ((428 - thumb.width) // 2, 8))
                        ImageDraw.Draw(card).text((8, 545), f'{target.stem} / {index}', fill='black')
                        cards.append(card)
        assert norm(''.join(narrative)) == norm(note['contenido']), ('Narrativa alterada', case['file'])
        report['documents'].append({'file': case['file'], 'pages': len(pdf.pages), 'narrative_exact': True,
            'identification_font_points': 9, 'full_names_verified': True, 'capturer_only_if_historical': True,
            'administrative_legend_absent': True, 'original_date_time_each_page': True,
            'end_marker_last_page_only': True, 'signature_clearance_points_min': min(clearances), 'rendered': renders})
for name in ['gobierno-guatemala-mspas.png', 'ddriss-peten-area-sur-oriente.png']:
    report['assets'].append({'file': name, 'sha256': hashlib.sha256((ROOT / 'backend/src/assets/institucional' / name).read_bytes()).hexdigest()})
sheet = Image.new('RGB', (1284, 565 * ((len(cards) + 2) // 3)), '#ddd')
for index, card in enumerate(cards):
    sheet.paste(card, ((index % 3) * 428, (index // 3) * 565))
sheet.save(OUT / 'contact-sheet.png')
(OUT / 'pdf-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'documents': len(report['documents']), 'pages': sum(d['pages'] for d in report['documents']),
                  'rendered': sum(len(d['rendered']) for d in report['documents'])}))
