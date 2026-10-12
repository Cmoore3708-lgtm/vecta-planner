import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validReg} from '../../lib/haynes-vehicle.js';
const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8').split('/* Dashboard registration lookup:')[0];
const vehicle={registration:'AB12XYZ',make:'Toyota',model:'Yaris',variant:'1.0',typeId:'t_123',imageUrl:'',fetchedAt:new Date().toISOString()};
test('placeholders never reach Haynes, including after reopening or manual refresh',async()=>{
 const storage=new Map();let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({status:'MATCHED',vehicle})};};
 for(let reopen=0;reopen<3;reopen++){
  const tools=setup(storage,fetcher);
  for(const value of ['Van','Car','Unknown','TBC','Unknown1','No Reg','1234']){
   assert.equal(validReg(value.toUpperCase().replace(/[^A-Z0-9]/g,'')),false);
   assert.equal(await tools.lookup(value,undefined,{background:true}),null);
   assert.equal(await tools.lookup(value,undefined,{force:true}),null);
  }
 }
 assert.equal(calls,0);
 assert.equal(validReg('A1'),true);assert.equal(validReg('VAN1'),true);assert.equal(validReg('TBC1'),true);assert.equal(validReg('123ABC'),true);
 assert.equal((await setup(storage,fetcher).lookup('AB12 XYZ')).model,'Yaris');
 assert.equal(calls,1);
});
test('an uncertain match remains blocked in the background until explicitly refreshed',async()=>{
 const storage=new Map([['vecta_haynes_vehicle_retries_v1',JSON.stringify([{registration:vehicle.registration,at:Date.now()-7*86400000,status:'AMBIGUOUS'}])]]);
 let calls=0;const fetcher=async()=>{calls++;return {ok:true,json:async()=>({status:'MATCHED',vehicle})};};
 for(let reopen=0;reopen<3;reopen++)assert.equal(await setup(storage,fetcher).lookup(vehicle.registration,undefined,{background:true}),null);
 assert.equal(calls,0);
 await setup(storage,fetcher).lookup(vehicle.registration,undefined,{force:true});
 assert.equal(calls,1);
 assert.equal((await setup(storage,fetcher).lookup(vehicle.registration)).model,'Yaris');
 assert.equal(calls,1);
});
function setup(storage,fetcher){
 const window={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},navigator:{onLine:true},fetch:fetcher};
 const document={addEventListener(){}};
 vm.runInNewContext(source,{window,document,AbortController,AbortSignal,setTimeout,clearTimeout,encodeURIComponent});
 return window.VectaHaynesJobTools;
}
test('image-less matches survive repeated lookups and reopening without another worker request',async()=>{
 const storage=new Map();let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({status:'MATCHED',vehicle})};};
 for(let reopen=0;reopen<3;reopen++){
  const tools=setup(storage,fetcher);
  await tools.lookup('AB12 XYZ','Toyota',{requireImage:true,background:true});
  await tools.lookup('AB12XYZ','Toyota',{requireImage:true,background:true});
 }
 assert.equal(calls,1);
});
test('legacy expired identity is reused while the technical snapshot stays expired',async()=>{
 const old={...vehicle,fetchedAt:'2020-01-01T00:00:00Z'};
 const storage=new Map([['vecta_haynes_vehicle_snapshots_v1',JSON.stringify([old])]]);
 let calls=0;const tools=setup(storage,async()=>{calls++;throw Error('unexpected lookup');});
 assert.equal(tools.snapshot(vehicle.registration),null);
 assert.equal((await tools.lookup(vehicle.registration,'Toyota')).model,'Yaris');
 assert.equal(calls,0);
});
test('background failure cooldown survives reopening and explicit refresh bypasses it',async()=>{
 const storage=new Map();let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({status:'OFFLINE'})};};
 await setup(storage,fetcher).lookup(vehicle.registration,'Toyota',{background:true});
 const tools=setup(storage,fetcher);
 await tools.lookup(vehicle.registration,'Toyota',{background:true});
 assert.equal(calls,1);
 await tools.lookup(vehicle.registration,'Toyota',{force:true});
 assert.equal(calls,2);
});
test('explicit refresh replaces saved identity and conflicting makes never reuse it',async()=>{
 const storage=new Map();let calls=0;
 const tools=setup(storage,async()=>{calls++;return {ok:true,json:async()=>({status:'MATCHED',vehicle:{...vehicle,model:calls===1?'Yaris':'Corolla'}})};});
 await tools.lookup(vehicle.registration,'Toyota');
 assert.equal((await tools.lookup(vehicle.registration,'Toyota',{force:true})).model,'Corolla');
 assert.equal(await tools.lookup(vehicle.registration,'Ford'),null);
 assert.equal(calls,3);
});
