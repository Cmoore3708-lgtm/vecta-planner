import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createBrowserRecovery } from '../../workers/haynes/browser-recovery.mjs';
import { pullServiceTask, pollServiceQueue } from '../../workers/haynes/relay-poll.mjs';
import { createServiceTaskRunner } from '../../workers/haynes/service-task.mjs';
import { createLookupService } from '../../workers/haynes/service.mjs';
import { readDirectSchedules } from '../../workers/haynes/service-dom.mjs';
import { selectServicePeriod } from '../../lib/haynes-service.js';
import { HaynesError } from '../../lib/haynes-vehicle.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function mockBrowser() {
  const pages=[];
  let closes=0;
  return {pages,get closes(){return closes;},on(){},async close(){closes++;},async newPage(){const page={closed:0,async close(){this.closed++;}};pages.push(page);return page;}};
}
test('stalled service releases its task and vehicle lookups continue on their own page',async()=>{
  const context=mockBrowser(),browser=createBrowserRecovery(async()=>context,{cleanupMs:20});
  const started=deferred(),vehicleFinish=deferred();
  const vehicle=browser.run(c=>async()=>{const p=await c.newPage();started.resolve(p);await vehicleFinish.promise;assert.equal(p.closed,0);return 'matched';},{},200);
  const page=await started.promise;
  const results=[];
  const tasks=createServiceTaskRunner(request=>browser.run(c=>async()=>{await c.newPage();return new Promise(()=>{});},request,10),async result=>results.push(result));
  tasks.start({id:'service',lease:'lease',request:{}});
  await tasks.done;
  assert.equal(tasks.busy,false);assert.equal(results[0].status,'UNAVAILABLE');
  assert.equal(page.closed,0);assert.equal(context.pages[1].closed,1);
  vehicleFinish.resolve();assert.equal(await vehicle,'matched');
  assert.equal(await browser.run(()=>async()=> 'next vehicle',{},100),'next vehicle');
  assert.equal(context.closes,0);await browser.close();
});
test('three browser failures restart once, retain the supplied profile opener and do not replay work',async()=>{
  let opens=0,calls=0,recoveries=0;const contexts=[];
  const browser=createBrowserRecovery(async()=>{opens++;const c=mockBrowser();contexts.push(c);return c;},{cleanupMs:20,onRecovery:()=>recoveries++});
  for(let n=0;n<3;n++)await assert.rejects(browser.run(()=>async()=>{calls++;throw Error('browser protocol failed');},{},100),{reason:'BROWSER_ERROR'});
  assert.equal(calls,3);assert.equal(opens,1);
  assert.equal(await browser.run(()=>async()=> 'ok',{},100),'ok');
  assert.equal(opens,2);assert.equal(contexts[0].closes,1);assert.equal(recoveries,1);await browser.close();
});
test('uncertain vehicle match does not trigger a browser reset',async()=>{
  let opens=0;const browser=createBrowserRecovery(async()=>{opens++;return mockBrowser();});
  for(let n=0;n<4;n++)await assert.rejects(browser.run(()=>async()=>{throw new HaynesError('MISMATCH');},{},100),{code:'MISMATCH'});
  assert.equal(await browser.run(()=>async()=> 'ok',{},100),'ok');assert.equal(opens,1);await browser.close();
});
test('a service relay outage allows the vehicle queue to be polled, pairing errors stop processing',async()=>{
  const actions=[];const rpc=async(_,service)=>{actions.push(service?'service':'vehicle');if(service)throw Error('CONNECTION_UNAVAILABLE');return {status:'JOB'};};
  await pullServiceTask(rpc,{busy:false,start(){assert.fail();}});
  assert.equal((await rpc({action:'pull'})).status,'JOB');assert.deepEqual(actions,['service','vehicle']);
  await assert.rejects(pullServiceTask(async()=>{throw Error('PAIRING_REQUIRED');},{busy:false}),/PAIRING_REQUIRED/);
});
test('transient failures expire after 15 seconds and do not block a different registration',async()=>{
  let now=0,calls=0;const raw={make:'NISSAN',model:'Qashqai',variant:'1.7 dCi',typeId:'t_123'};
  const lookup=createLookupService(async registration=>{calls++;if(calls===1){const e=new HaynesError('UNAVAILABLE');e.reason='TIMEOUT';throw e;}return {...raw,registration};},{now:()=>now});
  await assert.rejects(lookup('AB12CDE'));assert.equal((await lookup('FX69XWU')).registration,'FX69XWU');
  await assert.rejects(lookup('AB12CDE'));assert.equal(calls,2);now=15001;
  assert.equal((await lookup('AB12CDE')).registration,'AB12CDE');assert.equal(calls,3);
});
test('booking preserves offline and busy reasons, shows useful messages and can retry',async()=>{
  const root={fetch(){},AbortController,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-haynes-booking.js',import.meta.url),'utf8'),root);
  let status='OFFLINE',last;const controller=root.VectaHaynesBooking.createController({getRegistration:()=> 'AB12CDE',getMake:()=> 'NISSAN',onChange:v=>last=v,fetcher:async()=>({ok:true,json:async()=>({status,vehicle:{registration:'AB12CDE',make:'NISSAN',model:'Qashqai',variant:'1.7 dCi'}})})});
  await controller.lookup('AB12CDE');assert.equal(last.reason,'OFFLINE');assert.match(root.VectaHaynesBooking.unavailableMessage(last.reason),/temporarily offline/);
  status='BUSY';await controller.lookup('AB12CDE');assert.equal(last.reason,'BUSY');assert.match(root.VectaHaynesBooking.unavailableMessage(last.reason),/busy/);
  status='MATCHED';await controller.lookup('AB12CDE');assert.equal(last.status,'matched');
  assert.match(root.VectaHaynesBooking.unavailableMessage('TIMEOUT'),/took too long/);
});

// Reduced fixture reproduces the supplier's UK select and exact period IDs.
test('direct UK period menu selects mileage and strips OEM labels without guessing a system',()=>{
 const options=[{value:'select',textContent:'Select Maintenance system (United Kingdom)'},{value:'mp_319004233',textContent:'63,000 miles/72 months (OEM: 10.12.63)'},{value:'mp_319004200',textContent:'84,000 miles/96 months (OEM: 10.12.84)'}];
 const select={options,getAttribute:()=>"gotoMaintenance(this, '/touch/site/layout/maintenanceSchedule?typeId=t_317000108&maintenanceSystemId=ms_319000243', false, false);"};
 const document={querySelectorAll:()=>[select]},location={href:'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_317000108'};
 const run=()=>vm.runInNewContext('('+readDirectSchedules.toString()+')()',{document,location,URL});
 const direct=run();assert.equal(direct.system,'ms_319000243');
 const picked=selectServicePeriod(direct.links,{mileage:75000,system:direct.system,typeId:direct.typeId});
 assert.equal(new URL(picked.href).searchParams.get('maintenancePeriodId'),'mp_319004200');assert.equal(picked.label,'84,000 miles/96 months');
 options[0].textContent='Select Maintenance system (France)';assert.equal(run(),null);
});

test('an unresponsive service poll does not hold up the independently polled vehicle queue',async()=>{
 let stopped=false;const gate=deferred(),actions=[];
 const rpc=async(_,service)=>{actions.push(service?'service':'vehicle');if(service){await gate.promise;return {status:'IDLE'};}return {status:'JOB'};};
 const polling=pollServiceQueue(rpc,{busy:false},{isStopped:()=>stopped,stop:()=>{stopped=true;},wait:async()=>{stopped=true;}});
 assert.equal((await rpc({action:'pull'})).status,'JOB');assert.deepEqual(actions,['service','vehicle']);
 gate.resolve();await polling;
});
