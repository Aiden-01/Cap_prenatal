'use strict';
// Closed Git candidate list; never traverses private runtime contents for publication.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../../..'),out=path.join(__dirname,'evidence');fs.mkdirSync(out,{recursive:true});
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
assert.equal(git('branch','--show-current'),'codex/cpren91-backup-alerts');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const protectedFiles=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/results.json'),'utf8')).protectedFiles;
for(const p of protectedFiles)assert.equal(hash(fs.readFileSync(path.join(root,p.file))),p.sha256,p.file);
const originalManifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/manifest.json'),'utf8'));
const canonical='n8n/workflows/monitoreo-respaldos-externos-v1.json';
const backup=JSON.parse(fs.readFileSync(path.join(out,'workflow-before-response-guard.json'),'utf8'));
assert.equal(hash(fs.readFileSync(path.join(out,'workflow-before-response-guard.json'))),originalManifest.find(p=>p.path===canonical).sha256);
const current=JSON.parse(fs.readFileSync(path.join(root,canonical),'utf8'));
for(const node of backup.nodes)assert.deepEqual(current.nodes.find(n=>n.id===node.id),node,'Existing node changed');
assert.equal(current.nodes.length,backup.nodes.length+1);
assert.equal(current.nodes.filter(n=>n.id==='accepted').length,1);
const prior={...backup,connections:{...backup.connections}},after={...current,nodes:current.nodes.filter(n=>n.id!=='accepted'),connections:{...current.connections}};
delete prior.connections['Enviar alerta por Resend'];delete after.connections['Enviar alerta por Resend'];delete after.connections['¿Resend aceptó el envío?'];
assert.deepEqual(after,prior,'Unexpected canonical change beyond response routing');
const run=process.argv[2];assert(/^run-[a-zA-Z0-9_-]+$/.test(run||''));
const result=JSON.parse(fs.readFileSync(path.join(__dirname,'runtime',run,'result.json'),'utf8'));
assert.equal(result.verdict,'PASS');assert.equal(result.realEmails,0);
fs.writeFileSync(path.join(out,'runtime-results.json'),JSON.stringify(result,null,2)+'\n');
const lab=path.join(__dirname,'runtime',run);
function read(file,fn){const db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA query_only=ON');try{return fn(db);}finally{db.close();}}
const databases=['monitor.sqlite','missing-scheduled-run/monitor.sqlite','incomplete-scheduled-run/monitor.sqlite'].map(file=>read(path.join(lab,file),db=>({file,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeyViolations:db.prepare('PRAGMA foreign_key_check').all().length,runs:db.prepare('SELECT count(*) n FROM runs').get().n,incidents:db.prepare('SELECT count(*) n FROM incidents').get().n,outbox:db.prepare('SELECT state,manual_review,count(*) n FROM outbox GROUP BY state,manual_review').all()})));
assert(databases.every(d=>d.integrity==='ok'&&d.foreignKeyViolations===0));
const n8n=read(path.join(lab,'profile/.n8n/database.sqlite'),db=>({workflows:db.prepare('SELECT id,active,activeVersionId FROM workflow_entity ORDER BY id').all(),syntheticCredentialCount:db.prepare('SELECT count(*) n FROM credentials_entity').get().n,executions:db.prepare('SELECT count(*) n FROM execution_entity').get().n,running:db.prepare("SELECT count(*) n FROM execution_entity WHERE deletedAt IS NULL AND status IN ('new','running','waiting')").get().n}));
assert.equal(n8n.running,0);assert(n8n.workflows.every(w=>!w.active&&w.activeVersionId===null));
const beforeExpiry=JSON.parse(fs.readFileSync(path.join(lab,'before-expiry.state.json'),'utf8')).outbox.find(r=>r.state==='claimed');
const retained=read(path.join(lab,'monitor.sqlite'),db=>db.prepare('SELECT * FROM outbox WHERE event_id=?').get(beforeExpiry.event_id));
assert.equal(beforeExpiry.payload,retained.payload);assert.equal(retained.state,'confirmed');
fs.writeFileSync(path.join(out,'persistence.json'),JSON.stringify({databases,n8n,acceptedAckLost:{sameEventId:true,sameImmutablePayload:true,confirmedAfterRetry:true,firstAttemptRetained:retained.first_attempt===beforeExpiry.first_attempt},providerUniqueAcceptances:result.simulatedUniqueMessages},null,2)+'\n');
fs.writeFileSync(path.join(out,'protected-files.json'),JSON.stringify({clinicalAndComponents:protectedFiles,canonicalMonitorSha256:hash(fs.readFileSync(path.join(root,canonical))),phase2MonitorSha256:originalManifest.find(p=>p.path===canonical).sha256,monitorHtmlCodeUnchanged:true,controlledChange:'One IF node added to route normal-output provider errors away from acceptance ACK'},null,2)+'\n');
const scope=['operations/backup-monitor',canonical];
const candidates=[...new Set([...git('ls-files','--others','--exclude-standard','--',...scope).split('\n'),...git('ls-files','--modified','--',...scope).split('\n')])].filter(Boolean).sort();
for(const file of candidates){
 assert(!/(^|\/)runtime\/|\.sqlite(?:-|$)|\.env$|credentials\.json$|\.key$|\.pem$/i.test(file),file);
 const text=fs.readFileSync(path.join(root,file),'utf8');
 assert(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bre_[A-Za-z0-9]{20,}\b|postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/.test(text),'Secret-like material: '+file);
 assert(!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text),'Emoji: '+file);
}
const excluded=['operations/backup-monitor/phase3/runtime/**','operations/backup-monitor/**/__pycache__/**','operations/backup-monitor/**/*.sqlite*','operations/backup-monitor/**/*.key'];
fs.writeFileSync(path.join(out,'git-review.json'),JSON.stringify({branch:git('branch','--show-current'),head:git('rev-parse','HEAD'),candidateFiles:candidates,excludedPatterns:excluded,existingPrivateCategoriesExcluded:['.n8n-local/','n8n/.env','backend/.env','node_modules/','backups/','tmp_*/'],productionCredentialsCopied:false,privateRuntimeExcluded:git('check-ignore','operations/backup-monitor/phase3/runtime/')!==''},null,2)+'\n');
// Include the review report itself in the exact candidate list on the second scan.
const final=[...new Set([...candidates,...git('ls-files','--others','--exclude-standard','--',...scope).split('\n')])].filter(Boolean).sort();
const review=JSON.parse(fs.readFileSync(path.join(out,'git-review.json'),'utf8'));review.candidateFiles=final;
fs.writeFileSync(path.join(out,'git-review.json'),JSON.stringify(review,null,2)+'\n');
console.log(JSON.stringify({nativeCases:result.cases.length,candidates:final.length,protectedSources:protectedFiles.length,realEmails:0,canonicalChangeControlled:true}));
