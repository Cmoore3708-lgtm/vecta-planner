import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {recoveryReason,supervise} from '../../workers/control/supervisor.mjs';
import {createWorkerRuntime} from '../../lib/worker-runtime.js';
test('recovery distinguishes transport failure from working, idle, and vehicle-specific failures',()=>{
 const now=200000, context={pid:7,startedAt:0,now,reconnectSince:0,attentionSince:0};
 const status={pid:7,updatedAt:new Date(now).toISOString()};
 assert.equal(recoveryReason({...status,state:'connected',reason:'RELAY_ONLY'},context),null);
 assert.equal(recoveryReason({...status,state:'attention',reason:'UNAVAILABLE'},context),null);
 assert.equal(recoveryReason({...status,state:'attention',reason:'AMBIGUOUS'},context),null);
 assert.equal(recoveryReason({...status,state:'working',attentionReason:'LOGIN_REQUIRED'},context),null);
 assert.equal(recoveryReason({...status,state:'reconnecting'},context),'CONNECTION_STALLED');
 assert.equal(recoveryReason({...status,state:'reconnecting'},{...context,reconnectSince:now-1000}),null);
 assert.equal(recoveryReason({...status,state:'attention',reason:'LOGIN_REQUIRED'},context),'MANUAL_LOGIN_REQUIRED');
 assert.equal(recoveryReason({...status,state:'starting',attentionReason:'SIGN_IN_OR_SETTINGS_REQUIRED'},context),null);
 assert.equal(recoveryReason({...status,state:'attention',reason:'SIGN_IN_OR_SETTINGS_REQUIRED'},{...context,startedAt:now-5000}),null);
 assert.equal(recoveryReason({...status,state:'attention',reason:'LOGIN_REQUIRED'},{...context,attentionSince:now-1000}),null);
 assert.equal(recoveryReason({...status,updatedAt:new Date(0).toISOString()},context),'HEARTBEAT_STALE');
 assert.equal(recoveryReason({...status,pid:99},context),'HEARTBEAT_MISSING');
});
test('runtime observes supervisor recovery without manufacturing an operator stop',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-recovery-'));
 const recovery=path.join(root,'recover'), stop=path.join(root,'operator-stop');
 const runtime=createWorkerRuntime('Haynes',{env:{VECTA_WORKER_RECOVERY_FILE:recovery,VECTA_WORKER_STOP_FILE:stop},timers:false});
 try{assert.equal(runtime.stopRequested(),false);fs.writeFileSync(recovery,'stop');assert.equal(runtime.stopRequested(),true);assert.equal(fs.existsSync(stop),false);}
 finally{runtime.close();fs.rmSync(root,{recursive:true});}
});
test('restarting the runtime retains an unresolved supplier login',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-login-state-'));const file=path.join(root,'status');
 try{
  const options={env:{VECTA_WORKER_STATUS_FILE:file},timers:false};
  const first=createWorkerRuntime('Haynes',options);first.set('attention','LOGIN_REQUIRED');first.close();
  const second=createWorkerRuntime('Haynes',options);second.set('connected','RELAY_ONLY');
  assert.equal(JSON.parse(fs.readFileSync(file)).attentionReason,'LOGIN_REQUIRED');
  second.set('connected','LOOKUP_CONFIRMED');assert.equal(JSON.parse(fs.readFileSync(file)).attentionReason,'');second.close();
 }finally{fs.rmSync(root,{recursive:true});}
});
test('a real crashed child is restarted; operator stop prevents another launch', {timeout:10000}, async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-crash-'));
 const entry=path.join(root,'fixture.mjs'), count=path.join(root,'count'), stop=path.join(root,'stop'), status=path.join(root,'status');
 fs.writeFileSync(entry,`import fs from 'node:fs';const count=Number(fs.existsSync(process.env.COUNT)?fs.readFileSync(process.env.COUNT,'utf8'):0)+1;fs.writeFileSync(process.env.COUNT,String(count));if(count===1)process.exit(1);fs.writeFileSync(process.env.VECTA_WORKER_STOP_FILE,'stop');`);
 try{await supervise(entry,{env:{...process.env,COUNT:count,VECTA_WORKER_STOP_FILE:stop,VECTA_WORKER_STATUS_FILE:status},interval:10,backoff:[10],startupGrace:0,attentionGrace:30,log:()=>{}});assert.equal(fs.readFileSync(count,'utf8'),'2');}
 finally{fs.rmSync(root,{recursive:true});}
});
test('a recurring supplier login gets one graceful restart and then remains open', {timeout:10000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-login-'));
 const entry=path.join(root,'fixture.mjs'),count=path.join(root,'count'),stop=path.join(root,'stop'),status=path.join(root,'status');
 fs.writeFileSync(entry,`import fs from 'node:fs';const n=Number(fs.existsSync(process.env.COUNT)?fs.readFileSync(process.env.COUNT,'utf8'):0)+1;fs.writeFileSync(process.env.COUNT,String(n));fs.writeFileSync(process.env.VECTA_WORKER_STATUS_FILE,JSON.stringify({pid:process.pid,state:'attention',reason:'LOGIN_REQUIRED',updatedAt:new Date().toISOString()}));const began=Date.now();const timer=setInterval(()=>{if(fs.existsSync(process.env.VECTA_WORKER_RECOVERY_FILE)){clearInterval(timer);process.exit(0)}if(n===2&&Date.now()-began>150){fs.writeFileSync(process.env.VECTA_WORKER_STOP_FILE,'stop');clearInterval(timer);process.exit(0)}},10);`);
 try{await supervise(entry,{env:{...process.env,COUNT:count,VECTA_WORKER_STOP_FILE:stop,VECTA_WORKER_STATUS_FILE:status},interval:10,backoff:[10],startupGrace:0,attentionGrace:30,log:()=>{}});assert.equal(fs.readFileSync(count,'utf8'),'2');}
 finally{fs.rmSync(root,{recursive:true});}
});
test('an existing operator stop never starts a worker',{timeout:1000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-stop-'));const stop=path.join(root,'stop');fs.writeFileSync(stop,'stop');
 try{await supervise(path.join(root,'must-not-run.mjs'),{env:{VECTA_WORKER_STOP_FILE:stop,VECTA_WORKER_STATUS_FILE:path.join(root,'status')},interval:10});assert.equal(fs.existsSync(path.join(root,'status')),false);}
 finally{fs.rmSync(root,{recursive:true});}
});
test('startup warning that clears to READY does not schedule a restart',{timeout:10000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-ready-race-'));
 const entry=path.join(root,'fixture.mjs'),stop=path.join(root,'stop'),status=path.join(root,'status');
 const messages=[];
 fs.writeFileSync(entry,`import fs from 'node:fs';const write=(state,attentionReason='')=>fs.writeFileSync(process.env.VECTA_WORKER_STATUS_FILE,JSON.stringify({pid:process.pid,state,attentionReason,updatedAt:new Date().toISOString()}));write('starting','SIGN_IN_OR_SETTINGS_REQUIRED');setTimeout(()=>write('attention','SIGN_IN_OR_SETTINGS_REQUIRED'),40);setTimeout(()=>write('connected'),80);setTimeout(()=>{if(fs.existsSync(process.env.VECTA_WORKER_RECOVERY_FILE))process.exit(8);fs.writeFileSync(process.env.VECTA_WORKER_STOP_FILE,'stop');},200);`);
 try{
  await supervise(entry,{env:{...process.env,VECTA_WORKER_STOP_FILE:stop,VECTA_WORKER_STATUS_FILE:status},interval:10,backoff:[10],startupGrace:120,attentionGrace:100,log:message=>messages.push(message)});
  assert.deepEqual(messages,[],'a startup warning must clear before any recovery stop is requested');
 }finally{fs.rmSync(root,{recursive:true});}
});
