const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');
const { crearDocumentoNota, generarNotaClinicaPdf } = require('../src/services/notaClinicaPdf');
const { createPuppeteerBrowserManager } = require('../src/services/puppeteerBrowserManager');

const sample = tipo => ({ paciente: { nombres: 'Paciente sintética Ángela', apellidos: 'Peña', no_expediente: 'SYN-PDF-120' },
  nota: { id: 120, paciente_id: 1, tipo, version: 2, estado: 'captura_finalizada', capturista_usuario_id: 7,
    fecha_atencion: '2026-10-20', hora_atencion: '09:30:00', control_prenatal_id: tipo === 'nota_evolucion' ? 3 : null,
    responsable_snapshot: { tipo: 'externo', nombre_completo: 'Profesional sintético Muñoz', cargo_nombre: 'Cargo sintético',
      cargo_codigo: tipo === 'nota_evolucion' ? 'MED' : 'EP' },
    contenido: 'Atención, evolución y valoración: áéíóú, ñ, Ñ.\nSegunda línea.\n\nNuevo párrafo.' } });

test('PDF nota: logos originales embebidos y narrativa escapada, sin firmas simuladas', () => {
  for (const tipo of ['nota_evolucion', 'nota_enfermeria']) {
    const data = sample(tipo); data.nota.contenido += '<script>secret()</script><img src="https://invalid.test">';
    const { html, header, footer } = crearDocumentoNota(data);
    assert.ok(html.includes('&lt;script&gt;secret()&lt;/script&gt;'));
    assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src="https://'));
    assert.ok(html.includes('áéíóú, ñ, Ñ.\nSegunda línea.\n\nNuevo párrafo.'));
    for (const name of ['gobierno-guatemala-mspas.png', 'ddriss-peten-area-sur-oriente.png']) {
      assert.ok(header.includes(fs.readFileSync(path.join(__dirname, '../src/assets/institucional', name)).toString('base64')));
    }
    assert.ok(header.includes('CAP El Chal')); assert.ok(header.includes('Área Sur Oriente'));
    assert.ok(!footer.includes('No equivale a firma clínica'));
    assert.ok(!footer.includes('Captura finalizada'));
    assert.ok(footer.includes('Nombre y firma del responsable'));
    assert.ok(html.includes('FECHA / HORA'));
    assert.ok(!html.includes('Firmado por')); assert.ok(header.includes('height:auto'));
  }
  const draft = sample('nota_evolucion'); draft.nota.estado = 'borrador';
  assert.ok(!crearDocumentoNota(draft).footer.includes('Captura no finalizada'));
  assert.equal(draft.nota.estado,'borrador');
});

test('PDF nota real carta multipágina, texto extenso y logos', { skip: process.env.RUN_NOTA_PDF_BROWSER !== '1', timeout: 60000 }, async t => {
  const browserManager = createPuppeteerBrowserManager();
  const output = path.join(__dirname, process.env.CPREN_CHECKPOINT13B === '1' ? '../../docs/cpren120/checkpoint13b/regression' : process.env.CPREN_CHECKPOINT13 === '1' ? '../../docs/cpren120/checkpoint13/regression' : process.env.CPREN_CHECKPOINT12 === '1' ? '../../docs/cpren120/checkpoint12/pdf' : '../../output/pdf'); fs.mkdirSync(output, { recursive: true });
  try {
    for (const tipo of ['nota_evolucion', 'nota_enfermeria']) {
      const data = sample(tipo);
      data.nota.contenido = Array.from({ length: 100 }, (_, index) => `Párrafo ${index + 1}: Atención sintética con tildes áéíóú, ñ y saltos de línea. Evolución clínica documentada.\nContinuación del párrafo ${index + 1}.`).join('\n\n') + '\n' + 'TextoSinEspacios'.repeat(80) + '\nFIN-SINTETICO-120';
      const bytes = await generarNotaClinicaPdf(data, { browserManager });
      const pdf = await PDFDocument.load(bytes);
      assert.ok(pdf.getPageCount() >= 3);
      for (const page of pdf.getPages()) {
        assert.equal(page.getWidth(), 612); assert.equal(page.getHeight(), 792);
      }
      const target = path.join(output, `cpren120-${tipo}-sintetica.pdf`);
      fs.writeFileSync(target, bytes);
      t.diagnostic(`${tipo}: ${pdf.getPageCount()} páginas carta; muestra sintética: ${target}`);
      if (process.env.CPREN_CHECKPOINT12 === '1' || process.env.CPREN_CHECKPOINT13 === '1') {
        // Límite real del contrato, con acentos y una palabra de 20 000 caracteres.
        const extreme = sample(tipo); extreme.nota.contenido = 'ÁéíóúÑñ'.repeat(2858).slice(0, 20000);
        assert.equal(extreme.nota.contenido.length, 20000);
        const extremeBytes = await generarNotaClinicaPdf(extreme, { browserManager });
        const extremePdf = await PDFDocument.load(extremeBytes);
        assert.ok(extremePdf.getPageCount() >= 3);
        fs.writeFileSync(path.join(output, `cpren120-${tipo}-limite-sintetica.pdf`), extremeBytes);
        t.diagnostic(`${tipo}: límite de ${extreme.nota.contenido.length} caracteres, ${extremePdf.getPageCount()} páginas`);
      }
    }
  } finally { await browserManager.close(); }
});

module.exports = { sample };
