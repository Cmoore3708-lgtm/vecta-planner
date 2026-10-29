import test from 'node:test';
import assert from 'node:assert/strict';
import {batchRelayHandler} from '../../supabase/functions/worker-batch-tests/handler.mjs';
const token='a'.repeat(64),workerId='12345678-1234-4234-8234-123456789abc';
const env=name=>({SUPABASE_URL:'https://brqsejjykrubxuofavuu.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-server-key'})[name];
const req=body=>new Request('https://example.com',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)});
test('standalone relay refuses missing and unpaired credentials before any queue action',async()=>{
 let calls=0;const handler=batchRelayHandler({env,fetcher:async()=>{calls++;return Response.json([]);}});
 assert.equal((await handler(new Request('https://example.com',{method:'POST',body:'{}'}))).status,401);assert.equal(calls,0);
 assert.equal((await handler(req({action:'preflight'}))).status,401);assert.equal(calls,1);
});
test('standalone relay is locked to Test and never changes Haynes heartbeat when authenticating',async()=>{
 let queueCalls=0;
 const handler=batchRelayHandler({env,fetcher:async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer private-server-key');
  if(url.includes('/haynes_relay_worker?')){assert.ok(url.includes('&select=id&token_hash=eq.'));assert.equal(options.method,undefined);return Response.json([{id:1}]);}
  queueCalls++;const body=JSON.parse(options.body);assert.equal(body.p_action,'preflight');return Response.json({status:'WORKER_OFFLINE'});
 }});
 const result=await handler(req({action:'preflight'}));assert.equal((await result.json()).status,'WORKER_OFFLINE');assert.equal(queueCalls,1);
 const wrong=batchRelayHandler({env:name=>name==='SUPABASE_URL'?'https://jywufozycuwuoshlulwl.supabase.co':env(name),fetcher:()=>{throw Error('must not fetch');}});assert.equal((await wrong(req({action:'preflight'}))).status,404);
});
test('paired PC start selects 100, includes CM14 KEL first and saves its prior failure',async()=>{
 let started;
 const handler=batchRelayHandler({env,fetcher:async(url,options)=>{
  if(url.includes('/haynes_relay_worker?'))return Response.json([{id:1}]);
  const {p_action,p_payload}=JSON.parse(options.body);
  if(p_action==='preflight')return Response.json({status:'READY'});
  if(p_action==='cohort')return Response.json({vehicles:[{registration:'CM14 KEL',make:'Nissan'},...Array.from({length:100},(_,i)=>({registration:'AB'+String(i).padStart(2,'0')+'XYZ'}))]});
  assert.equal(p_action,'start');started=p_payload;return Response.json({status:'RUNNING',id:workerId});
 }});
 const res=await handler(req({action:'start',count:100,launchKey:workerId}));assert.equal(res.status,200);assert.equal(started.cohort.length,100);assert.equal(started.cohort[0].registration,'CM14KEL');assert.equal(started.cohort[0].baselineFailure.status,'REVIEW_REQUIRED');assert.ok(!JSON.stringify(started).includes(token));
});
test('paired PC cannot send arbitrary SQL actions or unbounded evidence',async()=>{
 let calls=0;const handler=batchRelayHandler({env,fetcher:async()=>{calls++;return Response.json([{id:1}]);}});
 const res=await handler(req({action:'cohort'}));assert.equal(res.status,400);assert.equal(calls,1);
});

test('updater connection requests the batch once and saves its run ID without saving the token',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {batchConnection}=await import('../../scripts/batch-test-update/connection.mjs');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vecta-batch-connect-'));
 try{
  await fs.mkdir(path.join(directory,'gsf'));const file=path.join(directory,'gsf/batch-request.local.json');
  await fs.writeFile(file,JSON.stringify({endpoint:'https://brqsejjykrubxuofavuu.supabase.co/functions/v1/worker-batch-tests',launchKey:workerId}));
  let starts=0;const connection=batchConnection({dataDir:directory,token,fetcher:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer '+token);const body=JSON.parse(options.body);assert.equal(body.action,'start');assert.equal(body.count,100);starts++;return Response.json({status:'RUNNING',id:workerId});}});
  await Promise.all([connection.start(),connection.start()]);await connection.start();assert.equal(starts,1);
  const saved=await fs.readFile(file,'utf8');assert.equal(JSON.parse(saved).startedRun,workerId);assert.ok(!saved.includes(token));
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
