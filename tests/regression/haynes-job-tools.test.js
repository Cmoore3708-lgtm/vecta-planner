import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML,DOMParser} from 'linkedom';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8');
const vehicle={registration:'FX69XWU',make:'Nissan',model:'Qashqai',variant:'1.7 dCi',typeId:'t_301000368',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg',fetchedAt:new Date().toISOString()};
function setup(fetcher,artwork,identities,explicitLookup=true,extraFields='',mechanic=false){const {window,document}=parseHTML('<html><body><div id="modal"><div class="jobModalHead"><h2>Edit Job</h2><div class="jobModalHeadActions"><button>Close</button></div></div><section class="jobVehicleSection"><input id="job_registration" value="FX69 XWU"><input id="job_make" value="Nissan"><input type="checkbox" id="job_no_vehicle">'+extraFields+'</section><div class="jobCardSections"><section class="jobWorkSection"></section><section class="jobPreviousWorkSection"></section><section class="jobContactSection"></section><section class="jobBookingSection"><div class="bookingAvailabilityWorkspace"></div></section><section class="jobFormSection"><div class="jobPartsEditor"></div></section><section class="privatePricingSection"></section></div><button id="save">Save</button></div></body></html>');const card=document.createElement('div');card.className='jobModalCard';card.append(...document.querySelector('#modal').children);document.querySelector('#modal').append(card);window.VECTA_MECHANIC_DEPLOYMENT=mechanic;delete window.VectaVehicleImage;delete window.app;delete window.fleetVehicles;window.fetch=fetcher;if(identities)window.localStorage={getItem:key=>key==='vecta_haynes_vehicle_identity_v1'?JSON.stringify(identities):null,setItem(){}};window.VectaFleetImages={artwork};vm.runInNewContext(source,{window,document,AbortController,AbortSignal,setTimeout,clearTimeout,encodeURIComponent});window.initHaynesJobTools(document.querySelector('#modal'));if(explicitLookup)document.querySelector('.jobHeaderHaynesLookup').onclick();return {window,document,panel:document.querySelector('.haynesJobTools')};}
const lookupButton=panel=>panel.ownerDocument.querySelector('.jobHeaderHaynesLookup');

const response=v=>({ok:true,json:async()=>({status:'MATCHED',vehicle:v})});
test('vehicle details sit below the single editable header registration',async()=>{
 const {window,document}=setup(async()=>response(vehicle));
 await new Promise(r=>setImmediate(r));
 const heading=document.querySelector('.jobCardHeaderHeading'),input=document.querySelector('#job_registration');
 assert.equal(document.querySelectorAll('#job_registration').length,1);
 assert.equal(document.querySelector('.jobModalHeadActions').parentElement,heading);
 assert.equal(document.querySelector('.jobHeaderHaynesLookup').parentElement,heading.querySelector('.jobModalHeadActions'));
 assert.equal(input.closest('.jobCardHeaderRegistration').parentElement,heading);
 assert.equal(document.querySelector('.jobCardHeaderDetails .jobVehicleSection').closest('.jobModalHead'),heading.parentElement);
 assert.ok(heading.parentElement.classList.contains('jobCardPinnedHeader'));
 assert.equal(heading.querySelector('.jobCardHeaderModel').textContent,'Nissan Qashqai');
 assert.equal(heading.querySelector('.jobCardHeaderRegistration').nextElementSibling,heading.querySelector('.jobCardHeaderModel'));
 assert.equal(document.querySelector('.jobVehicleSection #job_registration'),null);
 assert.deepEqual(Array.from(document.querySelector('.jobCardMainColumn').children).map(el=>el.className),['jobWorkSection','jobFormSection','privatePricingSection','jobPreviousWorkSection']);
 assert.deepEqual(Array.from(document.querySelector('.jobCardSupportColumn').children).map(el=>el.className),['bookingAvailabilityWorkspace']);
 assert.equal(document.querySelectorAll('.jobContactSection').length,1);
 assert.equal(document.querySelector('.jobContactSection').parentElement,document.querySelector('.jobCardHeaderDetails'));
 assert.equal(document.querySelector('.privatePricingSection').previousElementSibling.querySelector('.jobPartsEditor')!==null,true);
 assert.equal(document.querySelector('.jobBookingFullWidth').parentElement.className,'jobCardSections');
 input.value='AB12 XYZ';input.dispatchEvent(new window.Event('input'));
 assert.equal(document.querySelector('#job_registration'),input);
 assert.equal(input.value,'AB12 XYZ');
 document.querySelector('#job_no_vehicle').checked=true;
 document.querySelector('#job_no_vehicle').dispatchEvent(new window.Event('change'));
 assert.equal(input.closest('.jobCardHeaderRegistration').hidden,true);
 assert.equal(heading.querySelector('.jobCardHeaderModel').hidden,true);
 assert.equal(document.querySelector('#job_registration'),input);
});
test('the header name avoids a duplicate manufacturer and leaves the editable vehicle value intact',()=>{
 const {window,document}=setup(async()=>response(vehicle),undefined,undefined,false);
 const vehicleInput=document.createElement('input');vehicleInput.id='job_vehicle';vehicleInput.value='Nissan Qashqai';document.querySelector('.jobVehicleSection').appendChild(vehicleInput);
 document.querySelector('#job_registration').dispatchEvent(new window.Event('change'));
 assert.equal(document.querySelector('.jobCardHeaderModel').textContent,'Nissan Qashqai');
 assert.equal(vehicleInput.value,'Nissan Qashqai');
 vehicleInput.value='Micra';document.querySelector('#job_registration').dispatchEvent(new window.Event('change'));
 assert.equal(document.querySelector('.jobCardHeaderModel').textContent,'Nissan Micra');
 assert.equal(vehicleInput.value,'Micra');
});
test('missing calendar pictures never request vehicle identity or colour',async()=>{
 const {window,document}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));
 window.VectaVehicleImage={colourHex:()=>'',resolveColour:(_r,c)=>c,mount:()=>Promise.resolve()};
 const requested=[];window.fetch=async url=>{requested.push(url);if(url.includes('vehicle-lookup'))return new Promise(()=>{});const registration=new URL(url,'https://test.local').searchParams.get('reg');return response({...vehicle,registration,make:'Toyota',model:'Yaris'});};
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="1"></div><div class="mobileJob" data-open-job="2"></div>';document.body.append(host);
 window.enrichHaynesDashboard(host,[{id:'1',registration:'MK55MLU',make:'Toyota'},{id:'2',registration:'AB12XYZ',make:'Toyota'}]);
 for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));
 assert.equal(host.querySelectorAll('img').length,0);assert.deepEqual(requested,[]);
 host.remove();
});
test('a fresh vehicle match without artwork uses the generic picture without repeating Haynes',async()=>{
 const {window,document}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));
 window.VectaHaynesJobTools.remember({...vehicle,registration:'MK55MLU',make:'Toyota',model:'Yaris',imageUrl:''});
 let calls=0;window.fetch=async()=>{calls++;return response({...vehicle,registration:'MK55MLU',make:'Toyota',model:'Yaris'});};
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="1"></div>';document.body.append(host);
 window.enrichHaynesDashboard(host,[{id:'1',registration:'MK55MLU',make:'Toyota',colour:'Grey'}]);
 for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));
 assert.equal(calls,0);host.remove();
});
test('visible and scrolled calendar cards never queue lookups',async()=>{
 const {window,document}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));
 window.innerHeight=800;let onEntry;window.IntersectionObserver=class{constructor(callback){onEntry=callback;}observe(){}disconnect(){}};
 const requests=[];window.fetch=async url=>{const registration=new URL(url,'https://test.local').searchParams.get('reg');requests.push(registration);return response({...vehicle,registration,make:'Toyota',model:'Yaris'});};
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="hidden"></div><div class="mobileJob" data-open-job="visible"></div>';document.body.append(host);
 const hidden=host.firstElementChild;let scrolled=false;hidden.getBoundingClientRect=()=>({width:300,height:80,top:scrolled?100:900,bottom:scrolled?180:980});host.lastElementChild.getBoundingClientRect=()=>({width:300,height:80,top:100,bottom:180});
 const jobs=[{id:'hidden',registration:'ZZ12XYZ',make:'Toyota',colour:'Grey'},{id:'visible',registration:'MK55MLU',make:'Toyota',colour:'Grey'}];
 window.enrichHaynesDashboard(host,jobs);for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));assert.deepEqual(requests,[]);
 scrolled=true;onEntry([{isIntersecting:true}]);for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));assert.equal(hidden.querySelectorAll('img').length,0);assert.deepEqual(requests,[]);
 delete window.innerHeight;delete window.IntersectionObserver;host.remove();
});
test('dashboard reuses saved colour and renders grey body paint without altering records',async()=>{
 const requests=[];
 const {window,document}=setup(async url=>{requests.push(url);return {ok:true,json:async()=>url.includes('vehicle-lookup')?{registration:vehicle.registration,make:'Nissan',primaryColour:'Grey'}:url.includes('haynes-image')?{svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 299 220"><g id="transparant_colour"><path fill="#ffffff" d="M0 0h100v100z"/></g></svg>'}:{status:'MATCHED',vehicle}};});
 window.DOMParser=DOMParser;window.XMLSerializer=class{serializeToString(node){return node.outerHTML;}};window.AbortSignal=AbortSignal;
 window.Element.prototype.getBBox=()=>({x:0,y:0,width:100,height:100});
 vm.runInNewContext(readFileSync(new URL('../../public/js/vecta-vehicle-image.js',import.meta.url),'utf8'),{window,setTimeout,clearTimeout});
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="1"></div>';document.body.append(host);const jobs=[{id:'1',registration:vehicle.registration,make:'Nissan',model:'Qashqai'}];
 window.VectaHaynesJobTools.rememberLookupColour({registration:vehicle.registration,make:'Nissan',primaryColour:'Grey'});
 window.enrichHaynesDashboard(host,jobs);for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));
 const img=host.querySelector('img');assert.equal(img.dataset.colour,'Grey');assert.equal(img.dataset.recoloured,'true');assert.match(decodeURIComponent(img.src),/#626970/);
 assert.equal(jobs[0].colour,undefined);window.enrichHaynesDashboard(host,jobs);for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
 assert.equal(requests.filter(url=>url.includes('vehicle-lookup')).length,0);host.remove();
});
test('dashboard uses registration-specific vehicle colours, including two generic models without plates',()=>{
 const {window,document}=setup(async()=>response(vehicle));
 window.app={vehicles:[{registration:'FX69 XWU',colour:'Green'}]};
 let painted=0;window.VectaVehicleImage={resolveColour:(_reg,colour)=>colour,colourHex:colour=>colour,mount:target=>{for(const img of target.querySelectorAll('[data-vehicle-image]')){painted++;img.src='data:image/svg+xml,painted';}}};
 const host=document.createElement('div');host.innerHTML=['1','2','3'].map(id=>'<div class="mobileJob" data-open-job="'+id+'"></div>').join('');document.body.append(host);
 const jobs=[{id:'1',registration:'FX69XWU',make:'Nissan',model:'Qashqai'},{id:'2',registration:'',make:'Nissan',model:'Qashqai',colour:'White'},{id:'3',registration:'',make:'Nissan',model:'Qashqai',colour:'Black'}];
 window.VectaHaynesJobTools.remember(vehicle);window.enrichHaynesDashboard(host,jobs);
 assert.deepEqual([...host.querySelectorAll('img')].map(img=>img.dataset.colour),['Green','White','Black']);
 const first=host.querySelector('img');window.enrichHaynesDashboard(host,jobs);assert.equal(host.querySelector('img'),first,'repainted data URL must not replace the existing thumbnail');
 window.app.vehicles[0].colour='Blue';window.enrichHaynesDashboard(host,jobs);assert.equal(host.querySelector('img').dataset.colour,'Blue');assert.notEqual(host.querySelector('img'),first);assert.ok(painted>0);
 assert.equal(jobs[0].colour,undefined,'visual fallback must not overwrite job records');host.remove();
});
test('actual job-editor integration passes a defined modal element to Haynes tools',()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');let calls=0;
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  const ast=parse(match[1],{sourceType:'script'});traverse(ast,{CallExpression(path){const c=path.node.callee;if(c.type!=='MemberExpression'||c.property.name!=='initHaynesJobTools')return;calls++;const arg=path.node.arguments[0];assert.equal(arg.type,'Identifier');const binding=path.scope.getBinding(arg.name);assert.ok(binding,'Job-card integration uses undefined '+arg.name);assert.equal(binding.path.node.init?.callee?.property?.name,'getElementById');assert.equal(binding.path.node.init.arguments[0].value,'jobModal');}});
 }assert.equal(calls,1);
});
test('an explicit vehicle lookup displays its image',async()=>{
 let requests=0;const {panel}=setup(async()=>{requests++;return response(vehicle);});await new Promise(r=>setImmediate(r));assert.equal(requests,1);assert.equal(panel.querySelector('img')?.src,'/api/haynes-image?asset=123.svg&format=svg');assert.match(panel.textContent,/Open this vehicle/);
});
test('real mobile and desktop planner cards reuse the same saved vehicle image',async()=>{
 let requests=0;const {window,document}=setup(async()=>{requests++;return response(vehicle);});await new Promise(r=>setImmediate(r));
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="1"><div class="mobileJobTop">FX69 XWU</div></div><div class="unallocatedSideJob" draggable="true" data-job-id="1" data-open-unallocated="1">Unallocated</div><div class="job plannerJobFull" data-job-id="1"><div class="plannerJobHeader"><div class="plannerJobLeft">FX69 XWU</div><div class="plannerJobRightText">Service</div></div></div>';document.body.appendChild(host);
 window.enrichHaynesDashboard(host,[{id:'1',registration:'FX69XWU',make:'Nissan'}]);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert.equal(requests,1);assert.equal(host.querySelectorAll('.haynesDashboardImage').length,3);assert.equal(host.querySelector('.unallocatedSideJob').getAttribute('draggable'),'true');assert.match(host.textContent,/FX69 XWU/);assert.equal(host.querySelector('.mobileJob').lastElementChild.className,'haynesDashboardImage');assert.equal(host.querySelector('.plannerJobHeader').lastElementChild.className,'haynesDashboardImage');
});
test('unconfigured preview reports the actual lookup issue instead of silently showing an empty image area',async()=>{
 const {panel}=setup(async()=>({ok:true,json:async()=>({status:'NOT_CONFIGURED'})}));await new Promise(r=>setImmediate(r));assert.match(panel.textContent,/not configured for this preview/);assert.equal(panel.querySelector('img'),null);
});
test('confirmed vehicle opens a fixed supplier URL, hides broken images and leaves save intact',async()=>{
 const {document,panel}=setup(async()=>response(vehicle));await lookupButton(panel).onclick();
 const link=panel.querySelector('a');assert.equal(link.href,'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_301000368');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
 assert.match(panel.textContent,/Nissan Qashqai/);panel.querySelector('img').onerror();assert.equal(panel.querySelector('img'),null);assert.equal(document.querySelector('#save').textContent,'Save');
});
test('invoice receives confirmed image and details without modifying amounts; fleet strips stay unchanged',()=>{
 const {window,document}=setup(async()=>response(vehicle));window.VectaHaynesJobTools.remember(vehicle);
 const sheet=document.createElement('div');sheet.innerHTML='<div class="invoicePrintHeader"><div>VECTA</div><div class="printTitle">INVOICE</div></div><div class="printInvoiceVehicle"><div class="printVehicleCell">Plate</div><div class="printVehicleCell"><b>Nissan</b></div></div><div class="printTotals">£120.00</div>';document.body.appendChild(sheet);
 const inv={registration:'FX69 XWU',subtotal:100,vat:20,total:120},before=JSON.stringify(inv);window.enrichHaynesInvoice(sheet,inv);assert.equal(sheet.querySelector('.haynesInvoiceImage').src,vehicle.imageUrl);assert.equal(sheet.querySelector('.haynesInvoiceImage').dataset.registration,'FX69XWU');assert.ok(sheet.querySelector('.invoicePrintHeader .haynesInvoiceImage'));assert.equal(sheet.querySelector('.printInvoiceVehicle img'),null);assert.match(sheet.textContent,/Qashqai/);assert.equal(sheet.querySelector('.printTotals').textContent,'£120.00');assert.equal(JSON.stringify(inv),before);
 const fleet=document.createElement('div');fleet.innerHTML='<div>Fleet account</div>';window.enrichHaynesInvoice(fleet,{registration:'FLEET ACCOUNT'});assert.equal(fleet.querySelector('img'),null);
});
test('dashboard decorates timed cards, preserves duration and drag attributes and rejects another make',()=>{
 const {window,document}=setup(async()=>response(vehicle));window.VectaHaynesJobTools.remember(vehicle);const host=document.createElement('div');host.innerHTML='<div class="job plannerJobFull" draggable="true" data-job-id="1" style="height:100px"><div class="plannerJobHeader"><div class="plannerJobLeft">FX69 XWU</div><div class="plannerJobRightText">Service</div></div></div><div class="job plannerJobCompact" data-job-id="2"><div class="plannerJobHeader"><div class="plannerJobLeft">FX69 XWU</div><div class="plannerJobRightText">Service</div></div></div>';document.body.appendChild(host);window.enrichHaynesDashboard(host,[{id:'1',registration:'FX69XWU',make:'Nissan'},{id:'2',registration:'FX69XWU'}]);assert.equal(host.querySelectorAll('img').length,2);assert.equal(host.querySelector('[data-job-id="1"]').style.height,'100px');assert.equal(host.querySelector('[data-job-id="1"]').getAttribute('draggable'),'true');assert.equal(window.VectaHaynesJobTools.snapshot('FX69XWU','Ford'),null);
});
test('snapshot cache drops unsafe fields, rejects stale results and survives storage failure',()=>{
 const {window}=setup(async()=>response(vehicle));window.localStorage={setItem(){throw Error('full');}};const tools=window.VectaHaynesJobTools;assert.ok(tools.remember({...vehicle,vin:'private',cookie:'secret'}));assert.equal(tools.snapshot(vehicle.registration).vin,undefined);assert.equal(tools.snapshot(vehicle.registration).cookie,undefined);assert.equal(tools.remember({...vehicle,registration:'OTHER',fetchedAt:'2020-01-01T00:00:00Z'}),undefined);assert.equal(tools.snapshot('OTHER'),null);
});
test('wrong registration, conflicting make and invalid vehicle ID cannot expose technical links',async()=>{
 for(const wrong of [{...vehicle,registration:'OTHER'},{...vehicle,make:'Ford'},{...vehicle,typeId:'https://evil.test'}]){const {panel}=setup(async()=>response(wrong));await lookupButton(panel).onclick();assert.equal(panel.querySelector('a'),null);assert.match(panel.textContent,/uncertain/);}
});
test('late response cannot attach another vehicle to an edited or closed job',async()=>{
 let finish;const pending=new Promise(r=>finish=r),{document,window,panel}=setup(()=>pending);const running=lookupButton(panel).onclick();const input=document.querySelector('#job_registration');input.value='OTHER';input.dispatchEvent(new window.Event('input'));finish(response(vehicle));await running;assert.equal(panel.querySelector('a'),null);
 let finish2;const second=setup(()=>new Promise(r=>finish2=r)),run2=lookupButton(second.panel).onclick();second.panel.remove();finish2(response(vehicle));await run2;assert.equal(second.panel.querySelector('a'),null);
});
test('no-vehicle jobs and unsafe images fail closed; unavailable lookup never changes vehicle fields',async()=>{
 const {document,window,panel}=setup(async()=>{throw Error('offline');});await lookupButton(panel).onclick();assert.match(panel.textContent,/still save/);assert.equal(document.querySelector('#job_registration').value,'FX69 XWU');const toggle=document.querySelector('#job_no_vehicle');toggle.checked=true;toggle.dispatchEvent(new window.Event('change'));assert.equal(lookupButton(panel).disabled,true);assert.equal(window.VectaHaynesJobTools.safeImage('https://evil.test/car.png'),'');
});

test('planner reuses saved vehicles beyond the twelfth card without lookups across rerenders',async()=>{
 const {window,document}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));
 let requests=0;window.fetch=async url=>{requests++;const registration=new URL(url,'https://test.local').searchParams.get('reg');return response({...vehicle,registration});};
 const jobs=Array.from({length:15},(_,i)=>({id:String(i),registration:'AB'+String(i).padStart(2,'0')+'XYZ',make:'Nissan'}));
 for(const job of jobs)window.VectaHaynesJobTools.remember({...vehicle,registration:job.registration});
 const host=document.createElement('div');document.body.appendChild(host);
 const markup=()=>jobs.map(j=>'<div class="mobileJob" data-open-job="'+j.id+'"><div class="mobileJobTop">'+j.registration+'</div></div>').join('');
 host.innerHTML=markup();window.enrichHaynesDashboard(host,jobs);
 host.innerHTML=markup();window.enrichHaynesDashboard(host,jobs);
 for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
 assert.equal(requests,0);assert.equal(host.querySelectorAll('.haynesDashboardImage').length,15);
 assert.equal(host.querySelector('[data-open-job="14"]').lastElementChild.className,'haynesDashboardImage');
});

