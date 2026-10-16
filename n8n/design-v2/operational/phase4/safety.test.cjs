'use strict';
require('./guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net'),fs=require('node:fs'),path=require('node:path');
test('phase4 harness blocks external TCP before opening a connection',()=>{
  const socket=new net.Socket();try{assert.throws(()=>socket.connect({host:'example.invalid',port:443}),/PHASE4_EXTERNAL_CONNECTION_BLOCKED/);}finally{socket.destroy();}
});
test('phase4 harness blocks a real pg connection',()=>{
  const {Client}=require('../../../../backend/node_modules/pg');
  assert.throws(()=>new Client({host:'127.0.0.1'}).connect(),/PHASE4_REAL_DATABASE_BLOCKED/);
});
test('phase4 harness refuses real env files before filesystem read',()=>{
  assert.throws(()=>fs.readFileSync(path.join(__dirname,'not-created','.env')),/PHASE4_REAL_ENV_BLOCKED/);
});
