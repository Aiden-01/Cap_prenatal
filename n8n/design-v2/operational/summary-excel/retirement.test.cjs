'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Excel=require('../../../../backend/node_modules/exceljs'),F=require('../fixtures.cjs'),{executeItems}=require('../validate.cjs');
const root=path.resolve(__dirname,'../../../..');
test('discarded screen and endpoint are absent; general safe authentication return remains',()=>{
 for(const p of ['backend/src/routes/seguimientoInasistencias.js','backend/test/seguimientoInasistencias.test.js','frontend/src/pages/SeguimientoInasistencias.jsx','frontend/src/pages/SeguimientoInasistencias.css','frontend/test-dom/seguimientoInasistencias.test.jsx'])assert.equal(fs.existsSync(path.join(root,p)),false,p);
 for(const p of ['backend/src/index.js','frontend/src/App.jsx','frontend/src/utils/accessRules.js','frontend/src/components/Sidebar.jsx','frontend/src/components/AccessRoute.jsx'])assert.doesNotMatch(fs.readFileSync(path.join(root,p),'utf8'),/seguimiento-inasistencias|SeguimientoInasistencias|missedFollowUp/);
 for(const p of ['frontend/src/pages/Login.jsx','frontend/src/components/Layout.jsx','frontend/src/components/AccessRoute.jsx','frontend/src/App.jsx'])assert.match(fs.readFileSync(path.join(root,p),'utf8'),/safeReturn/);
});
test('corrupt or incomplete serialized Excel prevents any dispatch item from being returned',async()=>{
 const w=JSON.parse(fs.readFileSync(path.join(root,'n8n/workflows/recordatorio-citas-resend-v1.json')));
 class Corrupt extends Excel.Workbook{constructor(){super();this.xlsx.writeBuffer=async()=>Buffer.from('not a zip');}}
 await assert.rejects(()=>executeItems(w,'Construir detalle operativo',F.daily(),{},()=>({Workbook:Corrupt})));
 let created=0;class Incomplete extends Excel.Workbook{constructor(){super();if(++created===1){const real=this.xlsx.writeBuffer.bind(this.xlsx);this.xlsx.writeBuffer=async()=>{const sheet=this.worksheets[0];sheet.spliceRows(sheet.rowCount,1);return real();};}}}
 await assert.rejects(()=>executeItems(w,'Construir detalle operativo',F.daily(),{},()=>({Workbook:Incomplete})),/ATTACHMENT_INVALID/);
 const p=F.daily();p.total=0;p.appointments=[];p.summary_by_date=[];assert.throws(()=>executeItems(w,'Construir detalle operativo',p),/CONTRACT_INVALID/);
});
