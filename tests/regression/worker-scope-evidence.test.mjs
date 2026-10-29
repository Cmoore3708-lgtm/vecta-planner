import test from 'node:test';import assert from 'node:assert/strict';
import {diagnosticCase,selectedVehicleFuel} from '../../workers/gsf/diagnostic-case.mjs';
const found=fuel=>({registration:'CM14KEL',selectedRegistration:true,visibleText:`CM14KEL Clear Vehicle ${fuel} Copy VIN Related Petrol Diesel Electric`,headings:[]});
test('fuel evidence is restricted to one confirmed selected vehicle identity',()=>{
 assert.equal(selectedVehicleFuel(found('Diesel'),'CM14KEL'),'diesel');
 for(const f of [{...found('Diesel'),selectedRegistration:false},{...found('Diesel'),truncated:true},found('Petrol Diesel'),found('Unknown'),{...found('Diesel'),visibleText:'Diesel'}])assert.equal(selectedVehicleFuel(f,'CM14KEL'),null);
 assert.equal(selectedVehicleFuel(found('Diesel'),'OTHER1'),null);
});
test('missing saved fuel metadata does not require engine filters for confirmed electric vehicles',async()=>{
 const r=await diagnosticCase({}, {registration:'CM14KEL',operation:'oil_filter',fuelType:''},{capture:async()=>found('Electric'),readFresh:()=>{throw Error('must not read irrelevant product');}});
 assert.equal(r.outcome,'SKIPPED');assert.equal(r.reason,'NOT_IN_SERVICE_SCOPE');
});
test('petrol fuel filter is explicitly skipped, while unknown fuel remains review',async()=>{
 for(const [fuel,outcome] of [['Petrol','SKIPPED'],['Unknown','REVIEW_REQUIRED']]){
 const r=await diagnosticCase({}, {registration:'CM14KEL',operation:'fuel_filter'},{capture:async()=>found(fuel)});assert.equal(r.outcome,outcome);
 }
});
test('service with no saved fuel verifies supplier identity before choosing EV recipe',async()=>{
 let service;const r=await diagnosticCase({}, {registration:'CM14KEL',operation:'service',fuelType:''},{capture:async()=>found('Electric'),lookup:async(_,request)=>{service=request.service;return {fitmentVerified:true,scopeVerified:true,oilVerified:false,fuelType:'electric',items:[]};}});
 assert.equal(service,'EV Major Service');assert.equal(r.outcome,'PASSED');
});
test('ambiguous supplier identity cannot trigger a service lookup',async()=>{
 let called=false;const r=await diagnosticCase({}, {registration:'CM14KEL',operation:'service'},{capture:async()=>found('Petrol Diesel'),lookup:async()=>{called=true;}});
 assert.equal(called,false);assert.equal(r.outcome,'REVIEW_REQUIRED');assert.equal(r.reason,'FUEL_TYPE_UNCONFIRMED');
});
test('supplier hybrid identity retains its combustion fuel and cannot be mistaken for a BEV',()=>{
 assert.equal(selectedVehicleFuel(found('Diesel/Hybrid Electric'),'CM14KEL'),'diesel');
 assert.equal(selectedVehicleFuel(found('Petrol/Hybrid Electric'),'CM14KEL'),'petrol');
});
test('saved dummy registrations remain auditable but are skipped, never passed or browsed',async()=>{
 const r=await diagnosticCase({}, {registration:'AXLE1',operation:'service'},{capture:()=>{throw Error('must not browse');}});
 assert.equal(r.outcome,'SKIPPED');assert.equal(r.reason,'NON_VEHICLE_FIXTURE');
});
