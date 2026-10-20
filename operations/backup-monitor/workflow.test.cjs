'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const w=JSON.parse(fs.readFileSync(path.join(root,'n8n/workflows/monitoreo-respaldos-externos-v1.json')));
const render=w.nodes.find(n=>n.id==='render').parameters.jsCode;
const item=kind=>({recipient:'alerts@example.invalid',alert:{event_id:'a'.repeat(64),incident_id:'b'.repeat(32),kind,event_type:kind==='RECUPERADO'?'OK':'DESTINATION_UNAVAILABLE',reason_code:kind==='RECUPERADO'?'NONE':'AUTH_FAILED',destination_type:'gdrive',created_at:'2026-10-20T08:05:00+00:00',incident_opened_at:'2026-10-20T08:00:00+00:00',last_verified_at:'2026-10-19T08:01:00+00:00'},claim_id:'c'.repeat(32),idempotency_key:'cap-backup-'+'a'.repeat(64)});
function execute(value){return vm.runInNewContext('(function(){'+render+'\n})()',{$input:{first:()=>({json:value})},Intl,Date});}

test('workflow is independent, inactive, unpublished and credential-free',()=>{
 assert.equal(w.name,'CAP Prenatal — Monitoreo de respaldos externos');
 assert.equal(w.active,false);assert.equal(w.activeVersionId,null);assert.equal(w.id,undefined);
 assert.equal(w.nodes.length,7);assert.equal(w.settings.timezone,'America/Guatemala');
 assert.equal(w.settings.executionTimeout,60);
 for(const node of w.nodes){assert.equal(node.credentials,undefined);assert.notEqual(node.retryOnFail,true);}
});
test('only allowed network destinations and fixed unique recipient',()=>{
 const send=w.nodes.filter(n=>n.type==='n8n-nodes-resend.resend');assert.equal(send.length,1);
 assert.equal(send[0].parameters.to,'={{ $json.recipient }}');assert.equal(send[0].parameters.authentication,'apiKey');
 assert.deepEqual(Object.keys(send[0].parameters.additionalOptions),['idempotencyKey']);
 assert.equal(send[0].onError,'continueErrorOutput');
 for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest')){
  assert.match(n.parameters.url,/^http:\/\/127\.0\.0\.1:8766\/v1\/(claim|ack|uncertain)$/);
  assert.equal(n.parameters.genericAuthType,'httpHeaderAuth');
  assert.equal(n.parameters.options.timeout,10000);
 }
 assert.equal(w.settings.callerPolicy,'none');
});
test('provider success ACK and error uncertainty have separate branches',()=>{
 assert.equal(w.connections['Enviar alerta por Resend'].main[0][0].node,'¿Resend aceptó el envío?');
 assert.equal(w.connections['Enviar alerta por Resend'].main[1][0].node,'Registrar resultado incierto');
 assert.equal(w.connections['¿Resend aceptó el envío?'].main[0][0].node,'Confirmar aceptación');
 assert.equal(w.connections['¿Resend aceptó el envío?'].main[1][0].node,'Registrar resultado incierto');
 assert.match(w.nodes.find(n=>n.id==='ack').parameters.jsonBody,/provider_id:\$json.id/);
});
test('normal-output provider errors can never reach acceptance ACK',()=>{
 const expression=w.nodes.find(n=>n.id==='accepted').parameters.conditions.conditions[0].leftValue.slice(3,-2);
 for(const value of [{error:'synthetic'}, {}, {id:null}, {id:''}, {id:12}, {id:'<script>'}])assert.equal(vm.runInNewContext(expression,{$json:value}),false);
 assert.equal(vm.runInNewContext(expression,{$json:{id:'synthetic-accepted'}}),true);
});
test('empty queue stops before Resend',()=>{assert.equal(execute({alert:null}).length,0);});
test('both institutional messages are safe, deterministic and in Spanish',()=>{
 for(const kind of ['ALERTA','RECUPERADO']){
  const first=execute(item(kind))[0].json,second=execute(item(kind))[0].json;
  assert.equal(first.subject,`[CAP Prenatal][RESPALDOS][${kind}] Google Drive`);
  assert.equal(first.html,second.html);assert.match(first.html,/#5D727C/);
  assert.match(first.html,/CENTRO DE ATENCIÓN PERMANENTE/);assert.match(first.html,/El Chal, Petén/);
  assert.match(first.html,/Confidencialidad|confidencialidad/);assert.match(first.html,/20 de octubre de 2026/);
  assert.match(first.html,/@media only screen/);assert.doesNotMatch(first.html,/Maqueta|ficticios|XLSX|<script|<a\b|\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u);
  assert.ok(Buffer.byteLength(first.html,'utf8')<15000);
 }
});
test('forged technical fields, extra data and missing timezones are rejected',()=>{
 for(const mutate of [x=>x.alert.token='synthetic-secret',x=>x.alert.reason_code='<script>private</script>',x=>x.alert.created_at='2026-10-20',x=>x.alert.destination_type='external_hdd',x=>x.idempotency_key='different']){
  const input=item('ALERTA');mutate(input);assert.throws(()=>execute(input));
 }
});
test('synthetic transport preserves payload and idempotency across uncertain retry',()=>{
 const seen=new Map();let accepted=0;
 const fakeProvider=mail=>{const key=mail.idempotency_key;const bytes=JSON.stringify({subject:mail.subject,html:mail.html});
  if(seen.has(key)){assert.equal(seen.get(key).bytes,bytes);return seen.get(key).id;}
  const id='synthetic-'+(++accepted);seen.set(key,{bytes,id});return id;};
 assert.equal(fakeProvider(execute(item('ALERTA'))[0].json),fakeProvider(execute(item('ALERTA'))[0].json));
 assert.equal(accepted,1);
});
test('six clinical JSONs preserve the CPREN-91 baseline except sender policy',()=>{
 const paths=['recordatorio-citas-resend-v1.json','seguimiento-inasistencias-resend-v1.json','seguimiento-tdap-el-chal-resend-v1.json','censo-primer-control-26-25-resend-v1.json','censo-primer-control-mes-cerrado-resend-v1.json','watchdog-calidad-datos-resend-v1.json'].map(p=>'n8n/workflows/'+p).concat('n8n/design-v2/components.cjs');
 const normalize=(p,b)=>{
  if(!p.endsWith('.json'))return b.toString();
  const w=JSON.parse(b);for(const n of w.nodes)if(n.type==='n8n-nodes-resend.resend')delete n.parameters.from;
  return JSON.stringify(w);
 };
 for(const p of paths)assert.equal(normalize(p,fs.readFileSync(path.join(root,p))),normalize(p,cp.execFileSync('git',['show','7722601d20bbd09584f8c4577b5e9cbe79c3398e:'+p],{cwd:root})),p);
});
test('new material has no emojis or executable transport helper',()=>{
 for(const name of ['monitor.py','build-workflow.cjs','schema.sql']){
  const text=fs.readFileSync(path.join(__dirname,name),'utf8');assert.doesNotMatch(text,/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u);
 }
 const observer=fs.readFileSync(path.join(__dirname,'monitor.py'),'utf8');
 assert.doesNotMatch(observer,/import requests|import psycopg|import smtplib|shell=True|subprocess.*rclone/);
});

test('private recipient response is mandatory, unique and cannot come from event data',()=>{
 for(const recipient of [undefined,null,[],['alerts@example.invalid'],'','a@example.invalid,b@example.invalid','Name <alerts@example.invalid>','a@example.invalid\r\nBcc:x@example.invalid','a..b@example.invalid','a@example.invalid\n']){
  const input=item('ALERTA');input.recipient=recipient;assert.throws(()=>execute(input));
 }
 const missing=item('ALERTA');delete missing.recipient;missing.alert.recipient='alerts@example.invalid';assert.throws(()=>execute(missing));
 const overridden=item('ALERTA');overridden.alert.recipient='other@example.invalid';assert.throws(()=>execute(overridden));
 const extra=item('ALERTA');extra.to='other@example.invalid';assert.throws(()=>execute(extra));
 assert.equal(execute(item('ALERTA'))[0].json.recipient,'alerts@example.invalid');
});