test('description-only Qashqai receives a generic image on the right without a registration lookup',async()=>{
 const {window,document}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));let requests=0;window.fetch=async()=>{requests++;throw Error('offline');};
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="blank"><div class="mobileJobTop">Qashqai</div></div>';document.body.appendChild(host);
 const job={id:'blank',registration:'',vehicle:'Nissan Qashqai',work_required:'Brakes'},before=JSON.stringify(job);
 window.enrichHaynesDashboard(host,[job]);await new Promise(r=>setImmediate(r));
 const img=host.querySelector('img');assert.ok(img);assert.equal(img.dataset.generic,'true');assert.match(img.alt,/Generic model image.*Qashqai/);assert.equal(img.parentElement,host.firstElementChild);assert.equal(requests,0);assert.equal(JSON.stringify(job),before);
 assert.equal(window.VectaHaynesJobTools.genericImage({make:'Ford',model:'Qashqai'}),null);
 assert.equal(window.VectaHaynesJobTools.genericImage({vehicle:'No vehicle'}),null);
 assert.equal(window.VectaHaynesJobTools.genericImage({vehicle:'Nissan Qashqai',no_vehicle:true}),null);
 assert.equal(window.VectaHaynesJobTools.genericImage({vehicle:'Nissan Juke'}),null);
 assert.equal(window.VectaHaynesJobTools.vehicleLink(window.VectaHaynesJobTools.genericImage(job)),'');
});
test('unavailable registration keeps generic artwork; generic invoice image preserves vehicle text and totals',async()=>{
 const {window,document}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));window.fetch=async()=>{throw Error('offline');};
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="fallback"><div class="mobileJobTop">Qashqai</div></div>';document.body.appendChild(host);
 window.enrichHaynesDashboard(host,[{id:'fallback',registration:'AB12XYZ',vehicle:'Nissan Qashqai'}]);await new Promise(r=>setImmediate(r));assert.equal(host.querySelector('img').dataset.generic,'true');
 const sheet=document.createElement('div');sheet.innerHTML='<div class="invoicePrintHeader"><div>VECTA</div><div class="printTitle">INVOICE</div></div><div class="printInvoiceVehicle"><div class="printVehicleCell">Plate</div><div class="printVehicleCell"><b>My Qashqai description</b></div></div><div class="printTotals">£120.00</div>';
 const inv={registration:'AB12XYZ',vehicle:'Nissan Qashqai',total:120},before=JSON.stringify(inv);window.enrichHaynesInvoice(sheet,inv);assert.equal(sheet.querySelector('img').dataset.generic,'true');assert.equal(sheet.querySelector('b').textContent,'My Qashqai description');assert.equal(sheet.querySelector('.haynesInvoiceDetails'),null);assert.equal(sheet.querySelector('.printTotals').textContent,'£120.00');assert.equal(JSON.stringify(inv),before);
});
test('vehicle artwork remains available when timed card shrinks below one hour',async()=>{
 const {window,document}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));
 const host=document.createElement('div');host.innerHTML='<div class="job plannerJobCompact" data-job-id="short"><div class="plannerJobHeader"></div></div><div class="job miniPlannerTask" data-job-id="task"><div class="plannerJobHeader"></div></div>';document.body.appendChild(host);
 window.enrichHaynesDashboard(host,[{id:'short',registration:'FX69XWU',make:'Nissan'},{id:'task',registration:'FX69XWU',make:'Nissan',card_type:'mini_task'}]);
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 assert.equal(host.querySelector('.plannerJobCompact .haynesDashboardImage')?.alt,'Representative Nissan Qashqai');assert.equal(host.querySelector('.miniPlannerTask .haynesDashboardImage'),null);
});

