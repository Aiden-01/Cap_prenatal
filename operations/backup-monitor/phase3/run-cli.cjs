'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),lab=path.resolve(process.argv[2]),step=process.argv[3],args=process.argv.slice(4);
assert(lab.startsWith(path.join(__dirname,'runtime','run-')));
assert(/^[a-z0-9-]+$/.test(step));
assert(['user-management:reset','import:credentials','import:workflow','execute'].includes(args[0]));
assert.equal(require(path.join(root,'node_modules/n8n/package.json')).version,'2.34.4');
const guard=path.join(__dirname,'network-guard.cjs');
const flags=['--permission','--allow-addons','--allow-child-process',
 '--allow-fs-read='+path.join(root,'node_modules'),'--allow-fs-read='+lab,'--allow-fs-read='+guard,
 ...['/.dockerenv','/run/.containerenv'].map(p=>'--allow-fs-read='+path.resolve(p)), '--allow-fs-write='+lab];
const env={};for(const k of ['SystemRoot','WINDIR','COMSPEC','PATHEXT'])if(process.env[k])env[k]=process.env[k];
Object.assign(env,{PATH:path.dirname(process.execPath),HOME:lab,USERPROFILE:lab,APPDATA:lab,LOCALAPPDATA:lab,TEMP:path.join(lab,'tmp'),TMP:path.join(lab,'tmp'),N8N_USER_FOLDER:path.join(lab,'profile'),DB_TYPE:'sqlite',N8N_ENCRYPTION_KEY:'synthetic-disposable-cpren91-not-a-real-key',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_TEMPLATES_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_SENTRY_DSN:'',N8N_SENTRY_BACKEND_DSN:'',N8N_COMMUNITY_PACKAGES_ENABLED:'true',N8N_COMMUNITY_PACKAGES_MANAGED_BY_ENV:'false',N8N_REINSTALL_MISSING_PACKAGES:'false',N8N_COMMUNITY_PACKAGES_PREVENT_LOADING:'false',N8N_RUNNERS_MODE:'internal',N8N_RUNNERS_BROKER_PORT:'18869',N8N_RUNNERS_BROKER_LISTEN_ADDRESS:'127.0.0.1',N8N_RUNNERS_INSECURE_MODE:'false',N8N_RUNNERS_TASK_TIMEOUT:'30',N8N_RUNNERS_PYTHON_ENABLED:'false',NODE_FUNCTION_ALLOW_BUILTIN:'',NODE_FUNCTION_ALLOW_EXTERNAL:'',GENERIC_TIMEZONE:'America/Guatemala',TZ:'America/Guatemala',N8N_EXPRESSION_ENGINE:'legacy',N8N_BLOCK_ENV_ACCESS_IN_NODE:'true',N8N_LOG_LEVEL:'info',CPREN91_LAB:lab,CPREN91_STEP:step,CPREN91_NODE_FLAGS:JSON.stringify(flags)});
env.NODES_INCLUDE=JSON.stringify(['n8n-nodes-base.manualTrigger','n8n-nodes-base.scheduleTrigger','n8n-nodes-base.code','n8n-nodes-base.httpRequest','n8n-nodes-base.if','n8n-nodes-resend.resend']);
const out=fs.openSync(path.join(lab,step+'.stdout'),'w'),err=fs.openSync(path.join(lab,step+'.stderr'),'w');
const result=cp.spawnSync(process.execPath,[...flags,'--require',guard,path.join(root,'node_modules/n8n/bin/n8n'),...args],{cwd:lab,env,encoding:'utf8',timeout:100000,stdio:['ignore',out,err]});
fs.closeSync(out);fs.closeSync(err);
console.log(JSON.stringify({step,exit:result.status,error:result.error?.code||null}));
process.exitCode=result.status===0?0:1;
