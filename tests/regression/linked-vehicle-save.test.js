import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('async function vectaSaveLinkedVehicle('),html.indexOf('async function syncSavedJobBundleInBackground('));
function setup(results, failure){
  const writes=[];
  const context={app:{vehicles:[{id:'local',registration:'AB12 CDE'}]},navigator:{onLine:true},
    normReg:s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''),
    remoteClient:{from(){return {select(){return this},ilike(){return Promise.resolve(results.shift())}}}},
    async upsertRemote(table,row){writes.push({...row});if(failure){const e=failure;failure=null;throw e}return [row]}
  };
  vm.runInNewContext(source,context);return {context,writes};
}
test('repeat registration reuses the cloud vehicle even when the local list is stale',async()=>{
  const {context,writes}=setup([{data:[{id:'cloud',registration:'AB12CDE',created_at:'old'}]}]);
  const job={},linked={vehicle:{id:'local',registration:'AB12 CDE',vehicle:'Updated model',customer_id:'customer'}};
  await context.vectaSaveLinkedVehicle(job,linked);
  assert.equal(job.vehicle_id,'cloud');assert.equal(writes[0].id,'cloud');assert.equal(writes[0].created_at,'old');
  assert.equal(context.app.vehicles.length,1);assert.equal(context.app.vehicles[0].id,'cloud');
});
test('concurrent vehicle creation is retried with the winning vehicle identity',async()=>{
  const {context,writes}=setup([{data:[]},{data:[{id:'winner',registration:'AB12 CDE'}]}],{code:'23505',message:'vehicles_registration_key'});
  const job={},linked={vehicle:{id:'local',registration:'AB12CDE'}};
  await context.vectaSaveLinkedVehicle(job,linked);
  assert.equal(writes.length,2);assert.equal(writes[1].id,'winner');assert.equal(job.vehicle_id,'winner');
});
test('vehicle lookup failure blocks the save instead of inventing another identity',async()=>{
  const {context,writes}=setup([{error:{message:'connection failed'}}]);
  await assert.rejects(context.vectaSaveLinkedVehicle({}, {vehicle:{id:'local',registration:'AB12CDE'}}),e=>e.message==='connection failed');
  assert.equal(writes.length,0);
});
