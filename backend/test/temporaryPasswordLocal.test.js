const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Client}=require('pg');const ec=require('../src/config/env');const users=require('../src/repositories/usuariosRepository');const auth=require('../src/repositories/authRepository');const sessions=require('../src/repositories/authSessionsRepository');
test('PostgreSQL local: alta y reset temporales, cambio limpia indicador, sesiones leen estado actual',{skip:process.env.RUN_TEMP_PASSWORD_LOCAL!=='1'},async()=>{
 ec.loadEnvironmentFile();const app=ec.validateAppConfig(process.env),cfg=ec.validateDatabaseConfig(process.env,{nodeEnv:app.nodeEnv});assert.equal(app.nodeEnv,'development');assert.ok(['localhost','127.0.0.1','::1'].includes(cfg.host));const db=new Client(cfg);await db.connect();
 try{await db.query('BEGIN');const key=crypto.randomUUID().slice(0,8);const hash=require('bcryptjs').hashSync('Temporary9!',4);const u=await users.crear({nombreCompleto:'Cuenta sintética temporal',username:'tmp-security-'+key,email:key+'@example.invalid',passwordHash:hash,rol:'personal_salud'},db);
 const flag=async()=> (await db.query('SELECT requiere_cambio_password FROM usuarios WHERE id=$1',[u.id])).rows[0].requiere_cambio_password;
 assert.equal(await flag(),true);
 const sid=crypto.randomUUID(),now=new Date();await sessions.crear({id:sid,usuarioId:u.id,refreshTokenHash:'a'.repeat(64),createdAt:now,absoluteExpiresAt:new Date(Date.now()+3600000)},db);
 assert.equal((await sessions.obtenerConUsuarioPorId(sid,db)).requiere_cambio_password,true);
 await auth.actualizarPassword({id:u.id,passwordHash:hash},db);assert.equal(await flag(),false);
 assert.equal((await sessions.obtenerConUsuarioPorId(sid,db)).requiere_cambio_password,false);
 await users.actualizar({id:u.id,nombreCompleto:u.nombre_completo,activo:true,rol:'personal_salud',passwordHash:hash},db);assert.equal(await flag(),true);
 await users.actualizar({id:u.id,nombreCompleto:u.nombre_completo,activo:true,rol:'personal_salud',passwordHash:null,email:key+'@example.test'},db);assert.equal(await flag(),true);
 }finally{await db.query('ROLLBACK');await db.end();}
});
