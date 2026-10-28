const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Pool}=require('pg'),bcrypt=require('bcryptjs');
const {migrate}=require('../src/db/migrate');
const {assertSchemaCompatible}=require('../src/db/schemaCompatibility');

test('CHECKPOINT-14: upgrade desde main 022, instalación y restauración exclusivamente sintéticos',{
 skip:process.env.RUN_CHECKPOINT14_TEMP_POSTGRES!=='1',timeout:180000,
},async t=>{
 const baseline='d5fae677fa462af9ca5b7174a46d3ebf21e12196';
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cap-checkpoint14-')),data=path.join(root,'data');
 const bin=process.env.CHECKPOINT14_POSTGRES_BIN;assert.ok(bin);
 const config={host:'127.0.0.1',port:55481,user:'checkpoint14_test',password:'',database:'postgres',ssl:false,max:4,connectionTimeoutMillis:3000};
 const env={...process.env};for(const key of Object.keys(env))if(/^PG|DATABASE_URL|^DB_/i.test(key))delete env[key];
 const run=(name,args)=>execFileSync(path.join(bin,name+(process.platform==='win32'?'.exe':'')),args,{env,windowsHide:true,stdio:'ignore',timeout:30000});
 const connection=['--host=127.0.0.1','--port=55481','--username=checkpoint14_test','--no-password'];
 const output=path.resolve(__dirname,'../../docs/cpren120/checkpoint14');fs.mkdirSync(output,{recursive:true});
 const report={synthetic_only:true,production_access:false,baseline_main:baseline,postgres_port:55481,checks:[],snapshots:[]};
 let db,started=false;
 const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const tables=['roles','pacientes','embarazos','controles_prenatales','citas_prenatales','auth_sessions'];
 const snapshot=async pool=>Object.fromEntries(await Promise.all(tables.map(async name=>[name,(await pool.query(`SELECT * FROM ${name} ORDER BY id`)).rows])));
 const migrateDb=async(database,options={})=>{
  const result=await migrate({db:new Pool({...config,database}),logger:{log(){},error(){}},setExitCode(){},...options});
  assert.equal(result.ok,true,result.error?.message);
 };
 try{
  run('initdb',['-D',data,'-U',config.user,'-A','trust','--no-locale','-E','UTF8']);
  run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o','-h 127.0.0.1 -p 55481','-w','start']);started=true;
  db=new Pool(config);assert.equal(path.resolve((await db.query('SHOW data_directory')).rows[0].data_directory),path.resolve(data));
  report.postgres_version=(await db.query('SHOW server_version')).rows[0].server_version;
  const schema=execFileSync('git',['show',baseline+':backend/src/db/schema.sql'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',maxBuffer:2000000});
  const schemaPath=path.join(root,'main-schema.sql'),migrationsDir=path.join(root,'main-migrations');
  fs.writeFileSync(schemaPath,schema);fs.mkdirSync(migrationsDir);
  const source=path.resolve(__dirname,'../src/db/migrations');
  const oldFiles=fs.readdirSync(source).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=22).sort();
  for(const name of oldFiles){
   const sql=execFileSync('git',['show',baseline+':backend/src/db/migrations/'+name],{cwd:path.resolve(__dirname,'../..')});
   fs.writeFileSync(path.join(migrationsDir,name),sql);
  }
  // Solo este bootstrap anterior al módulo clínico usa su contrato histórico.
  await migrateDb('postgres',{schemaPath,migrationsDir,verifyCompatibility:async()=>{}});
  const passwordHash=await bcrypt.hash('synthetic-checkpoint14-login',4);
  await db.query(`INSERT INTO roles(id,nombre) VALUES(1,'director'),(2,'admin'),(3,'personal_salud') ON CONFLICT DO NOTHING;
   INSERT INTO permisos(codigo,descripcion,categoria) VALUES('pacientes.ver','Sintético','pacientes') ON CONFLICT DO NOTHING`);
  for(const [id,role]of [[1,1],[2,2],[3,3]])await db.query(`INSERT INTO usuarios(id,nombre_completo,username,password_hash,rol_id)
   VALUES($1,'Cuenta sintética',$4,$2,$3)`,[id,passwordHash,role,'checkpoint14_'+id]);
  await db.query(`INSERT INTO usuario_permisos(usuario_id,permiso_id) SELECT 3,id FROM permisos WHERE codigo='pacientes.ver';
   INSERT INTO pacientes(id,no_expediente,nombres,apellidos,registrado_por) VALUES(1,'SYN-CP14','Paciente sintética','Conservada',3);
   INSERT INTO embarazos(id,paciente_id,numero_embarazo,estado) VALUES(11,1,1,'activo');
   INSERT INTO controles_prenatales(id,paciente_id,embarazo_id,numero_control,fecha) VALUES(111,1,11,1,'2026-10-20');
   INSERT INTO citas_prenatales(embarazo_id,fecha_programada,control_origen_id,registrado_por) VALUES(11,'2026-11-20',111,3);
   INSERT INTO auth_sessions(usuario_id,refresh_token_hash,absolute_expires_at) VALUES(3,repeat('a',64),NOW()+INTERVAL '1 day')`);
  const before=await snapshot(db),users=(await db.query('SELECT * FROM usuarios ORDER BY id')).rows;
  const grants=(await db.query('SELECT * FROM usuario_permisos WHERE usuario_id=3 ORDER BY id')).rows;
  const dump=path.join(root,'main-synthetic.dump');run('pg_dump',[...connection,'--dbname=postgres','--format=custom','--file='+dump]);
  await t.test('respaldo main sintético restaurable antes de actualizar',async()=>{
   await db.query('CREATE DATABASE restored_before');
   run('pg_restore',[...connection,'--dbname=restored_before','--exit-on-error',dump]);
   const restored=new Pool({...config,database:'restored_before'});
   try{assert.deepEqual(await snapshot(restored),before);assert.deepEqual((await restored.query('SELECT * FROM usuarios ORDER BY id')).rows,users)}finally{await restored.end()}
   report.checks.push('backup_restore_before_upgrade');
  });
  await t.test('023–030 en orden preservan expedientes, embarazos, controles, citas, sesiones y cuentas',async()=>{
   await migrateDb('postgres');await assertSchemaCompatible(db);
   assert.deepEqual(await snapshot(db),before);
   for(const user of users){const now=(await db.query('SELECT * FROM usuarios WHERE id=$1',[user.id])).rows[0];
    for(const key of Object.keys(user))assert.deepEqual(now[key],user[key],key);
    assert.equal(now.cargo_id,null);assert.equal(now.email,null);assert.equal(await bcrypt.compare('synthetic-checkpoint14-login',now.password_hash),true);
   }
   assert.deepEqual((await db.query('SELECT * FROM usuario_permisos WHERE usuario_id=3 ORDER BY id')).rows,grants);
   assert.equal((await db.query(`SELECT count(*)::int n FROM usuario_permisos up JOIN permisos p ON p.id=up.permiso_id WHERE p.codigo LIKE 'notas_%' OR p.codigo LIKE 'ordenes_medicas.%'`)).rows[0].n,0);
   assert.equal((await db.query(`SELECT count(*)::int n FROM cargos_personal WHERE codigo='MED'`)).rows[0].n,0);
   assert.equal((await db.query(`SELECT count(*)::int n FROM cargos_personal WHERE nombre='Médico/a' AND codigo IS NULL`)).rows[0].n,1);
   assert.equal((await db.query('SELECT count(*)::int n FROM controles_seguimiento_notas')).rows[0].n,0,'No activa controles históricos');
   assert.equal((await db.query('SELECT count(*)::int n FROM notas_clinicas')).rows[0].n,0);
   report.applied_clinical_migrations=(await db.query("SELECT filename FROM schema_migrations WHERE filename>='023_' ORDER BY filename")).rows.map(r=>r.filename);
   assert.equal(report.applied_clinical_migrations.length,8);report.checks.push('upgrade_022_to_030_no_core_data_loss_no_clinical_grants');
   report.snapshots.push({stage:'core_before_after',sha256:hash(before),tables:tables.map(table=>({table,rows:before[table].length}))});
  });
  await t.test('esquema final sin especialidades/clasificación y repetición sin cambios',async()=>{
   assert.equal((await db.query("SELECT to_regclass('public.especialidades_personal') AS tab")).rows[0].tab,null);
   assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND ((table_name='usuarios' AND column_name='especialidad_id') OR (table_name='cargos_personal' AND column_name='clasificacion_profesional'))")).rows[0].n,0);
   const registry=(await db.query('SELECT * FROM schema_migrations ORDER BY filename')).rows;
   await migrateDb('postgres');assert.deepEqual((await db.query('SELECT * FROM schema_migrations ORDER BY filename')).rows,registry);
   assert.deepEqual(await snapshot(db),before);report.checks.push('final_schema_and_idempotence');
  });
  await t.test('instalación nueva del esquema final y restauración posterior equivalentes',async()=>{
   await db.query('CREATE DATABASE fresh_final');await migrateDb('fresh_final');
   const fresh=new Pool({...config,database:'fresh_final'});
   try{await assertSchemaCompatible(fresh);assert.equal((await fresh.query('SELECT count(*)::int n FROM usuarios')).rows[0].n,0)}finally{await fresh.end()}
   const afterDump=path.join(root,'final-synthetic.dump');run('pg_dump',[...connection,'--dbname=postgres','--format=custom','--file='+afterDump]);
   await db.query('CREATE DATABASE restored_after');run('pg_restore',[...connection,'--dbname=restored_after','--exit-on-error',afterDump]);
   const restored=new Pool({...config,database:'restored_after'});
   try{await assertSchemaCompatible(restored);assert.deepEqual(await snapshot(restored),before);assert.deepEqual((await restored.query('SELECT * FROM usuarios ORDER BY id')).rows,(await db.query('SELECT * FROM usuarios ORDER BY id')).rows)}finally{await restored.end()}
   report.checks.push('fresh_final_and_post_upgrade_restore');
   report.synthetic_dump_sha256=[dump,afterDump].map(file=>({name:path.basename(file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
  });
  fs.writeFileSync(path.join(output,'migration-readiness.json'),JSON.stringify(report,null,2)+'\n');
  t.diagnostic('PostgreSQL '+report.postgres_version+'; baseline Git main 022 sintético; no AWS ni respaldo real');
 }finally{
  if(db)await db.end();if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.equal(path.dirname(path.resolve(data)),path.resolve(root));
  fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
});
