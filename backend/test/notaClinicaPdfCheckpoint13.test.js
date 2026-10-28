const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');
const { crearDocumentoNota, generarNotaClinicaPdf } = require('../src/services/notaClinicaPdf');
const { createPuppeteerBrowserManager } = require('../src/services/puppeteerBrowserManager');
const { base, fixtures } = require('./helpers/notasPdfCheckpoint13Fixtures');

test('CHECKPOINT-13B: fecha clínica y control conservados; capturista y leyenda omitidos', () => {
  const data = fixtures()[0].data;
  const before = structuredClone(data);
  const { html, footer } = crearDocumentoNota(data);
  assert.ok(html.includes('20/10/2026')); assert.ok(html.includes('09:30'));
  assert.ok(footer.includes('N.º 2 · 20/10/2026'));
  assert.ok(!footer.includes('Control:</b> 903'));
  assert.ok(!footer.includes('Capturista:'));
  assert.ok(!footer.includes('Nombre histórico no disponible'));
  assert.ok(!footer.includes('Captura finalizada'));
  assert.ok(!footer.includes('No equivale a firma clínica'));
  assert.ok(!footer.includes('Capturista:</b> 7'));
  assert.ok(!footer.includes('FIN DE NOTA'));
  assert.ok(!data.nota.contenido.includes('FIN DE NOTA'));
  assert.deepEqual(data, before);
  assert.ok(crearDocumentoNota(base('nota_enfermeria', 'Texto')).footer.includes('Sin control asociado'));
  const unavailable = structuredClone(data); unavailable.control = null;
  assert.ok(crearDocumentoNota(unavailable).footer.includes('Referencia no disponible'));
});

test('CHECKPOINT-13B: solo una proyección histórica verificada y del mismo ID muestra capturista', () => {
  const data=fixtures()[0].data;
  const historical={usuario_id:7,nombre_completo:'Camila Registro Sintético',fuente:'snapshot_captura',verificado:true};
  assert.ok(crearDocumentoNota({...data,capturistaHistorico:historical}).footer.includes('Capturista:</b> Camila Registro Sintético'));
  for(const invalid of [{...historical,verificado:false},{...historical,usuario_id:99},
    {...historical,fuente:'usuario_actual'},{...historical,nombre_completo:' '},null]){
    const copy=structuredClone(data);copy.nota.capturista_nombre='NOMBRE ACTUAL NO HISTÓRICO';
    assert.ok(!crearDocumentoNota({...copy,capturistaHistorico:invalid}).footer.includes('Capturista:'));
  }
  for(const estado of ['borrador','captura_finalizada']){
    const copy=structuredClone(data);copy.nota.estado=estado;
    assert.ok(!/Captura finalizada|No equivale a firma clínica|BORRADOR/.test(crearDocumentoNota(copy).footer));
    assert.equal(copy.nota.estado,estado);assert.equal(copy.nota.capturista_usuario_id,7);
  }
});