test('existing generic model artwork avoids new technical lookups for dashboard decoration',async()=>{
 const {window,document}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));
 let calls=0;window.fetch=async()=>{calls++;throw Error('should not request Haynes');};
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="generic"></div>';document.body.append(host);
 window.enrichHaynesDashboard(host,[{id:'generic',registration:'AB12XYZ',make:'Nissan',model:'Qashqai',colour:'Grey'}]);
 for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
 assert.equal(calls,0);assert.equal(host.querySelector('img').dataset.generic,'true');
});
test('daily allowance stops background attempts for other registrations while cached data remains usable',async()=>{
 const {window}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));
 let calls=0;window.fetch=async()=>{calls++;return {ok:true,json:async()=>({status:'DAILY_LIMIT'})};};
 await window.VectaHaynesJobTools.lookup('AB12XYZ');await window.VectaHaynesJobTools.lookup('CD34XYZ');
 assert.equal(calls,1);assert.equal((await window.VectaHaynesJobTools.lookup(vehicle.registration)).model,'Qashqai');
});

test('timed text follows the rendered car width after loading, resizing and artwork changes',()=>{
 const {window,document}=setup(async()=>response(vehicle));
 let notify,disconnected=false;
 window.ResizeObserver=class{constructor(fn){notify=fn;}observe(){}disconnect(){disconnected=true;}};
 window.VectaHaynesJobTools.remember(vehicle);
 const host=document.createElement('div');
 host.innerHTML='<div class="job plannerJobFull" data-job-id="1"><div class="plannerJobHeader"></div></div>';
 document.body.append(host);
 window.enrichHaynesDashboard(host,[{id:'1',registration:vehicle.registration,make:'Nissan'}]);
 const card=host.querySelector('.job'),img=host.querySelector('img');
 let height=90;
 img.getBoundingClientRect=()=>({width:162,height});
 Object.defineProperties(img,{naturalWidth:{value:299,configurable:true},naturalHeight:{value:220,configurable:true}});
 img.dispatchEvent(new window.Event('load'));
 assert.equal(card.style.getPropertyValue('--planner-vehicle-text-inset'),'135px');
 height=42;notify();
 assert.equal(card.style.getPropertyValue('--planner-vehicle-text-inset'),'70px');
 Object.defineProperty(img,'naturalWidth',{value:1000});height=90;
 img.dispatchEvent(new window.Event('load'));
 assert.equal(card.style.getPropertyValue('--planner-vehicle-text-inset'),'174px');
 img.remove();notify();assert.equal(disconnected,true);
 delete window.ResizeObserver;
});

