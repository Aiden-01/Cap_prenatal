'use strict';
// Build only. Never imports n8n, starts a server or sends a message.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const { policy } = require('../../scripts/n8n-email-policy');
const components = fs.readFileSync(path.join(root, 'n8n/design-v2/components.cjs'), 'utf8').split('module.exports =')[0];
const buildMail = String.raw`
const item = $input.first().json;
if (item.alert === null) return [];
const recipientPattern=/^[A-Za-z0-9](?:[A-Za-z0-9_+.-]{0,62}[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
if (Object.keys(item).sort().join() !== ['alert','claim_id','idempotency_key','recipient'].sort().join() ||
    typeof item.recipient !== 'string' || item.recipient.length>254 ||
    /\s/.test(item.recipient) || !recipientPattern.test(item.recipient) || item.recipient.split('@')[0].includes('..')) throw Error('ALERT_RECIPIENT_INVALID');
const a = item.alert;
const fields = ['event_id','incident_id','kind','event_type','reason_code','destination_type','created_at','incident_opened_at','last_verified_at'];
if (!a || Object.keys(a).sort().join() !== fields.sort().join() ||
    !/^[a-f0-9]{64}$/.test(a.event_id) || !/^[a-f0-9]{32}$/.test(a.incident_id) ||
    !/^[a-f0-9]{32}$/.test(item.claim_id) || item.idempotency_key !== 'cap-backup-'+a.event_id ||
    !['ALERTA','RECUPERADO'].includes(a.kind) || a.destination_type !== 'gdrive') throw Error('ALERT_CONTRACT_INVALID');
const causes = {NONE:'Copia externa verificada', COMMAND_FAILED:'Falló una etapa del respaldo', AUTH_FAILED:'No fue posible autenticar el acceso al destino', NETWORK:'No fue posible acceder al destino externo', HASH_MISMATCH:'La integridad de la copia no coincide', NO_START:'No se observó el inicio programado', TIMEOUT:'No se observó una finalización dentro del plazo', EVIDENCE_MISSING:'No existe evidencia suficiente para confirmar el resultado', CLEANUP_FAILED:'La copia se verificó, pero falló la limpieza local'};
const types = {OK:'Respaldo verificado',DUMP_FAILED:'Generación',TRANSFER_FAILED:'Transferencia',DESTINATION_UNAVAILABLE:'Acceso al destino',VERIFY_FAILED:'Verificación',MISSED_BACKUP:'Ejecución programada',UNKNOWN:'Observación no concluyente'};
if (!Object.hasOwn(causes,a.reason_code) || !Object.hasOwn(types,a.event_type) ||
    (a.kind==='RECUPERADO' && a.event_type!=='OK')) throw Error('ALERT_CONTRACT_INVALID');
function date(value) {
 if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) throw Error('ALERT_DATE_INVALID');
 return new Intl.DateTimeFormat('es-GT',{timeZone:'America/Guatemala',dateStyle:'long',timeStyle:'short'}).format(new Date(value))+' · Guatemala';
}
const subject='[CAP Prenatal][RESPALDOS]['+a.kind+'] Google Drive';
const recovery=a.kind==='RECUPERADO';
const seen=date(a.created_at), last=a.last_verified_at===null?'Sin evidencia disponible':date(a.last_verified_at);
date(a.incident_opened_at);
if (Date.parse(a.incident_opened_at)>Date.parse(a.created_at)) throw Error('ALERT_DATE_INVALID');
const duration=Math.ceil((Date.parse(a.created_at)-Date.parse(a.incident_opened_at))/60000);
const content=section(renderEmptyState(causes[a.reason_code]))+section('<p style="font-size:13px;line-height:1.7;color:#516576;">'+escapeHtml(recovery?'Se confirmó una nueva copia externa válida. El incidente quedó resuelto.':'Revise el estado del respaldo y la conectividad del destino. No se ha confirmado una nueva copia externa válida para resolver este incidente.')+'</p><p style="font-size:12px;line-height:1.7;color:#516576;">Última copia verificada: '+escapeHtml(last)+'</p><p style="font-size:11px;color:#5D727C;overflow-wrap:anywhere;">Incidente: '+escapeHtml(a.incident_id)+'</p>');
let html=renderEmailLayout({subject,badge:'SUPERVISIÓN DE RESPALDOS',preheader:recovery?'Se recuperó la verificación del respaldo externo.':'Se requiere revisar el respaldo externo.',heading:{category:'OPERACIÓN / RESPALDOS',title:recovery?'Respaldo externo recuperado':'Alerta de respaldo externo',intro:'Destino supervisado: Google Drive. Comunicación técnica sin datos clínicos.'},period:{label:'FECHA DEL EVENTO',text:seen},cards:[{value:recovery?0:1,label:recovery?'Incidente resuelto':'Incidente pendiente',detail:recovery?'Duración: '+duration+' minutos':types[a.event_type],tone:recovery?'green':'amber'}],content,aggregateOnly:true});
html=html.replace('Maqueta V2 · Datos completamente ficticios · Sin envíos reales','Supervisión técnica de respaldos · CAP Prenatal');
if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(html)) throw Error('EMOJI_FORBIDDEN');
return [{json:{event_id:a.event_id,claim_id:item.claim_id,idempotency_key:item.idempotency_key,recipient:item.recipient,subject,html}}];
`;
const node = (id, name, type, typeVersion, parameters, position, extra={}) => ({id,name,type,typeVersion,parameters,position,...extra});
const http = (id, name, endpoint, jsonBody, position) => node(id,name,'n8n-nodes-base.httpRequest',4.2,{
 method:'POST',url:'http://127.0.0.1:8766/v1/'+endpoint,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',
 sendBody:true,specifyBody:'json',jsonBody,options:{timeout:10000}},position);
