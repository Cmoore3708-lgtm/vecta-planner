import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserServiceLookup} from '../../workers/haynes/service-browser.mjs';
import {serviceResult} from '../../lib/haynes-service.js';
const request={registration:'AB12CDE',purpose:'lubricants',mileage:1,menuFlow:'guided'};
const vehicle={registration:request.registration,typeId:'t_12',make:'Test',model:'Example',variant:'Petrol'};
const oil=[{specification:'SAE 5W-30 · ACEA C3',capacity:'4 L',applicability:'Engine'}];
test('oil-only worker visits matched vehicle lubricants without touching a schedule',async()=>{
 let url='';const urls=[];
 const control={fill(){},click(){},first(){return this;},waitFor(){}};
 const page={setDefaultTimeout(){},route(){},goto(next){url=next;urls.push(next);},url:()=>url,
  locator:()=>control,close:async()=>{},evaluate(fn){if(fn.name==='readVehicle')return vehicle;if(fn.name==='readOil')return oil;throw Error('Unexpected page control '+fn.name);}};
 const result=await browserServiceLookup({newPage:async()=>page})(request);
 assert.deepEqual(urls.map(s=>new URL(s).pathname),['/touch/site/layout/makesOverview','/touch/site/layout/lubricants']);
 assert.equal(new URL(url).searchParams.get('typeId'),vehicle.typeId);
 assert.deepEqual(serviceResult(result,request).oil,oil);
});
test('older workers supply the direct page identity without a cached maintenance questionnaire',()=>{
 const r=serviceResult({kind:'menu_choice',vehicle,mileage:1},request);
 assert.equal(r.kind,'manual_step');assert.equal(r.vehicle.typeId,vehicle.typeId);assert.equal(r.menu,undefined);
});
