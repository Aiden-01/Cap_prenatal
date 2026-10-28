// Solo suites locales y clústeres creados por las pruebas; nunca destinos .env.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/cpren120/checkpoint14');
const logs=path.join(root,'tmp_cpren14/logs');
const selected=process.argv[2];
const suites={
 samples:['test/notaClinicaPdf.test.js','test/notaClinicaPdfCheckpoint13.test.js'],
 unit:['test/notaClinicaPdf.test.js','test/notaClinicaPdfCheckpoint13.test.js','test/notaClinicaPdfHttp.test.js','test/notasClinicasService.test.js','test/seguimientoNotas.test.js'],
 migrations:['test/checkpoint10MigracionesPostgres.test.js','test/checkpoint14MigracionesPostgres.test.js'],
 catalogs:['test/catalogosPostgres.test.js'],profiles:['test/perfilesProfesionalesPostgres.test.js'],
 authorship:['test/autoriaClinicaPostgres.test.js'],notes:['test/notasClinicasPostgres.test.js'],tracking:['test/seguimientoNotasPostgres.test.js'],
};
const npmTasks={backend:['backend','test'],frontend:['frontend','test'],lint:['frontend','run','lint'],build:['frontend','run','build']};
if(!Object.hasOwn(suites,selected)&&!Object.hasOwn(npmTasks,selected))throw Error('Suite no admitida');
const env={...process.env};
for(const key of Object.keys(env))if(/^(RUN_|DB_|PG|DATABASE_URL$|JWT_|SESSION_|ACCESS_TOKEN_|VITE_|CPREN_CHECKPOINT)/i.test(key))delete env[key];
Object.assign(env,{NODE_ENV:'test',CPREN_CHECKPOINT14:'1',CPREN_CHECKPOINT13:'1',CPREN_CHECKPOINT13B:'1',
 PUPPETEER_EXECUTABLE_PATH:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
if(selected==='build')env.NODE_ENV='production';
if(selected==='samples')Object.assign(env,{RUN_CHECKPOINT13_PDF:'1',RUN_NOTA_PDF_BROWSER:'1'});
const prefixes={migrations:['CHECKPOINT10','CHECKPOINT14'],catalogs:['CATALOGOS'],profiles:['PERFILES'],authorship:['AUTORIA'],notes:['NOTAS'],tracking:['SEGUIMIENTO']};
for(const prefix of prefixes[selected]||[])Object.assign(env,{[`RUN_${prefix}_TEMP_POSTGRES`]:'1',[`${prefix}_POSTGRES_BIN`]:'C:\\Program Files\\PostgreSQL\\18\\bin'});
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(logs,{recursive:true});
const log=fs.openSync(path.join(logs,selected+'.log'),'w'),started=new Date().toISOString();
const npm=npmTasks[selected],cwd=path.join(root,npm?npm[0]:'backend');
const executable=npm?process.env.ComSpec||'cmd.exe':process.execPath;
const args=npm?['/d','/s','/c',`npm ${npm.slice(1).join(' ')}`]:['--test','--test-concurrency=1',...suites[selected]];
const child=spawn(executable,args,{cwd,env,windowsHide:true,stdio:['ignore',log,log]});
child.on('error',error=>{console.error(error.message);process.exitCode=1});
child.on('close',(code,signal)=>{
 fs.closeSync(log);const text=fs.readFileSync(path.join(logs,selected+'.log'),'utf8');
 const counts={};for(const key of ['tests','pass','fail','skipped','cancelled']){const m=text.match(new RegExp('(?:ℹ |# )'+key+' (\\d+)','u'));if(m)counts[key]=Number(m[1]);}
 if(selected==='frontend'){
  const dom=text.match(/Tests\s+(\d+) passed/),files=text.match(/Test Files\s+(\d+) passed/);
  if(dom)counts.dom_pass=Number(dom[1]);if(files)counts.dom_files=Number(files[1]);
 }
 const result={suite:selected,started_utc:started,finished_utc:new Date().toISOString(),exit_code:code,signal,counts,
  synthetic_only:true,disposable_postgres_only:Boolean(prefixes[selected]),equipo:'Casa',machine:'HUGUITO',
  command:npm?`npm ${npm.slice(1).join(' ')}`:`node ${args.join(' ')}`,cwd:path.relative(root,cwd),local_log:path.relative(root,path.join(logs,selected+'.log'))};
 fs.writeFileSync(path.join(out,selected+'-result.json'),JSON.stringify(result,null,2)+'\n');
 console.log(text.split(/\r?\n/).slice(-18).join('\n'));console.log(JSON.stringify(result));process.exitCode=code??1;
});
