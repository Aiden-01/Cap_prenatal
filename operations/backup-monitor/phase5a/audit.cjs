'use strict';
// Read-only checks except explicit --write-manifest; never opens a runtime profile.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),base='8c36954172c3bbe998fdefb4ccd2435d2087e1ea';
const canonical='n8n/workflows/monitoreo-respaldos-externos-v1.json';
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const historical=JSON.parse(read('operations/backup-monitor/phase3/evidence/git-review.json'));
const extra=['operations/backup-monitor/test_recipient.py','operations/backup-monitor/phase5a/README.md','operations/backup-monitor/phase5a/audit.cjs','operations/backup-monitor/phase5a/results.json'];
const files=[...historical.candidateFiles,...extra].sort();
assert.equal(new Set(files).size,files.length);
for(const p of files){
 assert(p===canonical||p.startsWith('operations/backup-monitor/'));
 assert(!/(^|\/)runtime\/|\.sqlite(?:-|$)|\.env$|\.key$|\.pem$|\.dump$/i.test(p));
 const text=read(p).toString('utf8');
 assert(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bre_[A-Za-z0-9]{20,}\b|postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/.test(text),'Credential-like material: '+p);
 assert(!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text),'Emoji: '+p);
 const emails=text.match(/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[];
 assert(emails.every(e=>e.endsWith('.invalid')||e==='citas@notificaciones.hercor-nexus.com'),'Unexpected public address: '+p);
}
for(const p of JSON.parse(read('operations/backup-monitor/phase3/evidence/protected-files.json')).clinicalAndComponents){
 assert.equal(sha(read(p.file)),p.sha256);
 assert.equal(sha(read(p.file)),sha(cp.execFileSync('git',['show','origin/main:'+p.file],{cwd:root})));
}
const w=JSON.parse(read(canonical)),old=JSON.parse(read('operations/backup-monitor/phase3/evidence/workflow-before-response-guard.json'));
assert.equal(w.active,false);assert.equal(w.activeVersionId,null);assert.equal(w.id,undefined);
assert.equal(w.nodes.length,7);
for(const n of w.nodes){assert.equal(n.credentials,undefined);assert.notEqual(n.retryOnFail,true);}
for(const n of old.nodes){
 const after=w.nodes.find(v=>v.id===n.id);assert(after);
 if(n.id==='send'){
  const copy=structuredClone(after);copy.parameters.to='alerts@example.invalid';assert.deepEqual(copy,n);
 }else if(n.id==='render'){
  const copy=structuredClone(after);copy.parameters=structuredClone(n.parameters);assert.deepEqual(copy,n);
 }else assert.deepEqual(after,n);
}
const connections=structuredClone(w.connections),prior=structuredClone(old.connections);
delete connections['Enviar alerta por Resend'];delete connections['¿Resend aceptó el envío?'];delete prior['Enviar alerta por Resend'];
assert.deepEqual(connections,prior);
assert.deepEqual({...w,nodes:[],connections:{}},{...old,nodes:[],connections:{}});
const render=(workflow,item)=>vm.runInNewContext('(function(){'+workflow.nodes.find(n=>n.id==='render').parameters.jsCode+'\n})()',{$input:{first:()=>({json:item})},Intl,Date})[0].json;
const html=[];
for(const kind of ['ALERTA','RECUPERADO']){
 const item={recipient:'alerts@example.invalid',alert:{event_id:'a'.repeat(64),incident_id:'b'.repeat(32),kind,event_type:kind==='RECUPERADO'?'OK':'DESTINATION_UNAVAILABLE',reason_code:kind==='RECUPERADO'?'NONE':'AUTH_FAILED',destination_type:'gdrive',created_at:'2026-10-20T08:05:00+00:00',incident_opened_at:'2026-10-20T08:00:00+00:00',last_verified_at:'2026-10-19T08:01:00+00:00'},claim_id:'c'.repeat(32),idempotency_key:'cap-backup-'+'a'.repeat(64)};
 const a=render(w,item),b=render(old,item);assert.equal(a.recipient,item.recipient);delete a.recipient;assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
 html.push({kind,sha256:sha(Buffer.from(a.html)),unchanged:true});
}
cp.execFileSync('node',['operations/backup-monitor/build-workflow.cjs','--check'],{cwd:root});
const manifest=files.map(p=>({path:p,bytes:read(p).length,sha256:sha(read(p))}));
const manifestPath=path.join(__dirname,'manifest.json');
if(process.argv.includes('--write-manifest'))fs.writeFileSync(manifestPath,JSON.stringify({base,redaction:'Historical pre-guard workflow recipient replaced with reserved test address; exact originals preserved privately. Phase 2/3 hashes remain historical.',files:manifest},null,2)+'\n');
else assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath)).files,manifest);
console.log(JSON.stringify({files:files.length+1,protected:7,html,active:false,credentialsBound:false,manifest:'PASS'}));
