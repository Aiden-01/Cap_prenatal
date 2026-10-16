'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const root=path.resolve(__dirname,'../../../..'),G=require('../generate.cjs'),{executeItems}=require('../validate.cjs'),C=require('../../components.cjs'),views=require('../views.cjs'),Excel=require(path.join(root,'backend/node_modules/exceljs')),Zip=require(path.join(root,'backend/node_modules/jszip'));
const relative='n8n/workflows/recordatorio-citas-resend-v1.json',current=JSON.parse(fs.readFileSync(path.join(root,relative))),node='Construir detalle operativo';
const cases=[
 ['2026-10-15','2026-10-14T14:00:00Z','15 de octubre de 2026'],
 ['2026-02-01','2026-01-31T14:00:00Z','1 de febrero de 2026'],
 ['2026-03-01','2026-02-28T14:00:00Z','1 de marzo de 2026'],
 ['2028-02-29','2028-02-28T14:00:00Z','29 de febrero de 2028'],
 ['2028-03-01','2028-02-29T14:00:00Z','1 de marzo de 2028'],
 ['2027-01-01','2026-12-31T14:00:00Z','1 de enero de 2027'],
 ['2026-01-01','2026-01-01T05:59:00Z','1 de enero de 2026'],
 ['2026-11-01','2026-10-31T23:59:00-06:00','1 de noviembre de 2026'],
];
test('canonical reminder is generated, inactive, and uses only the approved binary binding',()=>{
 const item=G.prepare().find(x=>x.file==='recordatorio-citas-resend-v1.json');
 assert.equal(item.current,item.source);assert.equal(current.active,false);
 assert.deepEqual(item.before.connections,item.after.connections);assert.deepEqual(item.before.settings,item.after.settings);
 const send=current.nodes.find(n=>n.type==='n8n-nodes-resend.resend');
 assert.deepEqual(send.parameters.additionalOptions.attachments.attachments,[{attachmentType:'binaryData',binaryPropertyName:'data',filename:'={{ $binary.data.fileName }}'}]);
});

test('all twelve month names and direct calendar formatting without Date/UTC',()=>{
 const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
 for(let i=0;i<12;i++){
  const p={range:{from:'2026-'+String(i+1).padStart(2,'0')+'-15'},total:2};
  const output=views.reminder({...C,renderEmailLayout:x=>x},p,'Asunto de prueba','fecha');assert(output.content.includes('15 de '+months[i]+' de 2026'));assert(!/XLSX|\.xlsx|Detalle disponible/.test(output.content));
 }
 assert.doesNotMatch(views.reminder.toString(),/\bDate\b|\bIntl\b|UTC|generated_at/);
});
for(const[date,sent,label]of cases)test('message and XLSX agree for '+date+' (sent '+sent+')',async()=>{
 const p=require('../fixtures.cjs').daily();p.generated_at=sent;p.range={from:date,to:date};p.total=2;p.summary_by_date=[{date,total:2}];p.appointments=[{date,first_name:'María José',last_name:'Muñoz de Prueba',phone:'00000001',community:'Comunidad Peña Sintética'},{date,first_name:'Ana Lucía',last_name:'Pérez Sintética',phone:'00000002',community:'Sector Ñandú de Prueba'}];
 // Generation time is deliberately unrelated to the operational appointment date.
 const a=(await executeItems(current,node,{...p,generated_at:'2030-01-01T00:00:00Z'}))[0],b=(await executeItems(current,node,p))[0];
 assert.deepEqual({...a.json,html:undefined},{...b.json,html:undefined});
 const expected='Le compartimos el listado de las pacientes con cita programada para el '+label+'. En el documento adjunto encontrará sus nombres, teléfonos y comunidades, para facilitar la organización de la atención.';
 assert(b.json.html.includes(expected));assert(b.json.html.includes('Listado de pacientes'));assert(!/XLSX|\.xlsx|Citas_programadas_|Detalle disponible en Excel/.test(b.json.html));assert(!/María|Muñoz|00000001|Peña|Ñandú/.test(b.json.html));assert(!/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3\u200D]/u.test(b.json.html));assert(b.json.html.includes('#5D727C'));
 assert.deepEqual(Object.keys(b.json).sort(),['html','subject','total']);assert.equal(b.json.total,2);
 assert.deepEqual({...a.binary.data,data:undefined},{...b.binary.data,data:undefined});
 const bytes=Buffer.from(b.binary.data.data,'base64'),book=new Excel.Workbook();await book.xlsx.load(bytes);assert.equal(book.worksheets.length,1);const sheet=book.worksheets[0];assert.equal(sheet.name,'Citas programadas');assert.equal(sheet.rowCount,3);assert.equal(sheet.columnCount,4);
 assert.deepEqual(sheet.getRow(1).values.slice(1),['Fecha de cita','Nombre completo','Teléfono','Comunidad']);p.appointments.forEach((row,j)=>[row.date,row.first_name+' '+row.last_name,row.phone,row.community].forEach((value,k)=>{const c=sheet.getRow(j+2).getCell(k+1);assert.equal(c.value,value);assert.equal(c.type,Excel.ValueType.String);assert(!c.formula);}));
 const za=await Zip.loadAsync(Buffer.from(a.binary.data.data,'base64')),zb=await Zip.loadAsync(bytes);assert.deepEqual(Object.keys(za.files).sort(),Object.keys(zb.files).sort());
 for(const name of Object.keys(za.files).filter(n=>!za.files[n].dir)){
  let left=await za.files[name].async('string'),right=await zb.files[name].async('string');
  if(name==='docProps/core.xml'){const time=/<dcterms:(created|modified)\b[^>]*>[^<]*<\/dcterms:\1>/g;left=left.replace(time,'__GENERATION_TIMESTAMP__');right=right.replace(time,'__GENERATION_TIMESTAMP__');}
  assert.equal(left,right,'Workbook content changed: '+name);
 }
});
