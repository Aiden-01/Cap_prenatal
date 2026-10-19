'use strict';
// Local review evidence only. No n8n connection or transport.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),evidence=path.join(__dirname,'evidence');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const w=JSON.parse(fs.readFileSync(path.join(root,'n8n/workflows/monitoreo-respaldos-externos-v1.json')));
const code=w.nodes.find(n=>n.id==='render').parameters.jsCode;
for(const [kind,name] of [['ALERTA','alert.html'],['RECUPERADO','recovery.html']]){
 const item={recipient:'alerts@example.invalid',alert:{event_id:'a'.repeat(64),incident_id:'b'.repeat(32),kind,event_type:kind==='RECUPERADO'?'OK':'DESTINATION_UNAVAILABLE',reason_code:kind==='RECUPERADO'?'NONE':'AUTH_FAILED',destination_type:'gdrive',created_at:'2026-10-20T08:05:00+00:00',incident_opened_at:'2026-10-20T08:00:00+00:00',last_verified_at:kind==='RECUPERADO'?'2026-10-20T08:04:00+00:00':'2026-10-19T08:01:00+00:00'},claim_id:'c'.repeat(32),idempotency_key:'cap-backup-'+'a'.repeat(64)};
 const html=vm.runInNewContext('(function(){'+code+'\n})()',{$input:{first:()=>({json:item})},Intl,Date})[0].json.html;
 fs.writeFileSync(path.join(evidence,name),html);
}
const clinical=['recordatorio-citas-resend-v1.json','seguimiento-inasistencias-resend-v1.json','seguimiento-tdap-el-chal-resend-v1.json','censo-primer-control-26-25-resend-v1.json','censo-primer-control-mes-cerrado-resend-v1.json','watchdog-calidad-datos-resend-v1.json'].map(n=>'n8n/workflows/'+n).concat('n8n/design-v2/components.cjs');
const unchanged=clinical.map(file=>{
 const hash=sha(fs.readFileSync(path.join(root,file)));
 if(hash!==sha(cp.execFileSync('git',['show','origin/main:'+file],{cwd:root})))throw Error('Protected source drift: '+file);
 return {file,sha256:hash,unchanged:true};
});
const python=fs.readFileSync(path.join(evidence,'python-tests.txt'),'utf8');
const node=fs.readFileSync(path.join(evidence,'workflow-tests.txt'),'utf8');
if(!/Ran 31 tests/.test(python)||!/\bOK\b/.test(python)||!/pass 9/.test(node)||!/fail 0/.test(node))throw Error('Final evidence missing');
fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({phase:'CPREN-91 local phase 2',pythonTests:31,workflowTests:9,failed:0,runtimeN8nTested:false,provider:'simulated only',emailsSent:0,ubuntuAccessed:false,servicesInstalled:false,workflowImported:false,branch:cp.execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),baseCommit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),protectedFiles:unchanged},null,2)+'\n');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['__pycache__','runtime'].includes(e.name)?[]:walk(path.join(dir,e.name))):[path.join(dir,e.name)]);
const paths=walk(__dirname).filter(p=>!p.endsWith('manifest.json')).concat(path.join(root,'n8n/workflows/monitoreo-respaldos-externos-v1.json'));
const files=paths.map(file=>({path:path.relative(root,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}));
fs.writeFileSync(path.join(evidence,'manifest.json'),JSON.stringify(files,null,2)+'\n');
console.log('Historical Phase 2 generator: 40 tests evidenced; seven protected sources unchanged; synthetic previews and manifest generated.');
