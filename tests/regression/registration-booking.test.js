import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8');
const module=source.slice(source.indexOf('/* Dashboard registration lookup:'));
function setup({stored=null,lookup=async()=>null}={}){
 const {window,document}=parseHTML('<html><body><header class="top"><div class="plannerGlobalSearchWrap"></div></header><div id="jobModal"></div></body></html>');let opened;
 window.VectaBookingVehicles={resolve:()=>stored,suggestions:()=>[{value:'RESCUE 2',label:'Nissan Navara · NMUK'}]};
 window.VectaHaynesJobTools={snapshot:()=>null,lookup,remember:v=>v};
 window.openJobModal=(_id,preset)=>{opened=preset;const modal=document.getElementById('jobModal');modal.className='modal open';modal.innerHTML='<div class="jobModalCard"><header class="jobModalHead"><div class="jobCardHeaderVehicle"></div><div class="jobCardHeaderDetails"><section class="jobVehicleSection"><div class="field"><label>Last MOT Mileage</label><input id="job_mileage" value="12345"></div><input id="job_registration"><input id="job_vehicle"><input id="job_make"><input id="job_model"><input id="job_customer_account"></section></div></header><main class="jobModalBody"><textarea id="job_work_required"></textarea><input id="job_booking_date"><input id="job_customer_email"></main><footer><button id="saveJob">Create Job</button></footer></div>';for(const id of ['registration','vehicle','make','model','customer_account','customer_email'])document.getElementById('job_'+id).value=preset[id]||'';};
 vm.runInNewContext(module,{window,document,AbortController,URLSearchParams,setTimeout,clearTimeout,Date});
 return {window,document,preset:()=>opened};
}
test('saved internal and contractor vehicles open the real editor without any lookup',async()=>{
 for(const account of ['NMUK','NDS','Staff']){
  let lookups=0;const stored={registration:'RESCUE 2',vehicle:'Nissan Navara',customer_account:account,customer_email:'owner@example.test',lookup_local_only:true};
  const {window,document,preset}=setup({stored,lookup:()=>{lookups++;throw Error('Unexpected remote lookup');}});
  await window.VectaHaynesDashboardLookup.open('rescue 2');assert.equal(lookups,0);assert.equal(preset().customer_account,account);assert.equal(preset().customer_email,'owner@example.test');assert.equal(preset().status,'booked');assert.equal(document.querySelectorAll('#job_work_required').length,1);assert.equal(document.getElementById('job_mileage').value,'');assert.equal(document.querySelector('.bookingCurrentMileage label').textContent,'Current mileage');assert.equal(document.querySelector('.bookingLookupIdentity').closest('.jobModalHead'),document.querySelector('.jobModalHead'));assert.equal(document.querySelector('#haynesLookupPage'),null);assert.ok(document.getElementById('saveJob'));assert.ok(document.getElementById('job_booking_date'));
 }
});
test('new registration fills its vehicle without touching the booking fields',async()=>{
 const {window,document}=setup({lookup:async registration=>({registration,make:'Toyota',model:'Hilux',variant:'Diesel'})});
 await window.VectaHaynesDashboardLookup.open('AB12 CDE');assert.equal(document.getElementById('job_vehicle').value,'Toyota Hilux');assert.match(document.querySelector('[data-booking-variant]').textContent,/Diesel/);assert.equal(document.querySelectorAll('#job_work_required').length,1);
});
test('late lookup cannot overwrite user vehicle edits or a closed/replaced form',async()=>{
 let resolve;const {window,document}=setup({lookup:()=>new Promise(r=>resolve=r)});
 const pending=window.VectaHaynesDashboardLookup.open('AB12 CDE');const input=document.getElementById('job_vehicle');input.value='Owner supplied model';input.dispatchEvent(new window.Event('input'));resolve({registration:'AB12CDE',make:'Toyota',model:'Hilux'});await pending;assert.equal(input.value,'Owner supplied model');
 let finish;window.VectaHaynesJobTools.lookup=()=>new Promise(r=>finish=r);const next=window.VectaHaynesDashboardLookup.open('XY12 ABC');document.getElementById('jobModal').classList.remove('open');finish({registration:'XY12ABC',make:'Nissan',model:'Micra'});await next;assert.equal(document.getElementById('job_vehicle').value,'');
});
test('failed unknown lookup leaves the existing form usable and unsaved',async()=>{
 const {window,document,preset}=setup({lookup:async()=>{throw Error('OFFLINE');}});await window.VectaHaynesDashboardLookup.open('AB12 CDE');assert.equal(preset().registration,'AB12CDE');assert.match(document.querySelector('[data-booking-status]').textContent,/enter the details and save/);assert.ok(document.getElementById('saveJob'));
});
test('saved suggestions include internal identifiers and do not start remote work',()=>{
 const {window,document}=setup();window.VectaHaynesDashboardLookup.install();document.getElementById('haynesDashboardRegistration').dispatchEvent(new window.Event('focus'));assert.match(document.getElementById('bookingVehicleSuggestions').innerHTML,/RESCUE 2/);
});

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const bridge=html.slice(html.indexOf('window.VectaBookingVehicles='),html.indexOf('\n\ninit();',html.indexOf('window.VectaBookingVehicles=')));
test('production resolver uses fleet identifiers and preserves contractor and pool contacts',()=>{
 const fleetVehicles=[{id:'f1',registration:'RESCUE 2',model:'Nissan Navara',fleetGroup:'Nissan Internal',contactEmail:'internal@example.test'},{id:'f2',registration:'AB12 CDE',model:'Ford Transit',fleetGroup:'Contractor Fleet',customer:'NDS',contactEmail:'fleet@nds.test'},{id:'f3',registration:'POOL 1',model:'Nissan Qashqai',fleetGroup:'Pool Cars'}];
 const normReg=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const window={};
 vm.runInNewContext(bridge,{window,fleetVehicles,app:{vehicles:[],jobs:[]},normReg,knownRegistrationDetails:()=>null,cleanStoredRegistration:s=>s.toUpperCase(),fleetDisplayModel:s=>s,fleetNormaliseCustomer:s=>s,vectaJobIsDeletedForLists:()=>false});
 const internal=window.VectaBookingVehicles.resolve('rescue2');assert.equal(internal.customer_account,'NMUK');assert.equal(internal.nmuk_vehicle_type,'INTERNAL');assert.equal(internal.customer_email,'internal@example.test');assert.equal(internal.lookup_local_only,true);
 const contractor=window.VectaBookingVehicles.resolve('AB12CDE');assert.equal(contractor.customer_account,'NDS');assert.equal(contractor.customer_email,'fleet@nds.test');assert.equal(contractor.mileage,'');
 assert.equal(window.VectaBookingVehicles.resolve('POOL 1').nmuk_vehicle_type,'POOL');assert.equal(window.VectaBookingVehicles.resolve('UNKNOWN PLATE'),null);
});
