import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceRequest,serviceResult} from '../../lib/haynes-service.js';
import {browserServiceLookup} from '../../workers/haynes/service-browser.mjs';
const vehicle={registration:'HGZ7396',typeId:'t_318011818',make:'AUDI',model:'A4 (8W)',variant:'2.0 TDI',modelYears:'2016 - 2019'};
const labels=['Time/distance dependent service, (- 2018) (United Kingdom)','Longlife service, (- 2018) (United Kingdom)','Time/distance dependent service, (2019 -) (United Kingdom)','Longlife service, (2019 -) (United Kingdom)'];
const schedules=labels.map((label,i)=>({id:'ms_'+(10+i),label}));
const request={registration:'HGZ7396',mileage:50000,scheduleMode:'choose'};
test('catalogue survives relay validation without inventing parts or oil',()=>{
 const result=serviceResult({kind:'schedule_choices',vehicle,mileage:50000,period:'',schedules,cookies:'secret'},request);
 assert.deepEqual(result.schedules,schedules);assert.equal(result.parts,undefined);assert.equal(result.oil,undefined);assert.equal(result.cookies,undefined);
 assert.throws(()=>serviceResult(result,{...request,system:'ms_10'}));
 assert.throws(()=>serviceResult({...result,mileage:60000},request));
 assert.throws(()=>serviceResult({...result,vehicle:{...vehicle,registration:'CM14KEL'}},request));
 assert.throws(()=>serviceResult({...result,schedules:[schedules[0],schedules[0]]},request));
});
test('requested schedule is part of request identity and mismatched schedule data is rejected',()=>{
 const selected=serviceRequest({...request,system:'ms_11'});
 const raw={vehicle,mileage:50000,period:'mp_1',system:'ms_11',schedule:'50,000 miles/48 months',schedules,parts:['Oil filter']};
 assert.equal(serviceResult(raw,selected).system,'ms_11');
 assert.throws(()=>serviceResult({...raw,system:'ms_10'},selected));
 for(const system of ['invalid','ms_1&other=1'])assert.throws(()=>serviceRequest({...request,system}));
 assert.notDeepEqual(serviceRequest(request),selected);
});
test('worker discovers Audi schedule descriptions and returns choices without terminal prompts or opening a service',async()=>{
 let evaluations=0,selected=0,closed=0;
 const page={setDefaultTimeout(){},route:async()=>{},goto:async()=>{},waitForFunction:async()=>{},close:async()=>closed++,locator(){return {fill:async()=>{},click:async()=>{},nth(){return {}},selectOption:async()=>selected++}},evaluate:async fn=>{
  if(fn.name==='readVehicle'){evaluations++;return evaluations===1?{}:vehicle;}
  if(fn.name==='readDirectSchedules')return null;
  if(fn.name==='readScheduleSelectors')return [{index:0,options:schedules.map(s=>({value:s.id+',UK',label:s.label}))}];
  throw Error('Unexpected read: '+fn.name);
 }};
 const result=await browserServiceLookup({newPage:async()=>page},{chooseConditions:()=>{throw Error('No terminal prompt allowed')}})(request);
 assert.equal(result.kind,'schedule_choices');assert.deepEqual(result.schedules,schedules);assert.equal(selected,0);assert.equal(closed,1);
});

test('named Audi service types require a second explicit choice and remain system-specific',()=>{
 const periods=[{id:'mp_101',label:'Oil service (service indicator)'},{id:'mp_102',label:'Inspection service (service indicator)'},{id:'mp_103',label:'Oil service + Inspection service'}];
 const selected={...request,system:'ms_11'};
 const result=serviceResult({kind:'period_choices',vehicle,mileage:50000,period:'',system:'ms_11',conditions:labels[1],schedules,periods},selected);
 assert.deepEqual(result.periods,periods);assert.equal(result.parts,undefined);
 assert.throws(()=>serviceResult(result,{...selected,period:'mp_103'}));
 assert.throws(()=>serviceResult({...result,system:'ms_12'},selected));
});
