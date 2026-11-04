import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../public/js/vecta-fleet-concurrency.js';
const api=globalThis.VectaFleetConcurrency;
const clone=structuredClone;
const baseline=()=>({version:330,vehicles:[{id:'v1',registration:'YC65HHB',contactEmail:'old@example.test'}],plans:[{id:'plan-104',vehicleId:'v1',type:'Annual Service',currentDueDate:'2026-09-01',notes:'original'}],completions:[],customers:{},emailSent:{},deletedRegistrations:[],removedMaintenance:{},updated_at:'old'});
function storage(){const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),map};}
test('plan-104 deletion versus edit recovers cloud plan and preserves the phone deletion for review',()=>{
 const base=baseline(),local=clone(base),remote=clone(base),store=storage();
 local.plans=[];local.vehicles[0].contactEmail='phone@example.test';remote.plans[0].currentDueDate='2027-09-01';
 const result=api.recover(base,local,remote,store);
 assert.deepEqual(result.plans,remote.plans);assert.equal(result.vehicles[0].contactEmail,'phone@example.test');
 const [entry]=api.reviews(store);assert.equal(entry.path,'fleet.plans.plan-104');assert.equal(entry.local,undefined);assert.deepEqual(entry.base,base.plans[0]);assert.deepEqual(entry.remote,remote.plans[0]);assert.match(entry.label,/YC65HHB/);
 assert.equal(local.plans.length,0);assert.equal(base.plans[0].currentDueDate,'2026-09-01');
 api.recover(base,local,remote,store);assert.equal(api.reviews(store).length,1,'same conflict is not archived repeatedly');
});
test('remote deletion stays deleted; edited local plan survives in review copy',()=>{
 const base=baseline(),local=clone(base),remote=clone(base),store=storage();
 local.plans[0].currentDueDate='2027-10-01';remote.plans=[];
 assert.deepEqual(api.recover(base,local,remote,store).plans,[]);
 const entry=api.reviews(store)[0];assert.deepEqual(entry.local,local.plans[0]);assert.equal(entry.remote,undefined);
});
test('multiple field conflicts are archived while unrelated changes on both devices survive',()=>{
 const base=baseline(),local=clone(base),remote=clone(base),store=storage();
 local.vehicles[0].contactEmail='phone@example.test';remote.vehicles[0].contactEmail='pc@example.test';
 local.plans[0].currentDueDate='2027-10-01';remote.plans[0].currentDueDate='2027-11-01';
 local.completions.push({id:'completion',vehicleId:'v1',completedDate:'2026-10-01'});
 remote.vehicles.push({id:'v2',registration:'AB12CDE'});
 const result=api.recover(base,local,remote,store);
 assert.equal(api.reviews(store).length,2);assert.equal(result.plans[0].currentDueDate,'2027-11-01');
 assert.equal(result.vehicles[0].contactEmail,'pc@example.test');assert.equal(result.vehicles.length,2);assert.deepEqual(result.completions,local.completions);
 assert.throws(()=>api.merge(base,local,remote),{code:'FLEET_CONFLICT'},'strict cloud write protection is unchanged');
});
test('full or unreadable storage cannot discard a conflict or replace its previous review archive',()=>{
 const base=baseline(),local=clone(base),remote=clone(base);local.plans=[];remote.plans[0].currentDueDate='2027-09-01';
 const store=storage();store.setItem=()=>{throw Error('quota');};assert.throws(()=>api.recover(base,local,remote,store),/quota/);assert.equal(local.plans.length,0);
 const corrupt=storage();corrupt.setItem('vecta:fleet:conflict-review:v1','broken');assert.throws(()=>api.recover(base,local,remote,corrupt));assert.equal(corrupt.getItem('vecta:fleet:conflict-review:v1'),'broken');
});
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function phone(store,local,remote){
 const start=html.indexOf('var fleetCloudLastPersistedPayload='),end=html.indexOf('function fleetWriteLocal(',start);
 let current=clone(local),cloud=clone(remote),offline=false,writes=0;
 const c={window:globalThis,localStorage:store,console:{warn(){}},fleetCloudStateId:'fleet_state_v77',FLEET_MOT_AUTHORITY_CLOUD_ID:'authority',fleetMotAuthority:{},fleetAutoRefreshStatus:null,alert(){throw Error('Startup must not show a blocking alert');},fleetSnapshot:()=>clone(current),vectaSettingsSignature:JSON.stringify,fleetApplyMotAuthority:()=>{},fleetRepairEmailAssignments:()=>false,
 remoteClient:{from(){return {select(){return this;},async in(){return offline?{error:Error('offline')}:{data:[{id:'fleet_state_v77',value:clone(cloud),updated_at:'revision-1'}]};}}}}};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);
 c.applyFleetCloudSnapshot=value=>{current=clone(value);store.setItem('test-current',JSON.stringify(current));};
 c.persistFleetCloudSnapshot=async()=>{writes++;cloud=clone(current);c.fleetRememberCloudBase(cloud,'revision-2');c.fleetCloudLastPersistedPayload=JSON.stringify(c.fleetCloudPersistenceValue(cloud));return true;};
 return {c,get current(){return current;},get cloud(){return cloud;},get writes(){return writes;},set offline(v){offline=v;}};
}
test('upgrade from old phone baseline: cold start, second reopen, offline view and reconnect have no repeated conflict',async()=>{
 const base=baseline(),local=clone(base),remote=clone(base),store=storage();local.plans=[];remote.plans[0].currentDueDate='2027-09-01';
 store.setItem('vecta:fleet:confirmed-base:v2',JSON.stringify({value:base,revision:'revision-0'}));
 const first=phone(store,local,remote);assert.equal(await first.c.pullFleetCloudState(),true);assert.equal(first.c.fleetCloudConflict,false);assert.equal(first.writes,0,'conflicted phone deletion cannot overwrite cloud');assert.equal(api.reviews(store).length,1);
 const reopened=phone(store,JSON.parse(store.getItem('test-current')),remote);assert.equal(await reopened.c.pullFleetCloudState(),true);assert.equal(reopened.writes,0);assert.equal(api.reviews(store).length,1);
 reopened.offline=true;assert.equal(await reopened.c.pullFleetCloudState(),false);assert.equal(reopened.current.plans[0].currentDueDate,'2027-09-01');
 reopened.offline=false;assert.equal(await reopened.c.pullFleetCloudState(),true);assert.equal(reopened.c.fleetCloudConflict,false,'old conflict latch cannot prevent reconnection');
});
test('startup keeps original baseline and local work when review backup fails, then retries successfully',async()=>{
 const base=baseline(),local=clone(base),remote=clone(base),store=storage();local.plans=[];remote.plans[0].currentDueDate='2027-09-01';
 store.setItem('vecta:fleet:confirmed-base:v2',JSON.stringify({value:base,revision:'revision-0'}));const write=store.setItem;store.setItem=()=>{throw Error('quota');};
 const p=phone(store,local,remote);assert.equal(await p.c.pullFleetCloudState(),false);assert.deepEqual(p.current,local);assert.equal(p.c.fleetCloudBaseRevision,'revision-0');assert.equal(p.writes,0);
 store.setItem=write;assert.equal(await p.c.pullFleetCloudState(),true);assert.equal(api.reviews(store).length,1);
});
test('review panel escapes saved text and offers export without blocking startup',()=>{
 const store=storage(),base=baseline(),local=clone(base),remote=clone(base);local.vehicles[0].contactEmail='<script>phone</script>';remote.vehicles[0].contactEmail='pc';api.recover(base,local,remote,store);
 const c={window:globalThis,localStorage:store,fleetCloudConflict:false,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')};
 vm.runInNewContext(html.slice(html.indexOf('function fleetConflictReviewHtml('),html.indexOf('function fleetAutoRefreshBanner(')),c);
 const panel=c.fleetConflictReviewHtml();assert.match(panel,/Review saved fleet changes \(1\)/);assert.match(panel,/fleetDownloadSavedChanges/);assert.match(panel,/&lt;script&gt;/);assert.doesNotMatch(panel,/<script>/);
});
