import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(error,online=true,cloudResult=true){
 const writes=[];let cloudCalls=0;
 const c={fleetVehicles:[{contactEmail:'updated@example.com'}],fleetPlans:[],fleetCompletions:[],fleetCustomerProfiles:{},remoteClient:online?{}:null,console:{warn(){}},localStorage:{setItem(k,v){writes.push(k);if(error)throw error}},vectaIsQuotaError:e=>e.name==='QuotaExceededError',persistFleetMotAuthority(){},persistFleetCloudSnapshot(){cloudCalls++;return Promise.resolve(cloudResult)}};
 for(const name of ['fleetApplyMaintenanceTombstones','fleetEnsureServicePlanTypes','fleetAlignServiceDatesToMot','fleetAssignPoolEmail','fleetRepairEmailAssignments','fleetApplyDeletionTombstones','fleetApplyMotAuthority'])c[name]=()=>{};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('function fleetWriteLocal('),html.indexOf('function fleetDate(',html.indexOf('function fleetWriteLocal('))),c);
 return {c,writes,cloudCalls:()=>cloudCalls};
}
test('full browser storage still reaches cloud persistence and preserves email',async()=>{
 const s=setup({name:'QuotaExceededError'});assert.equal(await s.c.saveFleet(),true);assert.equal(s.cloudCalls(),1);assert.equal(s.writes.length,4);assert.equal(s.c.fleetVehicles[0].contactEmail,'updated@example.com');
});
test('quota plus offline or failed cloud does not report successful save',async()=>{
 assert.equal(await setup({name:'QuotaExceededError'},false).c.saveFleet(),false);
 assert.equal(await setup({name:'QuotaExceededError'},true,false).c.saveFleet(),false);
});
test('normal offline storage succeeds and unexpected storage errors surface',async()=>{
 assert.equal(await setup(null,false).c.saveFleet(),true);
 assert.throws(()=>setup(new Error('storage blocked')).c.saveFleet(),/storage blocked/);
});
test('vehicle form awaits fleet save and checks failure before closing',()=>{
 assert.match(html,/if\(!await saveFleet\(\)\)throw new Error\('Fleet details could not be saved/);
});
