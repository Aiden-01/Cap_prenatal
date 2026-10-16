'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const G=require('./generate.cjs'),{validate,executeItems}=require('./validate.cjs');
test('summary and Excel preserve JSON contracts without writing evidence by default',async()=>{const r=await validate();assert.ok(r.counts.checksPassed>160000);assert.equal(r.counts.cases,14);assert.equal(r.counts.htmlAssets,0);assert.equal(r.emailsSent,0);assert.equal(r.n8nExecuted,false);});

test('evidence requires an explicit directory outside the repository',async()=>{
 const previous=process.env.CAP_PRENATAL_EVIDENCE_DIR;
 try{
  delete process.env.CAP_PRENATAL_EVIDENCE_DIR;
  await assert.rejects(()=>validate(true),/external CAP_PRENATAL_EVIDENCE_DIR/);
  process.env.CAP_PRENATAL_EVIDENCE_DIR=path.resolve(__dirname,'../../..');
  await assert.rejects(()=>validate(true),/outside the repository/);
 }finally{if(previous===undefined)delete process.env.CAP_PRENATAL_EVIDENCE_DIR;else process.env.CAP_PRENATAL_EVIDENCE_DIR=previous;}
});

test('VM rejects modules other than ExcelJS before returning an item',()=>{
 const synthetic={nodes:[{name:'Synthetic forbidden import',parameters:{jsCode:"return require('node:fs');"}}]};
 assert.throws(()=>executeItems(synthetic,'Synthetic forbidden import',{}),/TEST_MODULE_BLOCKED/);
});
test('generator matches all six JSON and limits approved binary bindings to reminder and missed',()=>{const items=G.prepare();assert.equal(items.length,6);assert.equal(items.reduce((n,x)=>n+x.paths.length,0),10);for(const x of items){assert.equal(x.current,x.source);assert.equal(x.after.active,false);const updated=/^(recordatorio|seguimiento-inasistencias)/.test(x.file);for(const name of Object.keys(G.ALLOWED[x.file])){const code=x.after.nodes.find(n=>n.name===name).parameters.jsCode;assert.ok(!code.includes('budgetBytes')&&!code.includes('/reportes/seguimiento-inasistencias'));if(updated)assert.match(code,/require\('exceljs'\)/);}assert.deepEqual(x.before.connections,x.after.connections);assert.deepEqual(x.before.settings,x.after.settings);}});
test('reference baseline drift remains fail-closed',()=>{const x=G.prepare()[0];assert.throws(()=>G.candidate(x.file,x.baseline+'\n'),/Baseline mismatch/);});
test('XML-like patient text stays literal in Excel and never enters executive HTML',async()=>{const E=require('../../../backend/node_modules/exceljs'),w=JSON.parse(fs.readFileSync(path.join(__dirname,'../../workflows/recordatorio-citas-resend-v1.json'))),p=require('./fixtures.cjs').daily();p.appointments[0].community='&lt;literal&gt; &amp; Ñ';const result=(await executeItems(w,'Construir detalle operativo',p))[0];assert.ok(!result.json.html.includes('literal'));const book=new E.Workbook();await book.xlsx.load(Buffer.from(result.binary.data.data,'base64'));assert.equal(book.worksheets[0].getRow(2).getCell(4).value,p.appointments[0].community);});
