import {bookingTypes} from '../../lib/booking-input.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync('website/booking/index.html','utf8');
test('EV offer requires registration-bound electric identity, never hybrid or unknown',()=>{
 const c={state:{form:{registration:'AB12CDE',fuel_registration:'AB12CDE',fuel_type:'Electric'}}};vm.createContext(c);vm.runInContext(html.match(/function confirmedEvServiceVehicle\(\)\{[^\n]+/)[0],c);assert.equal(c.confirmedEvServiceVehicle(),true);
 for(const fuel of ['Petrol','Diesel','Petrol Hybrid','Plug-in Hybrid','']){c.state.form.fuel_type=fuel;assert.equal(c.confirmedEvServiceVehicle(),false);}
 c.state.form.fuel_type='Electric';c.state.form.registration='ZZ99ZZZ';assert.equal(c.confirmedEvServiceVehicle(),false);
 assert.match(html,/Normally £90 - £150/);assert.match(html,/'Full computer diagnostic scan','Comprehensive health check & report'/);assert.doesNotMatch(html,/Servicing for electric vehicles\.'[^\n]*'Air filter'/);
});
function context(){
 const c={state:{form:{registration:'AB12CDE',fuel_registration:'AB12CDE',fuel_type:'Electric',job_types:['Service'],service_choice:'',work_required:''}},serviceGuidePrices:()=>({oil:80,full:140}),serviceEngineSize:()=>1200,serviceGuideFallback:()=>true,liveServiceQuote:()=>null,servicePriceState:{status:'idle'},servicePriceLabel:()=> '£140',serviceVehicleHtml:()=>'',majorServiceFuelFilterNote:()=>'',serviceExtraHtml:()=>'<div>EXTRA FILTER</div>'};
 vm.createContext(c);
 for(const name of ['confirmedEvServiceVehicle','serviceMileageValid','serviceOptionsHtml','reconcileServiceChoice']){const start=html.indexOf(`function ${name}(`),end=html.indexOf('\n}',start);vm.runInContext(['confirmedEvServiceVehicle','serviceMileageValid'].includes(name)?html.slice(start,html.indexOf('\n',start)):html.slice(start,end+2),c);}
 return c;
}
test('confirmed EV renders only EV servicing without combustion prompts or extras',()=>{
 const c=context(),out=c.serviceOptionsHtml();assert.match(out,/data-service-choice="EV Servicing"/);for(const text of ['data-service-choice="Oil & Filter Change"','data-service-choice="Full Service"','engine-size-prompt','Engine oil prices','EXTRA FILTER','service-live-price-status'])assert.ok(!out.includes(text),text);
});
test('petrol, diesel, hybrid and unknown retain standard services only',()=>{
 const c=context();for(const fuel of ['Petrol','Diesel','Petrol Hybrid','Plug-in Hybrid','']){c.state.form.fuel_type=fuel;const out=c.serviceOptionsHtml();assert.match(out,/data-service-choice="Oil & Filter Change"/);assert.match(out,/data-service-choice="Full Service"/);assert.doesNotMatch(out,/data-service-choice="EV Servicing"/);}
});
test('late EV identity replaces incompatible selection and clears extras while retaining customer notes',()=>{
 const c=context(),f=c.state.form;f.service_choice='Full Service';f.work_required='Full Service';f.service_extra_choice='replace';c.reconcileServiceChoice();assert.equal(f.service_choice,'EV Servicing');assert.equal(f.work_required,'EV Servicing');assert.equal(f.service_extra_choice,'none');f.service_choice='Full Service';f.work_required='Please check brakes';c.reconcileServiceChoice();assert.equal(f.work_required,'Please check brakes');f.service_choice='EV Servicing';c.reconcileServiceChoice();assert.equal(f.service_choice,'EV Servicing');f.fuel_type='Petrol';c.reconcileServiceChoice();assert.equal(f.service_choice,'');
});

test('choosing Service for an EV automatically selects the glowing EV card and normal mileage prompt',()=>{
 const c=context(),f=c.state.form;c.reconcileServiceChoice();assert.equal(f.service_choice,'EV Servicing');assert.equal(f.work_required,'EV Servicing');assert.equal(c.state.mileage_dialog_open,true);
 const out=c.serviceOptionsHtml();assert.match(out,/class="service-option service-compact silver selected"[^>]+data-service-choice="EV Servicing"[^>]+aria-pressed="true"/);
 c.state.mileage_dialog_open=false;c.reconcileServiceChoice();assert.equal(c.state.mileage_dialog_open,false);
 f.service_choice='';f.mileage='35000';c.reconcileServiceChoice();assert.equal(c.state.mileage_dialog_open,false);
 f.service_choice='';f.mileage='';f.mileage_unknown=true;c.reconcileServiceChoice();assert.equal(c.state.mileage_dialog_open,false);
});
test('automatic EV selection requires Service intent and confirmed current registration',()=>{
 for(const variant of ['other','hybrid','changed-reg','nevos']){const c=context(),f=c.state.form;if(variant==='other')f.job_types=['MOT'];if(variant==='hybrid')f.fuel_type='Petrol Hybrid';if(variant==='changed-reg')f.registration='ZZ99ZZZ';if(variant==='nevos')f.nevos_vehicle='yes';c.reconcileServiceChoice();assert.equal(f.service_choice,'',variant);}
});

test('every rendered service option is accepted by the shared availability and submission validator',()=>{
 for(const fuel of ['Electric','Petrol','Diesel','Petrol Hybrid','Plug-in Hybrid','']){
  const c=context();c.state.form.fuel_type=fuel;
  const choices=[...c.serviceOptionsHtml().matchAll(/data-service-choice="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(choices.length,'The customer must have a service option');
  for(const choice of choices)for(const mot of [[],['MOT']]){
   assert.deepEqual(bookingTypes({job_types:[choice,...mot],service_choice:choice}),[choice,...mot]);
   assert.deepEqual(bookingTypes({job_types:['Service',...mot],service_choice:choice}),[choice,...mot]);
  }
 }
});
