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
 window.openJobModal=(_id,preset)=>{opened=preset;const modal=document.getElementById('jobModal');modal.className='modal open';modal.innerHTML='<div class="jobModalCard"><header class="jobModalHead"><div class="jobModalHeadActions"><button id="printJobCard">Print Job Card</button><button data-close-modal>Close</button></div><div class="jobCardHeaderVehicle"></div><div class="jobCardHeaderDetails"><section class="jobVehicleSection"><div class="field"><label>Last MOT Mileage</label><input id="job_mileage" value="12345"></div><input id="job_registration"><input id="job_vehicle"><input id="job_make"><input id="job_model"><input id="job_customer_account"></section></div></header><main class="jobModalBody"><textarea id="job_work_required"></textarea><section class="jobBookingSection"><div class="jobSectionGrid"><input id="job_booking_date"></div></section><input id="job_customer_email"></main><footer><button id="saveJob">Create Job</button></footer></div>';for(const id of ['registration','vehicle','make','model','customer_account','customer_email'])document.getElementById('job_'+id).value=preset[id]||'';};
 vm.runInNewContext(module,{window,document,AbortController,URLSearchParams,setTimeout,clearTimeout,Date});
 return {window,document,preset:()=>opened};
}
test('saved internal and contractor vehicles open the real editor without any lookup',async()=>{
 for(const account of ['NMUK','NDS','Staff']){
  let lookups=0;const stored={registration:'RESCUE 2',vehicle:'Nissan Navara',customer_account:account,customer_email:'owner@example.test',lookup_local_only:true};
  const {window,document,preset}=setup({stored,lookup:()=>{lookups++;throw Error('Unexpected remote lookup');}});
  await window.VectaHaynesDashboardLookup.open('rescue 2');assert.equal(lookups,0);assert.equal(preset().customer_account,account);assert.equal(preset().customer_email,'owner@example.test');assert.equal(preset().status,'booked');assert.equal(document.querySelectorAll('#job_work_required').length,1);assert.equal(document.getElementById('job_mileage').value,'');assert.equal(document.querySelector('.bookingCurrentMileage label').textContent,'Current mileage');assert.ok(document.querySelector('.jobBookingSection .bookingCurrentMileage'));assert.equal(document.querySelector('.bookingLookupIdentity').closest('.jobModalHead'),document.querySelector('.jobModalHead'));assert.equal(document.querySelector('#haynesLookupPage'),null);assert.ok(document.getElementById('saveJob'));assert.ok(document.getElementById('job_booking_date'));assert.deepEqual(Array.from(document.querySelector('.jobModalHeadActions').children).map(el=>el.textContent),['Service & repair data','Print Job Card','Close','Open in HaynesPro']);
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
test('phone focus does no fleet work; typing debounces and bounds saved suggestions',async()=>{
 const {window,document}=setup();let calls=0,received;
 window.VectaBookingVehicles.suggestions=(query,limit)=>{calls++;received=[query,limit];return Array.from({length:1000},(_,i)=>({value:'RESCUE '+i,label:'Nissan Navara'}));};
 window.VectaHaynesDashboardLookup.install();const input=document.getElementById('haynesDashboardRegistration');
 input.dispatchEvent(new window.Event('focus'));assert.equal(calls,0);assert.equal(document.querySelectorAll('datalist option').length,0);
 input.setCustomValidity=()=>{};input.value='r';input.oninput({target:input});await new Promise(r=>setTimeout(r,170));assert.equal(calls,0);
 input.value='re';input.oninput({target:input});input.value='res';input.oninput({target:input});assert.equal(calls,0);
 await new Promise(r=>setTimeout(r,170));assert.equal(calls,1);assert.deepEqual(received,['RES',20]);assert.equal(document.querySelectorAll('datalist option').length,20);
 input.value='';input.oninput({target:input});assert.equal(document.querySelectorAll('datalist option').length,0);
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


test('government MOT results cannot fill the current mileage field with a historical reading',async()=>{
 const {window,document}=setup({stored:{registration:'AB12 CDE',vehicle:'Toyota Hilux'}});
 await window.VectaHaynesDashboardLookup.open('AB12CDE');
 const start=html.indexOf('async function lookupVehicleForJob('),end=html.indexOf('\nfunction ',start);
 const context={document,dvsaAutoLookupSequence:0,normReg:s=>String(s).replace(/[^A-Z0-9]/g,''),fetchDvsaVehicle:async()=>({vehicle:'Toyota Hilux',latestMileage:120000,advisories:[]}),dvsaIsoDate:()=>'',dvsaAdvisoryArray:v=>v||[],renderDvsaAdvisoryPreview(){},refreshServicePricingAdvisor(){},updateJobVehicleDuePanel(){}};
 vm.createContext(context);vm.runInContext(html.slice(start,end),context);await context.lookupVehicleForJob({});
 assert.equal(document.getElementById('job_mileage').value,'');
});

test('new booking repaints when colour arrives after the Haynes drawing',async()=>{
 const {window,document}=setup({lookup:async()=>({registration:'OE75NXX',make:'NISSAN',model:'Qashqai (J12)'})});
 let finish,requests=0,paints=0,colour='';
 window.VectaHaynesJobTools.lookupDashboardColour=()=>{requests++;return new Promise(r=>{finish=()=>{colour='Blue';r();};});};
 const opened=window.VectaHaynesDashboardLookup.open('OE75 NXX');
 document.getElementById('job_vehicle').addEventListener('change',()=>{if(colour==='Blue')paints++;});
 await opened;await new Promise(r=>setTimeout(r,0));assert.equal(requests,1);assert.equal(paints,0);
 finish();await new Promise(r=>setTimeout(r,0));assert.equal(paints,1);
});
test('late booking colour cannot repaint a replacement vehicle editor',async()=>{
 const {window,document}=setup({lookup:async()=>null});let finish,paints=0;
 window.VectaHaynesJobTools.lookupDashboardColour=()=>new Promise(r=>finish=r);
 await window.VectaHaynesDashboardLookup.open('OE75NXX');await new Promise(r=>setTimeout(r,0));
 document.getElementById('job_vehicle').addEventListener('change',()=>paints++);
 document.getElementById('job_registration').value='AB12CDE';finish();await new Promise(r=>setTimeout(r,0));assert.equal(paints,0);
});

test('top HaynesPro action opens the matched vehicle alongside Close',async()=>{
 const {window,document}=setup({lookup:async()=>({registration:'OE75NXX',make:'NISSAN',model:'Qashqai',typeId:'t_619108899'})});
 window.VectaHaynesJobTools.vehicleLink=v=>v?.typeId?'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId='+v.typeId:'';
 await window.VectaHaynesDashboardLookup.open('OE75NXX');
 const link=document.querySelector('.jobModalHeadActions a');assert.equal(link.textContent,'Open in HaynesPro');assert.match(link.href,/typeId=t_619108899/);assert.equal(link.target,'_blank');assert.equal(link.previousElementSibling.textContent,'Close');
});

test('large saved history reads deletion tombstones once and excludes deleted suggestions',()=>{
 const window={};vm.runInNewContext(readFileSync(new URL('../../public/js/vecta-job-rules.js',import.meta.url),'utf8'),{window});
 let reads=0;const jobs=Array.from({length:10000},(_,i)=>({id:String(i),registration:'AB'+String(i).padStart(5,'0'),vehicle:'Ford Transit'}));
 jobs[0].status='deleted';
 vm.runInNewContext(bridge,{window,app:{vehicles:[],jobs},fleetVehicles:[],normReg:s=>String(s).toUpperCase().replace(/[^A-Z0-9]/g,''),vectaDeletedJobTombstones:()=>{reads++;return {'1':{deleted_at:'today'}};},vectaTerminalJobState:id=>id==='2'?{state:'deleted'}:null});
 assert.equal(window.VectaBookingVehicles.suggestions('').length,0);assert.equal(reads,0);
 const hits=window.VectaBookingVehicles.suggestions('AB',20);assert.equal(hits.length,20);assert.equal(reads,1);assert.equal(hits[0].value,'AB00003');
 assert.equal(window.VectaBookingVehicles.suggestions('Transit').length,20);
});