test('job header retains saved artwork on image failure and hides for no-vehicle jobs',async()=>{
 const {document}=setup(async()=>response(vehicle),(name,colour)=>'<svg aria-label="Generic '+name+'" data-colour="'+colour+'"></svg>');
 await new Promise(r=>setImmediate(r));
 const picture=document.querySelector('.jobCardHeaderVehicle');assert.ok(picture.parentElement.classList.contains('hasJobCardVehicle'));assert.ok(picture.parentElement.classList.contains('hasHeaderVehicleDetails'));
 const img=picture.querySelector('img');assert.equal(img.src,vehicle.imageUrl);assert.equal(img.dataset.registration,'FX69XWU');
 img.onerror();assert.equal(picture.querySelector('svg'),null);assert.equal(picture.querySelector('img'),img);
 const noVehicle=document.querySelector('#job_no_vehicle');noVehicle.checked=true;noVehicle.dispatchEvent(new document.defaultView.Event('change'));assert.equal(picture.hidden,true);
});

test('simultaneous colour consumers share one request and cached colours are reused',async()=>{
 const {window}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));
 window.VectaVehicleImage={resolveColour:(_reg,c)=>c,colourHex:c=>c==='Green'?'#204c36':''};
 let complete,calls=0;window.fetch=async()=>{calls++;await new Promise(r=>complete=r);return {ok:true,json:async()=>({registration:vehicle.registration,make:'Nissan',primaryColour:'Green'})};};
 const job={registration:vehicle.registration,make:'Nissan'};
 const a=window.VectaHaynesJobTools.lookupDashboardColour(job),b=window.VectaHaynesJobTools.lookupDashboardColour({...job,registration:'FX69 XWU'});
 assert.equal(calls,1);complete();await Promise.all([a,b]);
 assert.equal(window.VectaHaynesJobTools.dashboardColour(job),'Green');await window.VectaHaynesJobTools.lookupDashboardColour(job);assert.equal(calls,1);
});

