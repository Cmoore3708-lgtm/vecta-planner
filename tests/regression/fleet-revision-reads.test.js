import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../public/js/vecta-fleet-concurrency.js';
const {save}=globalThis.VectaFleetConcurrency;
const baseline=()=>({vehicles:[{id:'v1',email:'old',model:'Original'}],plans:[{id:'p1',due:'2026-10-01'}],updated_at:'inner-stamp'});
function database(initial,{race,error}={}){
 let row=structuredClone(initial),writes=0;const reads=[];
 return {get row(){return row;},get writes(){return writes;},reads,from(){let mode='read',body,stamp,selection;
  const q={select(value){selection=value;return q;},eq(k,v){if(k==='updated_at')stamp=v;return q;},is(k,v){stamp=v;return q;},update(value){mode='write';body=value;return q;},insert(value){mode='write';body=value;return q;},async maybeSingle(){reads.push(selection);if(error)return {error};return {data:row?(selection.includes('value')?structuredClone(row):{id:row.id,updated_at:row.updated_at}):null};},then(resolve,reject){return (async()=>{writes++;if(race&&writes===1){row=race(row);return {data:[]};}if(mode!=='write')throw Error('Unexpected write');if(row&&row.updated_at!==stamp)return {data:[]};row={...body,id:'fleet',updated_at:'revision-'+writes};return {data:[structuredClone(row)]};})().then(resolve,reject);}};return q;
 }};
}
test('unchanged cloud revision avoids downloading the fleet before the conditional write',async()=>{
 const base=baseline(),desired=structuredClone(base);desired.vehicles[0].email='new';const db=database({id:'fleet',value:base,updated_at:'rev-0'});
 const result=await save(db,{id:'fleet',base,desired,baseRevision:'rev-0'});assert.deepEqual(db.reads,['id,updated_at']);assert.equal(result.value.vehicles[0].email,'new');assert.equal(base.vehicles[0].email,'old');
});
test('another device revision downloads the full row and merges independent edits',async()=>{
 const base=baseline(),desired=structuredClone(base),remote=structuredClone(base);desired.vehicles[0].email='new';remote.plans[0].due='2027-01-01';
 const db=database({id:'fleet',value:remote,updated_at:'rev-1'});const result=await save(db,{id:'fleet',base,desired,baseRevision:'rev-0'});
 assert.deepEqual(db.reads,['id,updated_at','id,value,updated_at']);assert.equal(result.value.plans[0].due,'2027-01-01');assert.equal(result.value.vehicles[0].email,'new');
});
test('a race after the lightweight revision read retries with complete merge protection',async()=>{
 const base=baseline(),desired=structuredClone(base);desired.vehicles[0].email='new';
 const db=database({id:'fleet',value:base,updated_at:'rev-0'},{race:row=>({...row,value:{...row.value,plans:[{id:'p1',due:'2027-01-01'}]},updated_at:'rev-1'})});
 const result=await save(db,{id:'fleet',base,desired,baseRevision:'rev-0'});assert.equal(db.writes,2);assert.equal(result.value.plans[0].due,'2027-01-01');assert.equal(result.value.vehicles[0].email,'new');assert.ok(db.reads.includes('id,value,updated_at'));
});
test('same-field conflict after a different revision refuses to write',async()=>{
 const base=baseline(),desired=structuredClone(base),remote=structuredClone(base);desired.vehicles[0].email='pc';remote.vehicles[0].email='ipad';
 const db=database({id:'fleet',value:remote,updated_at:'rev-1'});await assert.rejects(save(db,{id:'fleet',base,desired,baseRevision:'rev-0'}),{code:'FLEET_CONFLICT'});assert.equal(db.writes,0);
});
test('old offline baselines keep the full-read path, and metadata failures cannot write',async()=>{
 const base=baseline(),desired=structuredClone(base),db=database({id:'fleet',value:base,updated_at:'rev-0'});await save(db,{id:'fleet',base,desired});assert.deepEqual(db.reads,['id,value,updated_at']);
 const failed=database(null,{error:Error('offline')});await assert.rejects(save(failed,{id:'fleet',base,desired,baseRevision:'rev-0'}),/offline/);assert.equal(failed.writes,0);
});
test('confirmed fleet baseline and database revision are stored together atomically',()=>{
 const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('function fleetRememberCloudBase('),end=html.indexOf('\ntry{',start),writes=[];
 const c={window:globalThis,fleetCloudBase:null,fleetCloudBaseRevision:null,localStorage:{setItem:(key,value)=>writes.push({key,value})}};
 vm.runInNewContext(html.slice(start,end),c);c.fleetRememberCloudBase(baseline(),'database-revision');assert.equal(writes.length,1);const stored=JSON.parse(writes[0].value);assert.equal(stored.revision,'database-revision');assert.deepEqual(stored.value,baseline());
 c.localStorage.setItem=()=>{throw Error('quota');};assert.doesNotThrow(()=>c.fleetRememberCloudBase(baseline(),'next-revision'));assert.equal(c.fleetCloudBaseRevision,'next-revision');
});
test('offline startup restores a matched baseline/revision pair and falls back safely to old baselines',()=>{
 const html=fs.readFileSync('index.html','utf8'),start=html.indexOf("var fleetCloudLastPersistedPayload="),end=html.indexOf('function persistFleetCloudSnapshot()',start),code=html.slice(start,end);
 for(const [v2,revision] of [[JSON.stringify({value:baseline(),revision:'paired-revision'}),'paired-revision'],['corrupt JSON',null],[JSON.stringify({value:[]}),null],[null,null]]){
  const c={window:globalThis,localStorage:{getItem:key=>key.endsWith(':v2')?v2:JSON.stringify(baseline())}};vm.runInNewContext(code,c);assert.deepEqual(JSON.parse(JSON.stringify(c.fleetCloudBase)),baseline());assert.equal(c.fleetCloudBaseRevision,revision);
 }
});
