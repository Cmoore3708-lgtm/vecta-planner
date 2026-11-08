import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedVehicleLookup} from '../../lib/vehicle-lookup-fallback.js';
const config=()=>({url:'https://test.example',key:'test-secret'});
test('saved vehicle is returned with only public characteristics',async()=>{
 let called='';
 const result=await cachedVehicleLookup('CM14KEL',{config,request:async(url,options)=>{
  called=url;
  assert.equal(options.headers.apikey,'test-secret');
  return {ok:true,json:async()=>[{registration:'CM14KEL',make:'Nissan',model:'Qashqai',vehicle:'Nissan Qashqai',fuel_type:'PETROL',engine_size:'1197',colour:'BLACK',updated_at:'2026-11-08T00:00:00Z',notes:'private',customer_id:'private'}]};
 }});
 assert.match(called,/registration=eq.CM14KEL/);
 assert.equal(result.vehicle,'Nissan Qashqai');
 assert.equal(result.lookupSource,'saved_vehicle');
 assert.equal(result.lookupPartial,true);
 assert.equal('notes' in result,false);
 assert.equal('customer_id' in result,false);
});
test('empty saved vehicle does not masquerade as successful lookup',async()=>{
 const result=await cachedVehicleLookup('UNKNOWN',{config,request:async()=>({ok:true,json:async()=>[]})});
 assert.equal(result,null);
});
test('cache service errors preserve manual-entry fallback',async()=>{
 const result=await cachedVehicleLookup('CM14KEL',{config,request:async()=>{throw Error('offline')}});
 assert.equal(result,null);
});