test('shared vehicle snapshot retains full description for service sheets',async()=>{
 const {window}=setup(async()=>response({...vehicle,vehicle:'Nissan Qashqai 1.7 dCi'}));await new Promise(r=>setImmediate(r));
 const result=await window.VectaHaynesJobTools.lookup(vehicle.registration);assert.equal(result.vehicle,'Nissan Qashqai 1.7 dCi');
});

test('a colour learned by the vehicle-details page prevents a separate decorative lookup',async()=>{
 const {window}=setup(async()=>response(vehicle));await new Promise(r=>setImmediate(r));
 window.VectaVehicleImage={resolveColour:(_reg,c)=>c,colourHex:c=>c==='Blue'?'#1c4778':''};
 let calls=0;window.fetch=async()=>{calls++;throw Error('must use cached colour');};
 assert.equal(window.VectaHaynesJobTools.rememberLookupColour({registration:vehicle.registration,make:'Nissan',primaryColour:'Blue'}),true);
 await window.VectaHaynesJobTools.lookupDashboardColour({registration:vehicle.registration,make:'Nissan'});
 assert.equal(calls,0);assert.equal(window.VectaHaynesJobTools.dashboardColour({registration:vehicle.registration,make:'Nissan'}),'Blue');
 assert.equal(window.VectaHaynesJobTools.dashboardColour({registration:vehicle.registration,make:'Ford'}),'');
});

