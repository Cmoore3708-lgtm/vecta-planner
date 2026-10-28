import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('website/booking/index.html','utf8');
function setup(vehicle,engine_size=''){
 const c={state:{form:{engine_size,engine_size_manual:''}},haynesState:{status:'matched',vehicle}};vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function engineCc('),html.indexOf('function serviceGuidePrices('))+html.slice(html.indexOf('function engineSizeFromLookup('),html.indexOf('function startBookingTransfer(')),c);return c;
}
test('G4WPC D350 gets its 3.0L size from the returned engine code',()=>{
 const c=setup({registration:'G4WPC',variant:'D350 2024 - ...',engineCode:'3.0 TD6 MHEV'});assert.equal(c.serviceEngineSize(),3000);assert.equal(c.engineLabel(c.serviceEngineSize()),'3,000cc (3.0L)');
});
test('structured lookup sizes are used when variant labels do not contain displacement',()=>{
 const c=setup({variant:'D350 2024 - ...',engineCode:'AJ300',engineCapacity:2997});assert.equal(c.serviceEngineSize(),2997);
 const d=setup({variant:'D350 2024 - ...',engineCode:'AJ300'},2997);assert.equal(d.serviceEngineSize(),2997);d.haynesState.status='unavailable';assert.equal(d.serviceEngineSize(),2997);
 const unknown=setup({variant:'D350 2024 - ...',engineCode:'AJ300'});assert.equal(unknown.serviceEngineSize(),'');unknown.state.form.engine_size_manual=3000;assert.equal(unknown.serviceEngineSize(),3000);
});
test('a supplier review failure stays distinct from a completed price',async()=>{
 const form={registration:'G4WPC',job_types:['Service'],service_choice:'Full Service',parts_range:'Mid Range',mileage:''},states=[];
 const c={fetch:async()=>({ok:true,json:async()=>({status:'REVIEW_REQUIRED'})}),setTimeout,clearTimeout,AbortController,AbortSignal};vm.createContext(c);vm.runInContext(fs.readFileSync('public/js/vecta-service-pricing.js','utf8'),c);
 const controller=c.VectaServicePricing.createController({getForm:()=>form,onChange:s=>states.push(s),batch:true,wait:async()=>{}});controller.update();await new Promise(r=>setImmediate(r));assert.equal(states.at(-1).reason,'REVIEW_REQUIRED');assert.equal(controller.currentQuote(),null);controller.reset();
});
