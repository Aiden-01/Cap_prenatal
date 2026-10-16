'use strict';
require('../phase4/guard.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),Excel=require('../../../../backend/node_modules/exceljs'),G=require('../generate.cjs'),F=require('../fixtures.cjs'),{executeItems}=require('../validate.cjs');
const dir=__dirname,root=path.resolve(dir,'../../../..'),headers=['Fecha de cita','Nombre completo','Teléfono','Comunidad'];
const noEmoji=s=>!/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3\u200D]/u.test(s);
async function validate(save=false){
 let checks=0;const cases=[],assets=[];let out;
 if(save){
  assert.ok(process.env.CAP_PRENATAL_EVIDENCE_DIR,'Set an external CAP_PRENATAL_EVIDENCE_DIR before saving evidence');
  out=path.resolve(process.env.CAP_PRENATAL_EVIDENCE_DIR);const relative=path.relative(root,out);
  assert.ok(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Evidence must be outside the repository');
  fs.mkdirSync(out,{recursive:true});
 }
 const test=fn=>{fn();checks++;};
 // Immutable versioned pre-V2 baselines are the reference, not private backups.
 const prepared=G.prepare(),baselines=new Map(prepared.map(x=>[x.file,x.before]));
 const current=f=>JSON.parse(fs.readFileSync(path.join(root,'n8n/workflows',f))),old=f=>baselines.get(f),nohtml=x=>JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k])=>k!=='html'))));
 const formal=(i,category)=>({date:category==='previous_pending'?'2026-10-01':'2026-10-07',first_name:'María de Prueba '+String(i).padStart(5,'0'),last_name:'Muñoz Sintética',phone:'0000-0000',community:'Comunidad Peña & Anexo',...(category?{category}:{})});
 async function pair(file,node,p,label,groups){
  const a=(await executeItems(old(file),node,p))[0],b=(await executeItems(current(file),node,p))[0];test(()=>assert.deepEqual(nohtml(b.json),nohtml(a.json)));test(()=>assert.deepEqual(Object.keys(b.json),Object.keys(a.json)));
  const html=b.json.html;test(()=>assert.ok(noEmoji(html)));test(()=>assert.doesNotMatch(html,/<tbody>|<script|<iframe|<img|\shref\s*=|\son\w+\s*=/i));test(()=>assert.ok(!html.includes('María de Prueba')&&!html.includes('Muñoz')&&!html.includes('0000-0000')&&!html.includes('Comunidad Peña')));test(()=>assert.match(html,/#5D727C/));test(()=>assert.match(html,label.startsWith('reminder-')?/Listado de pacientes/:/ARCHIVO ADJUNTO/));test(()=>assert.ok(!html.includes('/reportes/seguimiento-inasistencias')));
  let bytes,sheets;
  if(groups){
   test(()=>assert.ok(b.binary?.data?.data));bytes=Buffer.from(b.binary.data.data,'base64');const checked=new Excel.Workbook();await checked.xlsx.load(bytes);sheets=checked.worksheets.map(s=>s.name);test(()=>assert.deepEqual(sheets,groups.map(g=>g[0])));
   for(const [i,[name,rows]]of groups.entries()){const s=checked.worksheets[i];test(()=>assert.equal(s.rowCount,rows.length+1));test(()=>assert.deepEqual(s.getRow(1).values.slice(1),headers));for(const [j,r]of rows.entries())for(const [k,value]of [r.date,(r.first_name||'No registrado')+' '+(r.last_name||'No registrado'),r.phone||'No registrado',r.community||'No registrado'].entries()){test(()=>assert.equal(s.getRow(j+2).getCell(k+1).value,value));test(()=>assert.equal(s.getRow(j+2).getCell(k+1).type,Excel.ValueType.String));}}
   test(()=>assert.equal(groups.reduce((n,g)=>n+g[1].length,0),p.total));
  }else{
   test(()=>assert.equal(b.json.attachment_base64,a.json.attachment_base64));bytes=Buffer.from(b.json.attachment_base64,'base64');const checked=new Excel.Workbook();await checked.xlsx.load(bytes);sheets=checked.worksheets.map(s=>s.name);test(()=>assert.deepEqual(sheets,['Nuevas oportunidades Tdap','Pendientes de Tdap']));for(const [i,rows]of [p.new_rows,p.pending_rows].entries()){const s=checked.worksheets[i];test(()=>assert.equal(s.rowCount,rows.length+1));test(()=>assert.deepEqual(s.getRow(1).values.slice(1),['Primer nombre','Primer apellido','Comunidad']));for(const [j,r]of rows.entries())test(()=>assert.deepEqual(s.getRow(j+2).values.slice(1),Object.values(r)));}test(()=>assert.equal(b.json.attachment_size,bytes.length));
  }
  const base64Bytes=4*Math.ceil(bytes.length/3),htmlBytes=Buffer.byteLength(html);test(()=>assert.ok(base64Bytes+htmlBytes<40000000));cases.push({file,label,htmlBytes,xlsxBytes:bytes.length,base64Bytes,sheets,rows:groups?groups.map(g=>g[1].length):[p.new_total,p.pending_total],nonvisualJsonIdentical:true,xlsxSha256:G.hash(bytes),htmlSha256:G.hash(html),belowResendDocumentedLimit:true});
  if(save){fs.writeFileSync(path.join(out,label+'.html'),html,{flag:'wx'});fs.writeFileSync(path.join(out,label+'.xlsx'),bytes,{flag:'wx'});assets.push(label+'.html');}return b;
 }
 for(const kind of ['reminder','missed']){
  const file=kind==='reminder'?'recordatorio-citas-resend-v1.json':'seguimiento-inasistencias-resend-v1.json',node=kind==='reminder'?'Construir detalle operativo':'Construir mensaje operativo';
  for(const n of [2,10000]){let p,groups;if(kind==='reminder'){p=F.daily();p.total=n;p.appointments=Array.from({length:n},(_,i)=>({...formal(i),date:'2026-10-15'}));p.summary_by_date[0].total=n;groups=[['Citas programadas',p.appointments]];}else{p=F.missed(n/2,n/2);p.appointments=Array.from({length:n},(_,i)=>formal(i,i<n/2?'new':'previous_pending'));groups=[['Nuevas inasistencias',p.appointments.slice(0,n/2)],['Pendientes anteriores',p.appointments.slice(n/2)]];}await pair(file,node,p,kind+'-'+(n===2?'normal':'large'),groups);}
  const p=kind==='reminder'?F.daily():F.missed(1,0);p.appointments=[{...formal(0,kind==='reminder'?undefined:'new'),date:kind==='reminder'?'2026-10-15':'2026-10-07',first_name:'=HYPERLINK("https://example.invalid")',last_name:'Muñoz',phone:'+0000',community:'@SUM(1+1)'}];p.total=1;if(kind==='reminder')p.summary_by_date[0].total=1;
  await pair(file,node,p,kind+'-formula-text',kind==='reminder'?[['Citas programadas',p.appointments]]:[['Nuevas inasistencias',p.appointments],['Pendientes anteriores',[]]]);
  const corrupt={...p,total:99},outcome=async w=>{try{await executeItems(w,node,corrupt);return'accepted';}catch(e){return e.message;}};const a=await outcome(old(file)),b=await outcome(current(file));test(()=>assert.equal(a,b));
  await assert.rejects(()=>executeItems(current(file),node,p,{},()=>{throw Error('TEST_EXCEL_UNAVAILABLE');}),/TEST_EXCEL_UNAVAILABLE/);checks++;cases.push({file,label:'attachment-failure',noOutput:true});
 }
 const tdap='seguimiento-tdap-el-chal-resend-v1.json';for(const n of [1,1000]){const p=await F.tdapMail(n,n);for(const list of [p.new_rows,p.pending_rows])list.forEach((r,i)=>{r['Primer nombre']='María de Prueba '+i;r['Primer apellido']='Muñoz Sintética';r.Comunidad='Comunidad Peña';});const book=new Excel.Workbook();for(const [name,rows]of [['Nuevas oportunidades Tdap',p.new_rows],['Pendientes de Tdap',p.pending_rows]]){const s=book.addWorksheet(name);s.addRow(['Primer nombre','Primer apellido','Comunidad']);rows.forEach(r=>s.addRow(Object.values(r)));}p.attachment_base64=Buffer.from(await book.xlsx.writeBuffer()).toString('base64');await pair(tdap,'Construir correo con listas',p,'tdap-'+(n===1?'normal':'large'));}
 for(const status of ['no_results','already_processed'])for(const [file,node,p]of [['seguimiento-inasistencias-resend-v1.json','Validar contrato y reserva',F.missedContract(status)],[tdap,'Validar contrato y construir correo',F.tdapContract(status)]]){const a=(await executeItems(old(file),node,p))[0].json,b=(await executeItems(current(file),node,p))[0].json;test(()=>assert.deepEqual(nohtml(b),nohtml(a)));test(()=>assert.equal(b.should_send,false));cases.push({file,label:status,shouldSend:false,attachmentGenerated:false});}
 for(const item of prepared){test(()=>assert.deepEqual(item.before.connections,item.after.connections));test(()=>assert.deepEqual(item.before.settings,item.after.settings));test(()=>assert.equal(G.hash(item.baseline),require('../../previews/workflow-baseline.json')[item.file]));}
 for(const item of G.prepare()){test(()=>assert.equal(item.current,item.source));test(()=>assert.equal(item.after.active,false));}
 const report={counts:{checksPassed:checks,cases:cases.length,htmlAssets:assets.length},cases,assets,emailsSent:0,n8nExecuted:false,recipientPublicationBlocked:'Encargada address not confirmed; canonical placeholders preserved',runtimeBlocked:'ExcelJS must be provisioned/allowlisted in n8n before execution'};if(save)fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(require.main===module)validate().then(r=>console.log(JSON.stringify(r.counts))).catch(e=>{console.error(e);process.exitCode=1;});module.exports={validate};