test('unknown models get an immediate local generic picture and a separate plate-height mobile badge',async()=>{
 const {window,document}=setup(async()=>({ok:false,json:async()=>({status:'OFFLINE'})}),()=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 130"><path d="M10 10h100v50z"/></svg>');
 window.VectaVehicleImage={manufacturer:()=> 'toyota',mount:()=>Promise.resolve(),resolveColour:(_r,c)=>c,colourHex:()=>''};
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="unknown"><div class="mobileJobTop"><span class="plannerPlateWrap"><span class="ukPlate">AB12XYZ</span></span><span class="mobileVehicleTop">Toyota Yaris</span></div></div>';document.body.append(host);
 window.enrichHaynesDashboard(host,[{id:'unknown',registration:'AB12XYZ',make:'Toyota',vehicle:'Toyota Yaris'}]);
 const image=host.querySelector('.haynesDashboardImage');assert.match(image.src,/^data:image\/svg/);assert.equal(image.dataset.generic,'true');
 const badge=host.querySelector('.mobileManufacturerBadge');assert.equal(badge.parentElement,host.querySelector('.mobileJobTop'));assert.equal(badge.previousElementSibling.className,'plannerPlateWrap');assert.equal(badge.style.height,'30px');
 await new Promise(r=>setTimeout(r,20));assert.ok(host.querySelector('.haynesDashboardImage'));host.remove();
});


test('quote cards receive cached artwork alongside unallocated cards without waiting for a lookup',()=>{
 const {window,document}=setup(async()=>response(vehicle));window.VectaHaynesJobTools.remember(vehicle);
 const host=document.createElement('div');host.innerHTML='<div class="sideJob unallocatedSideJob" data-open-unallocated="unallocated"></div><div class="sideJob unallocatedSideJob quoteCard" data-open-job="quote"></div>';document.body.appendChild(host);
 window.enrichHaynesDashboard(host,[{id:'unallocated',registration:vehicle.registration,make:'Nissan'},{id:'quote',registration:vehicle.registration,make:'Nissan',status:'quote'}]);
 assert.equal(host.querySelectorAll('.haynesDashboardImage').length,2);assert.ok(host.querySelector('.quoteCard.hasHaynesDashboardImage img'));assert.ok(host.querySelector('[data-open-unallocated] img'));
});
test('placeholder registrations reuse fleet model artwork without inventing vehicle identity',()=>{
 const {window}=setup(async()=>response(vehicle));const stored={make:'Nissan',model:'Navara',imageUrl:vehicle.imageUrl};
 window.VectaFleetImages.modelArtwork=model=>model==='Navara'?stored:null;
 const drawing=window.VectaHaynesJobTools.genericImage({registration:'RESCUE2',vehicle:'Navara'});
 assert.equal(drawing.imageUrl,vehicle.imageUrl);assert.equal(drawing.generic,true);assert.equal(drawing.typeId,undefined);
 assert.equal(window.VectaHaynesJobTools.genericImage({vehicle:'Navara',make:'Ford'}),null);
});


test('direct Haynes links retain the matched variant identifier and confirmed CM14 KEL link',()=>{
 const {window}=setup(async()=>response(vehicle));
 const tools=window.VectaHaynesJobTools;
 assert.equal(tools.vehicleLink({...vehicle,ktypNr:'148229'}),'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_301000368&ktypNr=148229');
 assert.equal(tools.vehicleLink({...vehicle,registration:'CM14 KEL',typeId:'t_619108899'}),'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_619108899&ktypNr=148229');
 assert.equal(tools.vehicleLink({...vehicle,ktypNr:'148229&evil=1'}),'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_301000368');
});


test('new job header reuses permanent matched artwork after the daily lookup cache expires',()=>{
 const saved={...vehicle,fetchedAt:new Date(Date.now()-3*86400000).toISOString()};
 let requests=0;const {document}=setup(async()=>{requests++;throw Error('unexpected lookup');},undefined,[saved]);
 const img=document.querySelector('.jobCardHeaderVehicle img');
 assert.ok(img);assert.equal(img.src,vehicle.imageUrl);assert.equal(img.dataset.registration,vehicle.registration);assert.equal(requests,0);
});
test('typing a registration never submits a decorative lookup; the explicit button uses the complete Irish plate',async()=>{
 const calls=[],s=setup(async url=>{calls.push(url);return response(vehicle);});await new Promise(r=>setImmediate(r));calls.length=0;
 const input=s.document.querySelector('#job_registration');input.value='WGZ73';input.dispatchEvent(new s.window.Event('input'));
 await new Promise(r=>setTimeout(r,800));assert.equal(calls.length,0);
 input.value='WGZ7396';input.dispatchEvent(new s.window.Event('input'));
 await new Promise(r=>setTimeout(r,800));assert.equal(calls.length,0);await lookupButton(s.panel).onclick();assert.equal(calls.length,1);assert.match(calls[0],/reg=WGZ7396/);
});

test('opening and editing a job never starts a decorative lookup when no image is cached',async()=>{
 let calls=0;const s=setup(async()=>{calls++;return response(vehicle);},undefined,undefined,false);await new Promise(r=>setImmediate(r));assert.equal(calls,0);
 const input=s.document.querySelector('#job_registration');input.value='J321 WPC';input.dispatchEvent(new s.window.Event('change'));await new Promise(r=>setTimeout(r,800));assert.equal(calls,0);
});

test('mechanics place editable contacts left of the dedicated large artwork and retain hidden pricing inputs',()=>{
 const {document}=setup(async()=>response(vehicle),undefined,undefined,false,'',true);
 assert.ok(document.querySelector('.jobModalCard').classList.contains('mechanicJobCard'));
 assert.equal(document.querySelector('.jobContactSection').parentElement,document.querySelector('.jobCardHeaderDetails'));
 assert.equal(document.querySelector('.jobCardHeaderVehicle').parentElement,document.querySelector('.jobModalHead'));
 assert.equal(document.querySelector('.haynesJobTools').parentElement,document.querySelector('.jobModalHead'));
 assert.ok(document.querySelector('.privatePricingSection'),'retained for the existing gather/save pipeline');
 assert.ok(document.querySelector('.jobWorkSection'));
});
test('compact vehicle facts preserve the hidden vehicle and mileage across due-date refreshes',()=>{
 const {document}=setup(async()=>response(vehicle),undefined,undefined,false,'<div class="field"><label>Vehicle</label><input id="job_vehicle" value="Qashqai"></div><div class="field"><label>Last MOT mileage</label><input id="job_mileage" value="60210"></div><div id="jobVehicleDuePanel"><div>MOT</div></div>');
 assert.equal(document.querySelector('#job_vehicle').closest('.field').hidden,true);
 assert.equal(document.querySelector('#job_vehicle').value,'Qashqai');
 const due=document.querySelector('#jobVehicleDuePanel'),mileage=document.querySelector('#job_mileage');
 assert.equal(due.nextElementSibling,mileage.closest('.field'));
 due.innerHTML='<div>Refreshed MOT</div>';
 assert.equal(mileage.value,'60210');assert.equal(mileage.isConnected,true);

});