test('CHECKPOINT-13: cuatro muestras reales y cierres en límites de página', {
  skip: process.env.RUN_CHECKPOINT13_PDF !== '1', timeout: 120000,
}, async t => {
  const output = path.resolve(__dirname, process.env.CPREN_CHECKPOINT14 === '1' ? '../../docs/cpren120/checkpoint14' : process.env.CPREN_CHECKPOINT13B === '1' ? '../../docs/cpren120/checkpoint13b' : '../../docs/cpren120/checkpoint13');
  fs.mkdirSync(path.join(output, 'pdf'), { recursive: true });
  fs.mkdirSync(path.join(output, 'boundaries'), { recursive: true });
  const browserManager = createPuppeteerBrowserManager();
  const cases = [];
  try {
    const samples=fixtures();
    if(process.env.CPREN_CHECKPOINT14==='1')samples.push({name:'05-evolucion-limite-ultima-hoja',pages:2,
      data:base('nota_evolucion',Array.from({length:66},(_,i)=>`Línea sintética ${i+1}, última hoja completa.`).join('\n'))});
    for (const fixture of samples) {
      if(process.env.CPREN_CHECKPOINT13B==='1'&&fixture.name==='02-enfermeria-breve'){
        fixture.data.paciente.nombres='María de los Ángeles Alejandra Guadalupe';
        fixture.data.paciente.apellidos='Ejemplo Sintético de los Apellidos Compuestos';
        fixture.data.nota.responsable_snapshot.nombre_completo='Lucía María Fernanda de los Ángeles Pérez Ejemplo, profesional ficticia de nombre extenso';
        fixture.data.nota.responsable_snapshot.cargo_nombre='Enfermera Profesional responsable de atención prenatal, cargo de demostración';
      }
      const before = structuredClone(fixture.data);
      const bytes = await generarNotaClinicaPdf(fixture.data, { browserManager });
      const pdf = await PDFDocument.load(bytes);
      if (fixture.pages) assert.equal(pdf.getPageCount(), fixture.pages, fixture.name);
      for (const page of pdf.getPages()) assert.deepEqual([page.getWidth(), page.getHeight()], [612, 792]);
      assert.deepEqual(fixture.data, before);
      const file = `pdf/${fixture.name}.pdf`; fs.writeFileSync(path.join(output, file), bytes);
      cases.push({ file, pages: pdf.getPageCount(), data: fixture.data });
      t.diagnostic(`${fixture.name}: ${pdf.getPageCount()} páginas`);
    }
    if(process.env.CPREN_CHECKPOINT13B==='1'){
      const data=base('nota_enfermeria','Línea sintética para comprobar identificación extensa.\nSegunda línea, sin datos reales.');
      data.paciente.nombres=('Nombres Sintéticos '.repeat(6)).slice(0,100);
      data.paciente.apellidos=('Apellidos de Prueba '.repeat(6)).slice(0,100);
      data.nota.responsable_snapshot.nombre_completo=('Profesional Sintético Ángela Peña '.repeat(6)).slice(0,150);
      data.nota.responsable_snapshot.cargo_nombre=('Cargo sintético de responsabilidad profesional '.repeat(4)).slice(0,150);
      data.capturistaHistorico={usuario_id:7,nombre_completo:'Camila Registro Sintético de Identidad Histórica',fuente:'snapshot_captura',verificado:true};
      const before=structuredClone(data);const bytes=await generarNotaClinicaPdf(data,{browserManager});
      assert.deepEqual(data,before);const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);
      const file='boundaries/nombres-limite-historico.pdf';fs.writeFileSync(path.join(output,file),bytes);
      cases.push({file,pages:1,data});
    }
    if(process.env.CPREN_CHECKPOINT14==='1'){
      const data=base('nota_enfermeria','Caso sintético de Auxiliar de Enfermería, sin datos reales.');
      data.nota.responsable_snapshot.cargo_codigo='AE';data.nota.responsable_snapshot.cargo_nombre='Auxiliar de Enfermería';
      const before=structuredClone(data),bytes=await generarNotaClinicaPdf(data,{browserManager});
      assert.deepEqual(data,before);assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
      const file='boundaries/enfermeria-ae.pdf';fs.writeFileSync(path.join(output,file),bytes);cases.push({file,pages:1,data});
    }
    for (const count of [32, 33, 34, 65, 66, 67]) {
      const data = base('nota_evolucion', Array.from({ length: count }, (_, i) => `Línea sintética ${i + 1}, sin duplicaciones.`).join('\n'));
      const bytes = await generarNotaClinicaPdf(data, { browserManager });
      const pdf = await PDFDocument.load(bytes);
      assert.equal(pdf.getPageCount(), Math.ceil(count / 33), `Límite ${count}: el cierre no crea una hoja`);
      const file = `boundaries/lineas-${count}.pdf`; fs.writeFileSync(path.join(output, file), bytes);
      cases.push({ file, pages: pdf.getPageCount(), data });
    }
    fs.writeFileSync(path.join(output, 'synthetic-cases.json'), JSON.stringify({ synthetic_only: true, cases }, null, 2) + '\n');
  } finally { await browserManager.close(); }
});