const nodes=[
 node('schedule','Cada cinco minutos','n8n-nodes-base.scheduleTrigger',1.3,{rule:{interval:[{field:'minutes',minutesInterval:5}]}},[0,0]),
 http('claim','Reclamar alerta','claim','{}',[220,0]),
 node('render','Preparar alerta','n8n-nodes-base.code',2,{jsCode:components+'\n'+buildMail},[440,0]),
 node('send','Enviar alerta por Resend','n8n-nodes-resend.resend',1,{authentication:'apiKey',resource:'email',operation:'send',from:policy.identities[policy.workflows['monitoreo-respaldos-externos-v1.json']].from,to:'={{ $json.recipient }}',subject:'={{ $json.subject }}',html:'={{ $json.html }}',additionalOptions:{idempotencyKey:'={{ $json.idempotency_key }}'}},[660,0],{retryOnFail:false,onError:'continueErrorOutput'}),
 node('accepted','¿Resend aceptó el envío?','n8n-nodes-base.if',2.2,{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'provider-id-present',leftValue:"={{ typeof $json.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test($json.id) }}",rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},[880,0]),
 http('ack','Confirmar aceptación','ack',`={{ JSON.stringify({event_id:$('Preparar alerta').first().json.event_id,claim_id:$('Preparar alerta').first().json.claim_id,provider_id:$json.id}) }}`,[900,-100]),
 http('uncertain','Registrar resultado incierto','uncertain',`={{ JSON.stringify({event_id:$('Preparar alerta').first().json.event_id,claim_id:$('Preparar alerta').first().json.claim_id}) }}`,[900,100]),
];
// Credentials intentionally unbound: no production credential IDs or auth token in version control.
for(const n of nodes) n.notes=n.id==='send'?'Antes de importar en una fase autorizada: vincular Resend account 2. No adjuntos, CC, BCC ni reintentos del nodo.':'Interfaz privada: vincular credencial Header Auth Authorization Bearer solo durante despliegue autorizado.';
const edge = name => ({node:name,type:'main',index:0});
const connections={
 'Cada cinco minutos':{main:[[edge('Reclamar alerta')]]},
 'Reclamar alerta':{main:[[edge('Preparar alerta')]]},
 'Preparar alerta':{main:[[edge('Enviar alerta por Resend')]]},
 'Enviar alerta por Resend':{main:[[edge('¿Resend aceptó el envío?')],[edge('Registrar resultado incierto')]]},
 '¿Resend aceptó el envío?':{main:[[edge('Confirmar aceptación')],[edge('Registrar resultado incierto')]]},
};
const workflow={name:'CAP Prenatal — Monitoreo de respaldos externos',active:false,activeVersionId:null,nodes,connections,pinData:{},settings:{executionOrder:'v1',timezone:'America/Guatemala',executionTimeout:60,saveManualExecutions:false,saveDataSuccessExecution:'none',saveDataErrorExecution:'none',callerPolicy:'none'},tags:[]};
const output=path.join(root,'n8n/workflows/monitoreo-respaldos-externos-v1.json');
if(process.argv.includes('--check')) {
 if(fs.readFileSync(output,'utf8')!==JSON.stringify(workflow,null,2)+'\n') throw Error('Generated workflow drift');
 console.log('Workflow matches institutional source; no imports or sends.');
} else fs.writeFileSync(output,JSON.stringify(workflow,null,2)+'\n');
module.exports={buildMail};
