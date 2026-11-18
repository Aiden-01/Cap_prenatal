const test=require('node:test'),assert=require('node:assert/strict'),bcrypt=require('bcryptjs');
const {passwordIssues}=require('../src/security/passwordPolicy');
const {changePasswordSchema}=require('../src/validations/auth.schemas');
const {createAuthMiddleware}=require('../src/middleware/auth');
const sessions=require('../src/services/sessionService'),auth=require('../src/services/authService');
const config={secret:'synthetic-long-secret-8A!'+ 'q'.repeat(32),algorithm:'HS256',issuer:'test',audience:'test',accessTokenTtlMinutes:10};
const sid='5ecde8e8-b0b7-4db6-96d4-9b013b1f7b34';
function record(){return {id:sid,usuario_id:1,activo:true,requiere_cambio_password:true,last_activity_at:new Date(),absolute_expires_at:new Date(Date.now()+3600000),refresh_token_hash:sessions.hashRefreshToken(sid+'.'+'x'.repeat(64))};}
test('política exige composición, rechaza comunes, límite bcrypt UTF-8 y confirmación',()=>{
 assert.deepEqual(passwordIssues('Temporal9!'),[]);
 for(const p of ['abcdefgh','ABCDEFGH','Abcdefgh','Abcdefg9','Password1!','Aa9!'+ 'ñ'.repeat(35)])assert.ok(passwordIssues(p).length);
 assert.equal(passwordIssues('Aa9!'+ 'ñ'.repeat(34)).length,0);
 assert.equal(changePasswordSchema.safeParse({current_password:'Temporal9!',new_password:'Personal8!',confirm_password:'diferente'}).success,false);
});
test('estado pendiente bloquea módulos aunque el JWT sea válido, pero permite cambio y logout',async()=>{
 const token=sessions.issueAccessToken({usuarioId:1,sessionId:sid,jwtConfig:config});
 const middleware=createAuthMiddleware({repository:{obtenerConUsuarioPorId:async()=>record()},getJwt:()=>config,getSession:()=>({idleTimeoutMinutes:15})});
 for(const [method,url,allowed] of [['GET','/api/pacientes',false],['POST','/api/auth/activity',false],['GET','/api/auth/me',true],['POST','/api/auth/cambiar-password',true],['POST','/api/auth/logout-all',true]]){
  const result=await new Promise(resolve=>middleware({headers:{authorization:'Bearer '+token},method,originalUrl:url},{},e=>resolve(e)));
  assert.equal(!result,allowed,url);if(!allowed)assert.equal(result.code,'PASSWORD_CHANGE_REQUIRED');
 }
});
test('refresh válido de contraseña temporal no rota ni emite credenciales nuevas',async()=>{
 let rotations=0;const r=record();
 await assert.rejects(sessions.refreshSession({refreshToken:sid+'.'+'x'.repeat(64),req:{},dependencies:{repository:{enTransaccion:fn=>fn({}),obtenerConUsuarioPorId:async()=>r,rotarRefresh:()=>{rotations++;}},config:{idleTimeoutMinutes:15}}}),e=>e.status===401);
 assert.equal(rotations,0);
});
test('cambio bloquea credenciales, rechaza reutilización y revoca dentro de la transacción',async()=>{
 const hash=await bcrypt.hash('Temporal9!',4),db={};let updates=0,revocations=0;
 const dependencies={authRepository:{obtenerCredencialesPorId:async(id,actualDb,opts)=>{assert.equal(actualDb,db);assert.equal(opts.bloquear,true);return {activo:true,password_hash:hash};},actualizarPassword:async(data,actualDb)=>{assert.equal(actualDb,db);assert.ok(await bcrypt.compare('Personal8!',data.passwordHash));updates++;}},authSessionsRepository:{enTransaccion:fn=>fn(db)},sessionService:{revokeAllInTransaction:async args=>{assert.equal(args.db,db);assert.equal(args.reason,'password_changed');revocations++;}},registrarEventoPrivado:async()=>{}};
 await assert.rejects(auth.changePassword({usuarioId:1,currentPassword:'Temporal9!',newPassword:'Temporal9!',req:{},dependencies}),e=>e.status===400);
 assert.equal(updates,0);assert.equal(revocations,0);
 await auth.changePassword({usuarioId:1,currentPassword:'Temporal9!',newPassword:'Personal8!',req:{},dependencies});
 assert.equal(updates,1);assert.equal(revocations,1);
});

test('login concurrente con restablecimiento no crea sesión a partir de credenciales antiguas',async()=>{
 const hash=await bcrypt.hash('Temporal9!',4);let writes=0;
 await assert.rejects(auth.login({username:'synthetic',password:'Temporal9!',req:{},dependencies:{authRepository:{obtenerUsuarioPorUsername:async()=>({id:1,activo:true,password_hash:hash}),obtenerCredencialesPorId:async(id,db,options)=>{assert.equal(options.bloquear,true);return {activo:true,password_hash:'nuevo-hash'};}},permisosRepository:{listarCodigosPorUsuario:async()=>[]},sessionDependencies:{repository:{enTransaccion:fn=>fn({}),crear:async()=>{writes++;}},config:{absoluteHours:8}},registrarEventoPrivado:async()=>{}}}),e=>e.status===401);
 assert.equal(writes,0);
});
