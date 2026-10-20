'use strict';
// Local-only audit. No SSH, runtime process startup, staging or publication.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),approved='fabc24af76c9f2b3da99f60cdd3d834e2ad39cd7';
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(git('branch','--show-current'),'codex/cpren91-backup-alerts');
cp.execFileSync('git',['merge-base','--is-ancestor',approved,'HEAD'],{cwd:root});
assert.equal(git('diff','--cached','--name-only'),'');
const auditSummary=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence/phase6-summary.json')));
assert.equal(auditSummary.rawOperationalEvidencePublished,false);
const protectedFiles=JSON.parse(fs.readFileSync(path.join(__dirname,'../phase3/evidence/protected-files.json'))).clinicalAndComponents;
const extra=['n8n/workflows/monitoreo-respaldos-externos-v1.json','operations/backup-monitor/build-workflow.cjs','operations/backup-monitor/schema.sql','operations/backup-monitor/test_recipient.py','operations/backup-monitor/workflow.test.cjs'];
for(const p of [...protectedFiles.map(x=>x.file),...extra]){
 assert.equal(sha(fs.readFileSync(path.join(root,p))),sha(cp.execFileSync('git',['show',approved+':'+p],{cwd:root})),p);
}
const python=String.raw`import ast,configparser,json,pathlib,subprocess
base=pathlib.Path('operations/backup-monitor')
old=ast.parse(subprocess.check_output(['git','show','fabc24af76c9f2b3da99f60cdd3d834e2ad39cd7:operations/backup-monitor/monitor.py'],text=True,encoding='utf-8'))
current=ast.parse((base/'monitor.py').read_text(encoding='utf-8'))
for name in ['Store','server','normalize','validate','validate_recipient','iso','slot_for']:
 a=next(n for n in old.body if getattr(n,'name',None)==name)
 b=next(n for n in current.body if getattr(n,'name',None)==name)
 assert ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False),name
assert not any(isinstance(n,ast.Import) and any(a.name=='subprocess' for a in n.names) for n in current.body)
for name in ['monitor.py','publisher.py','evidence_snapshot.py','test_monitor.py','test_snapshot.py']:
 ast.parse((base/name).read_text(encoding='utf-8'))
units={p.name:p for p in (base/'phase7/systemd').glob('*')}
assert len(units)==4
for name,p in units.items():
 c=configparser.ConfigParser(interpolation=None);c.optionxform=str;c.read(p,encoding='utf-8')
 if name.endswith('.service'):
  s=c['Service']
  for key in ['NoNewPrivileges','ProtectHome','PrivateTmp','ProtectKernelTunables','ProtectKernelModules','ProtectControlGroups','RestrictSUIDSGID','RestrictNamespaces']:
   assert s[key]=='yes',(name,key)
  assert s['ProtectSystem']=='strict'
  assert s['UMask']=='0077' and s['CapabilityBoundingSet']=='' and s['AmbientCapabilities']==''
  assert s['ExecStart'].startswith('/usr/bin/python3 -E -s -B /opt/cap-prenatal-backup-monitor/')
  assert '--fixture' not in s['ExecStart'] and '--systemd' not in s['ExecStart']
  assert 'MemoryMax' in s and 'TasksMax' in s and 'LimitNOFILE' in s
  if name.endswith('-api.service'):
   assert s['PrivateNetwork']=='no' and s['IPAddressAllow']=='localhost'
   assert s['User']=='cap-backup-monitor' and s['Group']=='cap-backup-monitor'
  elif name.endswith('-observer.service'):
   assert s['User']=='cap-backup-monitor' and s['Group']=='cap-backup-monitor'
   assert s['PrivateNetwork']=='yes' and '--snapshot' in s['ExecStart']
  else:
   assert s['User']=='root' and s['Group']=='cap-backup-monitor'
   assert s['RuntimeDirectoryMode']=='0750' and s['PrivateNetwork']=='yes'
 else:
  assert c['Timer']['OnUnitInactiveSec']=='60s'
print(json.dumps({'coreStoreApiAndClinicalLogicAstIdentical':True,'pythonSyntax':'PASS','unitStaticChecks':4,'systemdExecuted':False}))`;
const structural=JSON.parse(cp.execFileSync('python',['-B','-c',python],{cwd:root,encoding:'utf8'}));
const resultPath=path.join(__dirname,'evidence/results.json');const results=JSON.parse(fs.readFileSync(resultPath));
assert.equal(results.python.failed,0);assert.equal(results.node.failed,0);
assert.equal(results.python.total-results.python.skipped,results.python.passed);
assert.equal(results.node.passed,11);
cp.execFileSync('node',['operations/backup-monitor/build-workflow.cjs','--check'],{cwd:root});
// Closed release inventory: independent of private files and clean/dirty Git state.
const paths=['.gitignore','README.md','DEPLOYMENT.md','monitor.py','test_monitor.py',
 'publisher.py','evidence_snapshot.py','test_snapshot.py',
 'phase7/README.md','phase7/CONTRACT.md','phase7/verify.cjs',
 'phase7/systemd/cap-prenatal-backup-evidence.service','phase7/systemd/cap-prenatal-backup-evidence.timer',
 'phase7/systemd/cap-prenatal-backup-observer.service','phase7/systemd/cap-prenatal-backup-monitor-api.service',
 'phase7/evidence/python-tests.txt','phase7/evidence/node-tests.tap','phase7/evidence/generator.txt',
 'phase7/evidence/results.json','phase7/evidence/checks.json','phase7/evidence/files.json',
 'phase7/evidence/phase6-summary.json'].map(p=>'operations/backup-monitor/'+p).sort();
const unexpected=[...git('diff','--name-only').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(p=>p&&!paths.includes(p));
assert.deepEqual(unexpected,[],'Unexpected changes outside release inventory');
for(const p of paths){
 assert(!/\.sqlite(?:-|$)|\/runtime\/|\.pem$|\.key$|\.env$|\.dump$|\.backup$/i.test(p));
 const text=fs.readFileSync(path.join(root,p),'utf8');
 assert(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bre_[A-Za-z0-9]{20,}\b|postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/.test(text),p);
 assert(!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text),p);
 const addresses=text.match(/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[];
 assert(addresses.every(x=>x.endsWith('.invalid')||x==='citas@notificaciones.hercor-nexus.com'),'Unexpected address: '+p);
}
const checks={...structural,phase6RawEvidenceExcluded:true,clinicalAndComponentsUnchanged:7,workflowAndGeneratorUnchanged:true,privateRoutingUnchanged:true,baselineCommit:approved,reviewedPaths:paths};
fs.writeFileSync(path.join(__dirname,'evidence/checks.json'),JSON.stringify(checks,null,2)+'\n');
const final=[...new Set([...paths,'operations/backup-monitor/phase7/evidence/checks.json','operations/backup-monitor/phase7/evidence/files.json'])].sort();
const entries=final.filter(p=>!p.endsWith('phase7/evidence/files.json')).map(p=>({path:p,bytes:fs.statSync(path.join(root,p)).size,sha256:sha(fs.readFileSync(path.join(root,p)))}));
fs.writeFileSync(path.join(__dirname,'evidence/files.json'),JSON.stringify(entries,null,2)+'\n');
console.log(JSON.stringify({...checks,newOrModifiedPaths:final.length,python:results.python,node:results.node}));
