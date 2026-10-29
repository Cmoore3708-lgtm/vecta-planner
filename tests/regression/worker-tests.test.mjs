import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {selectCohort,cleanEvidence,cleanCompletion,testReport,compareReports,DIAGNOSTIC_BUILD} from '../../lib/worker-tests.js';
import {workerTestsHandler} from '../../api/worker-tests.js';
import {workerTestsWorkerHandler} from '../../api/worker-tests-worker.js';
import {diagnosticCase} from '../../workers/gsf/diagnostic-case.mjs';
import {createDiagnosticBridge} from '../../workers/gsf/diagnostic-bridge.mjs';
import {freshProduct} from '../../workers/gsf/live-service.mjs';
const id='12345678-1234-4234-8234-123456789abc',lease='12345678-1234-4234-8234-123456789abd';
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
const registrations=Array.from({length:120},(_,i)=>({registration:'AB'+String(i).padStart(2,'0')+'XYZ',make:i<110?'Ford':'Honda',fuel_type:i%2?'Diesel':'Petrol',year:'2016',customer_name:'never included'}));
const env={GSF_SERVICE_PRICING_ENABLED:'true',GSF_WORKER_TOKEN:'a'.repeat(64)};
test('100 genuine unique registrations, seed failures and rare makes; no contact fields',()=>{
 const cohort=selectCohort([...registrations,...registrations,{registration:'G4 WPC',make:'BMW'},{registration:'UNKNOWN'},{registration:'123456'},{registration:'ABCDE'}]);
 assert.equal(cohort.length,100);assert.equal(cohort[0].registration,'G4WPC');assert.equal(new Set(cohort.map(x=>x.registration)).size,100);assert.ok(cohort.some(x=>x.make==='Honda'));assert.ok(!JSON.stringify(cohort).includes('never included'));assert.throws(()=>selectCohort(registrations.slice(0,2)),e=>e.available===2);
});
test('CM14 KEL is first and its historical REVIEW_REQUIRED failure stays separate from new results',()=>{
 const cohort=selectCohort([...registrations,{registration:'CM14 KEL',make:'Nissan'},{registration:'G4WPC'}]);
 assert.equal(cohort[0].registration,'CM14KEL');assert.equal(cohort.length,100);assert.equal(cohort[0].baselineFailure.status,'REVIEW_REQUIRED');assert.equal(cohort[0].baselineFailure.causeConfirmed,false);
 const report=testReport({run:{status:'RUNNING',cohort},cases:[{registration:'CM14KEL',operation:'service',status:'PENDING'}]});
 assert.equal(report.baselineFailures[0].registration,'CM14KEL');assert.equal(report.counts.review,0);assert.equal(report.counts.remaining,1);assert.equal(report.complete,false);
});
test('evidence allowlist drops account fields and raw text, redacts VIN/email, preserves description differences',()=>{
 const evidence=cleanEvidence({stage:'PRODUCT_DETAILS',reason:'PRODUCT_DESCRIPTION_MISMATCH',expectedDescription:'Oil Filter',observedDescription:'Oil-filter',cookie:'secret',url:'https://account',visibleText:'private',headings:['x@example.com WBA12345678901234'],sku:'123'});
 assert.equal(evidence.expectedDescription,'Oil Filter');assert.equal(evidence.observedDescription,'Oil-filter');assert.ok(!JSON.stringify(evidence).match(/private|secret|https|example|WBA123/));
 assert.throws(()=>cleanCompletion({id,lease,outcome:'MATCHED'}));assert.equal(cleanCompletion({id,lease,outcome:'PAUSED',reason:'LOGIN_REQUIRED'}).outcome,'PAUSED');
});
test('manager authentication, CSRF and count limits guard all start requests',async()=>{
 let calls=0;const store=async()=>{calls++;throw Error('must not call');};
 let res=response();await workerTestsHandler({env,store,authenticate:async()=>false})({method:'POST'},res);assert.equal(calls,0);
 res=response();await workerTestsHandler({env,store,authenticate:async()=>true})({method:'POST',headers:{},body:{action:'start',launchKey:id}},res);assert.equal(res.code,403);
 res=response();await workerTestsHandler({env,store,authenticate:async()=>true})({method:'POST',headers:{'x-vecta-worker-tests':'1'},body:{action:'start',launchKey:id,count:200}},res);assert.equal(res.code,400);assert.equal(calls,0);
});
test('start checks capabilities before selecting vehicles; GET never enqueues',async()=>{
 const calls=[];const store=async action=>{calls.push(action);return {status:action==='preflight'?'WORKER_OFFLINE':'NO_RUN'};};const handler=workerTestsHandler({env,store,authenticate:async()=>true});
 let res=response();await handler({method:'POST',headers:{'x-vecta-worker-tests':'1'},body:{action:'start',launchKey:id,count:100}},res);assert.equal(res.body.status,'WORKER_OFFLINE');assert.deepEqual(calls,['preflight']);
 calls.length=0;res=response();await handler({method:'GET',query:{}},res);assert.deepEqual(calls,['status']);
});
test('start builds frozen cohort and duplicate active start reuses the run',async()=>{
 const calls=[];let active=false;
 const store=async(action,payload)=>{calls.push(action);if(action==='preflight')return {status:'READY',activeRun:active?id:null};if(action==='cohort')return {vehicles:registrations};assert.equal(payload.cohort.length,100);active=true;return {status:'RUNNING',id};};
 const handler=workerTestsHandler({env,store,authenticate:async()=>true}),req={method:'POST',headers:{'x-vecta-worker-tests':'1'},body:{action:'start',launchKey:id,count:100}};
 let res=response();await handler(req,res);assert.equal(res.body.id,id);res=response();await handler(req,res);assert.equal(res.body.status,'ACTIVE_RUN');assert.deepEqual(calls,['preflight','cohort','start','preflight']);
});
test('retest uses exact previous cohort without selecting a new sample',async()=>{
 const cohort=registrations.slice(0,2);let start;
 const handler=workerTestsHandler({env,authenticate:async()=>true,store:async(action,payload)=>{
  if(action==='preflight')return {status:'READY'};if(action==='status')return {run:{status:'COMPLETED',cohort}};if(action==='cohort')throw Error('must not resample');start=payload;return {status:'RUNNING',id};
 }});
 const res=response();await handler({method:'POST',headers:{'x-vecta-worker-tests':'1'},body:{action:'start',launchKey:lease,previousRun:id}},res);assert.deepEqual(start.cohort,cohort);assert.equal(start.previousRun,id);
});
test('worker token and capability version required; arbitrary account data never passed to store',async()=>{
 const calls=[];const handler=workerTestsWorkerHandler({env,store:async(action,payload)=>{calls.push({action,payload});return {status:'SAVED'};}});
 let res=response();await handler({method:'POST',headers:{},body:{action:'pull',workerId:id}},res);assert.equal(res.code,401);assert.equal(calls.length,0);
 const headers={authorization:'Bearer '+env.GSF_WORKER_TOKEN};res=response();await handler({method:'POST',headers,body:{action:'heartbeat',workerId:id,build:'old',ready:true}},res);assert.equal(res.code,400);
 res=response();await handler({method:'POST',headers,body:{action:'complete',id,lease,outcome:'REVIEW_REQUIRED',reason:'DESCRIPTION_MISMATCH',evidence:{cookie:'no',observedDescription:'New description'}}},res);assert.equal(res.body.status,'SAVED');assert.equal(calls[0].payload.evidence.cookie,undefined);
});
test('category failures retain stage and reason; unknown error messages do not leak',async()=>{
 const result=await diagnosticCase({}, {registration:'G4WPC',operation:'oil_filter'},{capture:async()=>{throw Object.assign(Error('REVIEW_REQUIRED'),{diagnosticReason:'PRODUCT_DESCRIPTION_MISMATCH',stage:'PRODUCT_DETAILS',evidence:{expectedDescription:'Old',observedDescription:'New',cookie:'no'}});}});
 assert.equal(result.reason,'PRODUCT_DESCRIPTION_MISMATCH');assert.equal(result.evidence.stage,'PRODUCT_DETAILS');assert.equal(result.evidence.observedDescription,'New');assert.ok(!JSON.stringify(result).includes('cookie'));
 const failure=await diagnosticCase({}, {registration:'G4WPC',operation:'oil_filter'},{capture:async()=>{throw Error('Bearer private secret');}});assert.ok(!JSON.stringify(failure).includes('secret'));
});
test('sign-in expiry pauses, and petrol fuel-filter is explicitly skipped',async()=>{
 const result=await diagnosticCase({}, {registration:'G4WPC',operation:'oil_filter'},{capture:async()=>{throw Error('LOGIN_REQUIRED');}});assert.equal(result.outcome,'PAUSED');assert.equal(result.reason,'LOGIN_REQUIRED');
 const skipped=await diagnosticCase({}, {registration:'G4WPC',operation:'fuel_filter',fuelType:'Petrol'},{capture:async()=>{throw Error('must not browse');}});assert.equal(skipped.outcome,'SKIPPED');
});
test('product description mismatch records both descriptions without broadening matching',async()=>{
 const page={goto:async()=>{},url:()=> 'https://trade.gsfcarparts.com/partdetails/123',evaluate:async()=>({description:'Different filter',sku:'123',unitNetPence:1000})};
 await assert.rejects(freshProduct(page,{description:'Expected filter',searchTerm:'123',expectedPricePence:1000}),e=>e.message==='REVIEW_REQUIRED'&&e.diagnosticReason==='PRODUCT_DESCRIPTION_MISMATCH'&&e.evidence.observedDescription==='Different filter');
});
test('report groups shared failures and does not count pending vehicles or untested workers as passed',()=>{
 const report=testReport({run:{status:'PAUSED'},cases:[{id:'1',registration:'G4WPC',operation:'oil',status:'FAILED',reason:'X',evidence:{stage:'READ'}},{id:'2',registration:'FV65JTY',operation:'oil',status:'FAILED',reason:'X',evidence:{stage:'READ'}},{registration:'G4WPC',operation:'service',status:'PENDING'}]});
 assert.equal(report.complete,false);assert.equal(report.groups.length,1);assert.equal(report.groups[0].registrations.length,2);assert.equal(report.registrationsCompleted,1);assert.equal(report.coverage.haynes,'NOT_TESTED');
 const previous={cases:[{registration:'FV65JTY',operation:'oil',status:'PASSED'}]};assert.equal(compareReports(report,previous)[0].regression,true);
});
test('failed delivery persists receipt; process restart delivers it without repeating supplier lookup',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'vecta-diag-')),outboxPath=path.join(dir,'outbox.local.json');let lookups=0,closed=0,failDelivery=true;
 const rpc=async body=>{
  if(body.action==='heartbeat'){assert.equal(body.build,DIAGNOSTIC_BUILD);return {status:'READY'};}
  if(body.action==='pull')return {status:'JOB',id,lease,request:{registration:'G4WPC',operation:'oil'}};
  if(failDelivery)throw Error('OFFLINE');return {status:'SAVED'};
 };
 const options={outboxPath,origin:'https://vecta-planner.vercel.app',context:{newPage:async()=>({close:async()=>{closed++;}})},token:env.GSF_WORKER_TOKEN,ready:true,rpc,lookup:async()=>{lookups++;return {outcome:'PASSED',reason:'SUPPLIER_CHECKS_PASSED',evidence:{stage:'PRODUCT_DETAILS'}};}};
 try{
  await assert.rejects(createDiagnosticBridge(options).tick(),/OFFLINE/);assert.equal(lookups,1);assert.equal(closed,1);assert.ok(existsSync(outboxPath));assert.equal(JSON.parse(readFileSync(outboxPath)).id,id);
  failDelivery=false;assert.equal(await createDiagnosticBridge(options).tick(),'DELIVERED');assert.equal(lookups,1);assert.ok(!existsSync(outboxPath));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('hung supplier read closes its page, records bounded timeout and allows next case',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'vecta-diag-'));let closed=0,saved;
 try{
 const bridge=createDiagnosticBridge({outboxPath:path.join(dir,'pending'),ready:true,timeoutMs:5,context:{newPage:async()=>({close:async()=>{closed++;}})},lookup:async()=>new Promise(()=>{}),rpc:async body=>body.action==='heartbeat'?{status:'READY'}:body.action==='pull'?{status:'JOB',id,lease,request:{}}:(saved=body,{status:'SAVED'})});
 assert.equal(await bridge.tick(),'FAILED');assert.equal(saved.reason,'LOOKUP_TIMEOUT');assert.equal(closed,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
