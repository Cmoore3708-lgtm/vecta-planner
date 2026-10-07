import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8');
const vehicle={registration:'FX69XWU',make:'Nissan',model:'Qashqai',variant:'1.7 dCi',typeId:'t_301000368',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg',fetchedAt:new Date().toISOString()};
function setup(fetcher){const {window,document}=parseHTML('<html><body><div id="modal"><section class="jobVehicleSection"><input id="job_registration" value="FX69 XWU"><input id="job_make" value="Nissan"><input type="checkbox" id="job_no_vehicle"></section><button id="save">Save</button></div></body></html>');window.fetch=fetcher;vm.runInNewContext(source,{window,document,AbortController,setTimeout,clearTimeout,encodeURIComponent});window.initHaynesJobTools(document.querySelector('#modal'));return {window,document,panel:document.querySelector('.haynesJobTools')};}
const response=v=>({ok:true,json:async()=>({status:'MATCHED',vehicle:v})});
test('actual job-editor integration passes a defined modal element to Haynes tools',()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');let calls=0;
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  const ast=parse(match[1],{sourceType:'script'});traverse(ast,{CallExpression(path){const c=path.node.callee;if(c.type!=='MemberExpression'||c.property.name!=='initHaynesJobTools')return;calls++;const arg=path.node.arguments[0];assert.equal(arg.type,'Identifier');const binding=path.scope.getBinding(arg.name);assert.ok(binding,'Job-card integration uses undefined '+arg.name);assert.equal(binding.path.node.init?.callee?.property?.name,'getElementById');assert.equal(binding.path.node.init.arguments[0].value,'jobModal');}});
 }assert.equal(calls,1);
});
test('opening an existing job automatically looks up and displays its image without a separate click',async()=>{
 let requests=0;const {panel}=setup(async()=>{requests++;return response(vehicle);});await new Promise(r=>setImmediate(r));assert.equal(requests,1);assert.equal(panel.querySelector('img')?.src,vehicle.imageUrl);assert.match(panel.textContent,/Open this vehicle/);
});
test('real mobile planner card receives its image and shares one lookup with desktop',async()=>{
 let requests=0;const {window,document}=setup(async()=>{requests++;return response(vehicle);});
 const host=document.createElement('div');host.innerHTML='<div class="mobileJob" data-open-job="1"><div class="mobileJobTop">FX69 XWU</div></div><div class="job plannerJobFull" data-job-id="1"><div class="plannerJobHeader"><div class="plannerJobLeft">FX69 XWU</div><div class="plannerJobRightText">Service</div></div></div>';document.body.appendChild(host);
 window.enrichHaynesDashboard(host,[{id:'1',registration:'FX69XWU',make:'Nissan'}]);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert.equal(requests,1);assert.equal(host.querySelectorAll('.haynesDashboardImage').length,2);assert.match(host.textContent,/FX69 XWU/);assert.equal(host.querySelector('.mobileJobTop').lastElementChild.className,'haynesDashboardImage');assert.equal(host.querySelector('.plannerJobHeader').lastElementChild.className,'haynesDashboardImage');
});
test('unconfigured preview reports the actual lookup issue instead of silently showing an empty image area',async()=>{
 const {panel}=setup(async()=>({ok:true,json:async()=>({status:'NOT_CONFIGURED'})}));await new Promise(r=>setImmediate(r));assert.match(panel.textContent,/not configured for this preview/);assert.equal(panel.querySelector('img'),null);
});
test('confirmed vehicle opens a fixed supplier URL, hides broken images and leaves save intact',async()=>{
 const {document,panel}=setup(async()=>response(vehicle));await panel.querySelector('button').onclick();
 const link=panel.querySelector('a');assert.equal(link.href,'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_301000368');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
 assert.match(panel.textContent,/Nissan Qashqai/);panel.querySelector('img').onerror();assert.equal(panel.querySelector('img'),null);assert.equal(document.querySelector('#save').textContent,'Save');
});
test('invoice receives confirmed image and details without modifying amounts; fleet strips stay unchanged',()=>{
 const {window,document}=setup(async()=>response(vehicle));window.VectaHaynesJobTools.remember(vehicle);
 const sheet=document.createElement('div');sheet.innerHTML='<div class="printInvoiceVehicle"><div class="printVehicleCell">Plate</div><div class="printVehicleCell"><b>Nissan</b></div></div><div class="printTotals">£120.00</div>';document.body.appendChild(sheet);
 const inv={registration:'FX69 XWU',subtotal:100,vat:20,total:120},before=JSON.stringify(inv);window.enrichHaynesInvoice(sheet,inv);assert.equal(sheet.querySelector('.haynesInvoiceImage').src,vehicle.imageUrl);assert.match(sheet.textContent,/Qashqai/);assert.equal(sheet.querySelector('.printTotals').textContent,'£120.00');assert.equal(JSON.stringify(inv),before);
 const fleet=document.createElement('div');fleet.innerHTML='<div>Fleet account</div>';window.enrichHaynesInvoice(fleet,{registration:'FLEET ACCOUNT'});assert.equal(fleet.querySelector('img'),null);
});
test('dashboard decorates full cards only, preserves duration and drag attributes and rejects another make',()=>{
 const {window,document}=setup(async()=>response(vehicle));window.VectaHaynesJobTools.remember(vehicle);const host=document.createElement('div');host.innerHTML='<div class="job plannerJobFull" draggable="true" data-job-id="1" style="height:100px"><div class="plannerJobHeader"><div class="plannerJobLeft">FX69 XWU</div><div class="plannerJobRightText">Service</div></div></div><div class="job plannerJobCompact" data-job-id="2"><div class="plannerJobHeader"><div class="plannerJobLeft">FX69 XWU</div><div class="plannerJobRightText">Service</div></div></div>';document.body.appendChild(host);window.enrichHaynesDashboard(host,[{id:'1',registration:'FX69XWU',make:'Nissan'},{id:'2',registration:'FX69XWU'}]);assert.equal(host.querySelectorAll('img').length,1);assert.equal(host.querySelector('[data-job-id="1"]').style.height,'100px');assert.equal(host.querySelector('[data-job-id="1"]').getAttribute('draggable'),'true');assert.equal(window.VectaHaynesJobTools.snapshot('FX69XWU','Ford'),null);
});
test('snapshot cache drops unsafe fields, rejects stale results and survives storage failure',()=>{
 const {window}=setup(async()=>response(vehicle));window.localStorage={setItem(){throw Error('full');}};const tools=window.VectaHaynesJobTools;assert.ok(tools.remember({...vehicle,vin:'private',cookie:'secret'}));assert.equal(tools.snapshot(vehicle.registration).vin,undefined);assert.equal(tools.snapshot(vehicle.registration).cookie,undefined);assert.equal(tools.remember({...vehicle,registration:'OTHER',fetchedAt:'2020-01-01T00:00:00Z'}),undefined);assert.equal(tools.snapshot('OTHER'),null);
});
test('wrong registration, conflicting make and invalid vehicle ID cannot expose technical links',async()=>{
 for(const wrong of [{...vehicle,registration:'OTHER'},{...vehicle,make:'Ford'},{...vehicle,typeId:'https://evil.test'}]){const {panel}=setup(async()=>response(wrong));await panel.querySelector('button').onclick();assert.equal(panel.querySelector('a'),null);assert.match(panel.textContent,/uncertain/);}
});
test('late response cannot attach another vehicle to an edited or closed job',async()=>{
 let finish;const pending=new Promise(r=>finish=r),{document,window,panel}=setup(()=>pending);const running=panel.querySelector('button').onclick();const input=document.querySelector('#job_registration');input.value='OTHER';input.dispatchEvent(new window.Event('input'));finish(response(vehicle));await running;assert.equal(panel.querySelector('a'),null);
 let finish2;const second=setup(()=>new Promise(r=>finish2=r)),run2=second.panel.querySelector('button').onclick();second.panel.remove();finish2(response(vehicle));await run2;assert.equal(second.panel.querySelector('a'),null);
});
test('no-vehicle jobs and unsafe images fail closed; unavailable lookup never changes vehicle fields',async()=>{
 const {document,window,panel}=setup(async()=>{throw Error('offline');});await panel.querySelector('button').onclick();assert.match(panel.textContent,/still save/);assert.equal(document.querySelector('#job_registration').value,'FX69 XWU');const toggle=document.querySelector('#job_no_vehicle');toggle.checked=true;toggle.dispatchEvent(new window.Event('change'));assert.equal(panel.querySelector('button').disabled,true);assert.equal(window.VectaHaynesJobTools.safeImage('https://evil.test/car.png'),'');
});
