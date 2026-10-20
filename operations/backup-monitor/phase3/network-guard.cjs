'use strict';
// Process guard for trusted n8n fixtures, reinforced by Node filesystem permissions.
// This is not a Windows firewall or a sandbox for hostile native addons.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const lab=path.resolve(process.env.CPREN91_LAB||'');
assert(lab.includes(path.join('backup-monitor','phase3','runtime')));
assert.equal(path.resolve(process.cwd()),lab);
const net=require('node:net'),http=require('node:http'),https=require('node:https');
const allowed=new Set([18866,18867,18869]), events=[];
const persist=()=>fs.writeFileSync(path.join(lab,(process.env.CPREN91_STEP||'guard')+'.guard.json'),JSON.stringify({events,filesystemRestricted:true},null,2));
events.push=function(...items){const result=Array.prototype.push.apply(this,items);persist();return result;};
const deny=kind=>{events.push({kind,blocked:true});throw Error('CPREN91_NETWORK_DENIED:'+kind);};
const originalConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 let a=args[0];if(Array.isArray(a))a=a[0];
 const port=typeof a==='object'?a.port:a;
 const host=typeof a==='object'?a.host:typeof args[1]==='string'?args[1]:undefined;
 if(!['127.0.0.1','::1'].includes(host)||!allowed.has(Number(port)))return deny('socket');
 events.push({kind:'loopback',port:Number(port)});return originalConnect.apply(this,args);
};
const listen=net.Server.prototype.listen;
net.Server.prototype.listen=function(...args){
 const a=args[0],port=typeof a==='object'?a.port:a,host=typeof a==='object'?a.host:args[1];
 if(Number(port)!==18869||host!=='127.0.0.1')return deny('listener');
 return listen.apply(this,args);
};
for(const name of ['dns','dns/promises']){
 const m=require('node:'+name);
 for(const key of Object.keys(m))if(/^(lookup|resolve|reverse)/.test(key)){
  const original=m[key];
  m[key]=function(host,...args){
   if(key==='lookup'&&['127.0.0.1','::1'].includes(host))return original.call(this,host,...args);
   return deny('dns');
  };
 }
}
// The real Resend node runs, but its HTTPS request is intercepted before any socket/DNS.
https.request=function(input,options,callback){
 let o,cb;
 if(typeof input==='string'||input instanceof URL){o={...Object.fromEntries(['hostname','port','pathname'].map(k=>[k,new URL(input)[k]])),...(typeof options==='object'?options:{})};o.path=o.path||o.pathname;cb=typeof options==='function'?options:callback;}
 else{o={...input};cb=typeof options==='function'?options:callback;}
 if(o.hostname!=='api.resend.com'||o.path!=='/emails'||String(o.method).toUpperCase()!=='POST')return deny('https');
 if((o.headers?.Authorization||o.headers?.authorization)!=='Bearer synthetic-resend-never-valid')return deny('unexpected-auth');
 events.push({kind:'resend-redirected-to-mock'});
 return http.request({...o,protocol:'http:',hostname:'127.0.0.1',host:'127.0.0.1',port:18867,agent:undefined},cb);
};
https.get=()=>deny('https.get');
for(const name of ['tls','http2','dgram']){
 const m=require('node:'+name);for(const key of ['connect','createConnection','createSocket'])if(m[key])m[key]=()=>deny(name);
}
globalThis.fetch=()=>deny('fetch');
const child=require('node:child_process'),spawn=child.spawn;
for(const k of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])child[k]=(...args)=>deny(k==='exec'&&args[0]==='python --version'?'python-probe-denied':'subprocess');
const guard=__filename;
const flags=JSON.parse(process.env.CPREN91_NODE_FLAGS||'[]');
child.spawn=function(command,args,options){
 if(command!=='node'||!Array.isArray(args)||!args.some(a=>/[/\\]@n8n[/\\]task-runner[/\\].*start/.test(a)))return deny('spawn');
 events.push({kind:'guarded-javascript-task-runner'});
 return spawn.call(this,process.execPath,[...flags,'--require',guard,...args],{...options,cwd:lab,env:{...options.env,CPREN91_LAB:lab,CPREN91_STEP:process.env.CPREN91_STEP+'-runner',CPREN91_NODE_FLAGS:JSON.stringify(flags),SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:path.join(lab,'tmp'),TMP:path.join(lab,'tmp')}});
};
require('node:module').syncBuiltinESMExports();
// Negative checks cannot open a socket or read operational files.
assert.throws(()=>net.connect(443,'api.resend.com'),/DENIED/);
assert.throws(()=>net.connect(5678,'127.0.0.1'),/DENIED/);
assert.throws(()=>net.connect(3335,'127.0.0.1'),/DENIED/);
const repo=path.resolve(__dirname,'../../..');
for(const p of [path.join(repo,'n8n/.env'),path.join(repo,'.n8n-local/.n8n/database.sqlite')])assert.throws(()=>fs.readFileSync(p),/ERR_ACCESS_DENIED|Access to this API/);
events.length=0;
persist();
process.on('exit',code=>fs.writeFileSync(path.join(lab,(process.env.CPREN91_STEP||'guard')+'.guard.json'),JSON.stringify({code,events,filesystemRestricted:true},null,2)));
