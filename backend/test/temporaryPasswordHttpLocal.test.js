const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),bcrypt=require('bcryptjs');
test('HTTP local: alta temporal, CSRF, refresh bloqueado, cambio propio y bloqueo del reinicio administrativo',{skip:process.env.RUN_TEMP_PASSWORD_LOCAL!=='1',timeout:60000},async()=>{
 const ec=require('../src/config/env');ec.loadEnvironmentFile();const config=ec.validateAppConfig(process.env),dbConfig=ec.validateDatabaseConfig(process.env,{nodeEnv:config.nodeEnv});assert.equal(config.nodeEnv,'development');assert.ok(['localhost','127.0.0.1','::1'].includes(dbConfig.host));
 const pool=require('../src/db/pool');await require('../src/db/schemaCompatibility').assertSchemaCompatible(pool);
 const nonce=crypto.randomBytes(6).toString('hex'),actorName='tmp-admin-'+nonce,targetName='tmp-user-'+nonce;const ids=[];let server;
 const actorPassword='Synthetic-A9!'+nonce,temp='Temporary-A9!'+nonce,personal='Personal-B8!'+nonce,reset='Reset-C7!'+nonce;
 const jar=()=>new Map();
 try{
  const actor=(await pool.query("INSERT INTO usuarios(nombre_completo,username,email,password_hash,rol_id,requiere_cambio_password) VALUES($1,$2,$3,$4,(SELECT id FROM roles WHERE nombre='admin'),FALSE) RETURNING id",['Administrador sintético HTTP',actorName,actorName+'@example.invalid',await bcrypt.hash(actorPassword,4)])).rows[0];ids.push(actor.id);
  server=require('../src/index').app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
  async function send(path,method,cookies,body,csrf=true){const headers={Cookie:[...cookies].map(([k,v])=>k+'='+v).join(';')};if(body!==undefined)headers['Content-Type']='application/json';if(csrf&&cookies.has('cap_prenatal_csrf'))headers['X-CSRF-Token']=decodeURIComponent(cookies.get('cap_prenatal_csrf'));const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});for(const h of res.headers.getSetCookie()){const first=h.split(';')[0],i=first.indexOf('=');if(first.slice(i+1))cookies.set(first.slice(0,i),first.slice(i+1));else cookies.delete(first.slice(0,i));}let data;try{data=await res.json();}catch{data={};}return {status:res.status,data};}
  const admin=jar();assert.equal((await send('/auth/login','POST',admin,{username:actorName,password:actorPassword})).status,200);
  const created=await send('/usuarios','POST',admin,{nombre_completo:'Usuario sintético HTTP',username:targetName,email:targetName+'@example.invalid',password:temp,rol:'personal_salud'});assert.equal(created.status,201);
  const target=(await pool.query('SELECT id FROM usuarios WHERE username=$1',[targetName])).rows[0];assert.ok(target);ids.push(target.id);
  const user=jar();const login=await send('/auth/login','POST',user,{username:targetName,password:temp});assert.equal(login.status,200);assert.equal(login.data.usuario.requiere_cambio_password,true);assert.deepEqual(login.data.usuario.permisos,[]);
  assert.equal((await send('/pacientes','GET',user)).status,403);
  assert.equal((await send('/auth/activity','POST',user,{})).status,403);
  assert.equal((await send('/auth/cambiar-password','POST',user,{current_password:temp,new_password:personal,confirm_password:personal},false)).status,403);
  assert.equal((await send('/auth/refresh','POST',user,{})).status,401);
  assert.equal((await send('/auth/login','POST',user,{username:targetName,password:temp})).status,200);const stale=new Map(user);
  assert.equal((await send('/auth/cambiar-password','POST',user,{current_password:temp,new_password:temp,confirm_password:temp})).status,400);
  assert.equal((await send('/auth/cambiar-password','POST',user,{current_password:temp,new_password:personal,confirm_password:personal})).status,200);
  assert.equal((await send('/auth/me','GET',stale)).status,401);
  assert.equal((await send('/auth/refresh','POST',stale,{})).status,401);
  assert.equal((await send('/auth/login','POST',user,{username:targetName,password:temp})).status,401);
  const normal=await send('/auth/login','POST',user,{username:targetName,password:personal});assert.equal(normal.status,200);assert.equal(normal.data.usuario.requiere_cambio_password,false);
  assert.equal((await send('/pacientes','GET',user)).status,200);
  assert.equal((await send('/usuarios/'+target.id,'PUT',admin,{password:reset})).status,400);
  assert.equal((await send('/auth/me','GET',user)).status,200);
  assert.equal((await send('/auth/login','POST',jar(),{username:targetName,password:reset})).status,401);
  assert.equal((await send('/auth/logout','POST',user,{})).status,200);
 }finally{
  // Preserve audit history; only accounts created by this test are disabled.
  if(ids.length){await pool.query('UPDATE usuarios SET activo=FALSE WHERE id=ANY($1::int[])',[ids]);await pool.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW()),revoked_reason=COALESCE(revoked_reason,'synthetic_test_completed') WHERE usuario_id=ANY($1::int[])",[ids]);}
  if(server)await new Promise(r=>server.close(r));await pool.end();
 }
});
