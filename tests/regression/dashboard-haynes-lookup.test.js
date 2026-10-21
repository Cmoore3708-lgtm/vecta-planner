import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML,DOMParser} from 'linkedom';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function installActualEditorBridge(window,document,editor){
 let bridge;
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  const code=match[1];
  traverse(parse(code,{sourceType:'script'}),{AssignmentExpression(path){
   const n=path.node;if(n.left.type!=='MemberExpression'||n.left.object.name!=='window'||n.left.property.name!=='openJobModal')return;
   const binding=path.scope.getBinding('openJobModal');if(binding?.path.node.type!=='FunctionDeclaration')return;
   assert.equal(binding.path.node.id.name,'openJobModal');
   bridge=code.slice(n.start,n.end);
  }});
 }
 assert.ok(bridge,'The core job editor must be exported from its own scope');
 const context={window,document,openJobModal:editor};
 vm.runInNewContext(bridge,context);
}

const src=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8');
const module=src.slice(src.indexOf('/* Dashboard registration lookup:'));
function setup(fetch){const {window,document}=parseHTML('<html><body><header class="top"><h1>Dashboard</h1><div class="plannerGlobalSearchWrap"></div></header></body></html>');const create=document.createElement.bind(document);document.createElement=n=>{const el=create(n);if(n==='dialog')el.showModal=()=>{};return el;};window.fetch=fetch;window.VectaHaynesJobTools={remember:v=>v,vehicleLink:()=> 'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_123',safeImage:()=>'',lookup:async reg=>{const cached=window.VectaHaynesJobTools.snapshot?.(reg);if(cached)return cached;const d=await (await window.fetch('/api/haynes-vehicle?reg='+encodeURIComponent(reg))).json();window.VectaHaynesJobTools.lookupStatus=()=>d.status;return d.status==='MATCHED'?d.vehicle:null;}};let preset;installActualEditorBridge(window,document,(id,p)=>preset=p);vm.runInNewContext(module,{window,document,AbortController,URLSearchParams,setTimeout,clearTimeout,Date});window.VectaHaynesDashboardLookup.install();return {window,document,preset:()=>preset};}
const vehicle={registration:'FX69XWU',make:'Nissan',model:'Qashqai',variant:'Diesel',typeId:'t_123'};
test('lookup plate sits before global search and starts blank',()=>{const {document}=setup(()=>{});const form=document.getElementById('haynesDashboardLookup');assert.equal(form.nextElementSibling.className,'plannerGlobalSearchWrap');assert.equal(form.querySelector('input').value,'');assert.match(form.textContent,/GB/);});
test('matched lookup opens quote form with unallocated vehicle and no automatic save',async()=>{const {window,document,preset}=setup(async url=>({ok:true,json:async()=>url.includes('haynes-vehicle')?{status:'MATCHED',vehicle}:{registration:'FX69XWU'}}));await window.VectaHaynesDashboardLookup.openTechnical('fx69 xwu');const page=document.getElementById('haynesLookupPage');const form=page.querySelector('form');form.elements={mileage:{value:'120000'}};page.querySelector('[data-create="quote"]').onclick();assert.equal(preset().status,'quote');assert.equal(preset().registration,'FX69XWU');assert.equal(preset().mileage,120000);assert.equal(preset().technician,'Unallocated');assert.equal(document.getElementById('haynesLookupPage'),null);});
test('mismatched vehicle cannot enable creation buttons',async()=>{const {window,document}=setup(async()=>({ok:true,json:async()=>({status:'MATCHED',vehicle:{...vehicle,registration:'OTHER'}})}));await window.VectaHaynesDashboardLookup.openTechnical('FX69 XWU');assert.match(document.querySelector('[data-status]').textContent,/unavailable/);assert.equal(document.querySelector('[data-create]').hasAttribute('disabled'),true);});
test('last MOT mileage displays its own units and leaves current mileage blank',async()=>{const {window,document}=setup(async url=>({ok:true,json:async()=>url.includes('haynes-vehicle')?{status:'MATCHED',vehicle}:{registration:'FX69XWU',latestMileage:'120,000',latestMileageUnit:'mi',lastMotTestDate:'2026-09-20T10:00:00'}}));await window.VectaHaynesDashboardLookup.openTechnical('FX69 XWU');assert.equal(document.querySelector('[data-mot-mileage]').textContent,'120,000 miles');assert.match(document.querySelector('[data-mot-date]').textContent,/2026-09-20/);assert.equal(document.querySelector('[name="mileage"]').value,'');});

test('MOT mileage loads even when Haynes reaches its internal daily allowance',async()=>{
 const requests=[];const {window,document}=setup(async url=>{requests.push(url);return {ok:true,json:async()=>url.includes('haynes-vehicle')?{status:'DAILY_LIMIT'}:{registration:'FX69XWU',latestMileage:'54000',latestMileageUnit:'mi'}};});
 await window.VectaHaynesDashboardLookup.openTechnical('FX69XWU');
 assert.equal(requests.filter(x=>x.includes('vehicle-lookup')).length,1);
 assert.equal(document.querySelector('[data-mot-mileage]').textContent,'54,000 miles');
 assert.match(document.querySelector('[data-status]').textContent,/internal daily/);
 assert.equal(document.querySelector('[data-create]').hasAttribute('disabled'),true);
});
test('a cached Haynes identity avoids a fresh request while MOT data still loads',async()=>{
 const requests=[];const {window,document}=setup(async url=>{requests.push(url);return {ok:true,json:async()=>({registration:'FX69XWU'})};});
 window.VectaHaynesJobTools.snapshot=()=>vehicle;
 await window.VectaHaynesDashboardLookup.openTechnical('FX69XWU');
 assert.equal(requests.filter(x=>x.includes('haynes-vehicle')).length,0);
 assert.match(document.querySelector('[data-identity]').textContent,/Qashqai/);
 assert.equal(document.querySelector('[data-mot-mileage]').textContent,'Not available');
});
test('Create Job uses the production editor bridge and preserves the looked-up vehicle',async()=>{const {window,document,preset}=setup(async url=>({ok:true,json:async()=>url.includes('haynes-vehicle')?{status:'MATCHED',vehicle}:{registration:vehicle.registration}}));await window.VectaHaynesDashboardLookup.openTechnical(vehicle.registration);const page=document.getElementById('haynesLookupPage');page.querySelector('form').elements={mileage:{value:'85000'}};page.querySelector('[data-create="job"]').onclick();assert.equal(preset().status,'booked');assert.equal(preset().registration,vehicle.registration);assert.equal(preset().vehicle,'Nissan Qashqai');assert.equal(preset().mileage,85000);assert.equal(document.getElementById('haynesLookupPage'),null);});

test('vehicle colour applies with independent MOT and Haynes responses in either order',async()=>{
 for(const first of ['mot','haynes']){
  const resolves={};const {window,document}=setup(url=>new Promise(resolve=>{resolves[url.includes('haynes-vehicle')?'haynes':'mot']=resolve;}));
  window.VectaHaynesJobTools.safeImage=()=>'/car.svg';
  const painted=[];window.VectaVehicleImage={resolveColour:(_reg,colour)=>colour,mount:host=>painted.push(host.querySelector('img').dataset.colour)};
  const opened=window.VectaHaynesDashboardLookup.openTechnical(vehicle.registration);
  const responses={mot:{registration:vehicle.registration,primaryColour:'Black'},haynes:{status:'MATCHED',vehicle}};
  const finish=key=>resolves[key]({ok:true,json:async()=>responses[key]});
  finish(first);await new Promise(resolve=>setImmediate(resolve));finish(first==='mot'?'haynes':'mot');await opened;
  assert.equal(document.querySelector('[data-identity] img').dataset.colour,'Black');assert.equal(painted.at(-1),'Black');
 }
});

test('late colour replaces a locked render and retains the supplier source and registration',async()=>{
 let finishMot;const {window,document}=setup(url=>url.includes('haynes-vehicle')?Promise.resolve({ok:true,json:async()=>({status:'MATCHED',vehicle})}):new Promise(resolve=>finishMot=resolve));
 const source='https://www.haynespro-assets.com/workshop/images/123.svgz';
 window.VectaHaynesJobTools.safeImage=()=>source;
 const painted=[];window.VectaVehicleImage={resolveColour:(_reg,colour)=>colour,mount:host=>{
  const img=host.querySelector('img');if(img.dataset.personalising)return;
  img.dataset.personalising='1';painted.push({img,colour:img.dataset.colour,registration:img.dataset.registration,source:img.dataset.vehicleSource});
  img.src='data:image/svg+xml,previous-render';
 }};
 const opened=window.VectaHaynesDashboardLookup.openTechnical(vehicle.registration);
 await new Promise(resolve=>setImmediate(resolve));
 const original=document.querySelector('[data-identity] img');
 finishMot({ok:true,json:async()=>({registration:vehicle.registration,primaryColour:'Red'})});await opened;
 const current=document.querySelector('[data-identity] img');
 assert.notEqual(current,original);assert.equal(original.isConnected,false);
 assert.equal(painted.at(-1).colour,'Red');assert.equal(painted.at(-1).registration,vehicle.registration);assert.equal(painted.at(-1).source,source);
});


test('CM14 KEL lookup renders green artwork with its front registration using the actual renderer',async()=>{
 for(const first of ['mot','haynes']){
  const resolves={};const tasks=[];
  const drawing='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 299 220"><g id="wheels"><path fill="#333333" d="M0 0"/></g><g id="transparant_colour"><path fill="#CCCCCC" d="M0 0"/></g><g id="windows"><path fill="#222222" d="M0 0"/></g></svg>';
  const {window,document}=setup(url=>url.includes('haynes-image')?Promise.resolve({ok:true,json:async()=>({svg:drawing})}):new Promise(resolve=>resolves[url.includes('haynes-vehicle')?'haynes':'mot']=resolve));
  window.Element.prototype.getBBox=function(){return this.id==='windows'?{x:90,y:62,width:167,height:36}:{x:26,y:59,width:247,height:110};};
  window.DOMParser=DOMParser;window.XMLSerializer=class{serializeToString(node){return node.outerHTML;}};window.AbortSignal=AbortSignal;
  vm.runInNewContext(readFileSync(new URL('../../public/js/vecta-vehicle-image.js',import.meta.url),'utf8'),{window,setTimeout,clearTimeout});
  const mount=window.VectaVehicleImage.mount;window.VectaVehicleImage.mount=host=>{const task=mount(host);tasks.push(task);return task;};
  const source='https://www.haynespro-assets.com/workshop/images/319106279.svgz';window.VectaHaynesJobTools.safeImage=()=>source;
  const opened=window.VectaHaynesDashboardLookup.openTechnical('CM14 KEL');
  const responses={mot:{registration:'CM14KEL',primaryColour:'Green'},haynes:{status:'MATCHED',vehicle:{...vehicle,registration:'CM14KEL',imageUrl:source}}};
  const finish=key=>resolves[key]({ok:true,json:async()=>responses[key]});
  finish(first);await new Promise(resolve=>setImmediate(resolve));await Promise.all(tasks);
  finish(first==='mot'?'haynes':'mot');await opened;await Promise.all(tasks);
  const img=document.querySelector('[data-identity] img');const rendered=new DOMParser().parseFromString(decodeURIComponent(img.src.split(',').slice(1).join(',')),'image/svg+xml');
  assert.equal(rendered.querySelector('#transparant_colour path').getAttribute('fill'),'#204c36');
  assert.equal(rendered.querySelector('#vecta-front-registration text').textContent,'CM14 KEL');
 }
});


test('job footer Cancel closes the editor without invoking save',()=>{
 assert.match(html,/<div class="modalFoot"><button type="button" class="btn" id="cancelJob">Cancel<\/button>/);
 const binding=html.match(/var cancelJobButton=m\.querySelector\('#cancelJob'\);if\(cancelJobButton\)cancelJobButton\.onclick=function\(\)\{closeModals\(\)\};/)[0];
 const button={};let closed=0;vm.runInNewContext(binding,{m:{querySelector:()=>button},closeModals:()=>closed++});
 button.onclick();assert.equal(closed,1);
});

test('dashboard service lookup returns schedules and loads the mechanic selection',async()=>{
 const schedules=[{id:'ms_10',label:'Time/distance dependent service, (- 2018) (United Kingdom)'},{id:'ms_11',label:'Longlife service, (- 2018) (United Kingdom)'}];
 const requests=[];
 const {window,document}=setup(async url=>{
  if(url.includes('haynes-vehicle'))return {ok:true,json:async()=>({status:'MATCHED',vehicle})};
  if(url.includes('vehicle-lookup'))return {ok:true,json:async()=>({registration:vehicle.registration})};
  const query=new URL(url,'https://example.test').searchParams;requests.push(query);
  const system=query.get('system');return {ok:true,json:async()=>({status:'MATCHED',result:system?{vehicle,mileage:50000,system,schedules,period:'mp_1',periods:[{id:'mp_1',label:'50,000 miles/48 months'}],schedule:'50,000 miles/48 months',conditions:schedules[1].label,oil:[{specification:'Selected Longlife oil'}],parts:['Selected filter'],additional:[]}:{kind:'schedule_choices',vehicle,mileage:50000,schedules}})};
 });
 await window.VectaHaynesDashboardLookup.openTechnical(vehicle.registration);
 const form=document.querySelector('[data-schedule-form]');const system=document.querySelector('[name="system"]');
 form.elements={mileage:{value:'50000'},period:document.querySelector('[name="period"]'),system};
 Object.defineProperty(system,'value',{value:'',writable:true});Object.defineProperty(form.elements.period,'value',{value:'',writable:true});
 await form.onsubmit({preventDefault(){}});
 assert.match(document.querySelector('[data-service]').textContent,/Choose the maintenance schedule/);
 assert.equal(system.querySelectorAll('option').length,3);
 assert.equal(requests[0].get('scheduleMode'),'choose');assert.equal(requests[0].get('system'),'');
 system.value='ms_11';await system.onchange();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests.at(-1).get('system'),'ms_11');assert.equal(requests.at(-1).get('period'),'');
 assert.match(document.querySelector('[data-service]').textContent,/Selected Longlife oil/);
});

test('generic supplier menus appear one after another without manufacturer-specific UI rules',async()=>{
 const menus=[{id:'hm_'+ '1'.repeat(24),label:'New manufacturer question',options:[{id:'ho_'+'1'.repeat(24),label:'Answer A'}]},{id:'hm_'+'2'.repeat(24),label:'Different follow-up question',options:[{id:'ho_'+'2'.repeat(24),label:'Answer B'}]}];
 const requests=[];
 const {window,document}=setup(async url=>{
  if(url.includes('haynes-vehicle'))return {ok:true,json:async()=>({status:'MATCHED',vehicle})};
  if(url.includes('vehicle-lookup'))return {ok:true,json:async()=>({registration:vehicle.registration})};
  const q=new URL(url,'https://example.test').searchParams,choices=JSON.parse(q.get('menuChoices'));requests.push(choices);
  return {ok:true,json:async()=>({status:'MATCHED',result:{kind:'menu_choice',menuFlow:'guided',vehicle,mileage:50000,menu:menus[choices.length],resetFrom:choices.length}})};
 });
 await window.VectaHaynesDashboardLookup.openTechnical(vehicle.registration);
 const form=document.querySelector('[data-schedule-form]');form.elements={mileage:{value:'50000'},system:document.querySelector('[name="system"]'),period:document.querySelector('[name="period"]')};
 for(const e of [form.elements.system,form.elements.period])Object.defineProperty(e,'value',{value:'',writable:true});
 await form.onsubmit({preventDefault(){}});assert.match(document.querySelector('[data-service]').textContent,/New manufacturer question/);
 await document.querySelector('[data-next-menu]').onchange({target:{value:menus[0].options[0].id}});
 assert.match(document.querySelector('[data-service]').textContent,/Different follow-up question/);
 assert.equal(requests[1][0].menu,menus[0].id);assert.equal(requests[1][0].option,menus[0].options[0].id);
});

test('normal conditions is selected automatically before the next manufacturer question',async()=>{
 const menus=[{id:'hm_'+ '1'.repeat(24),label:'New manufacturer question',options:[{id:'ho_'+'1'.repeat(24),label:'Normal conditions (United Kingdom)'}]},{id:'hm_'+'2'.repeat(24),label:'Different follow-up question',options:[{id:'ho_'+'2'.repeat(24),label:'Answer B'}]}];
 const requests=[];
 const {window,document}=setup(async url=>{
  if(url.includes('haynes-vehicle'))return {ok:true,json:async()=>({status:'MATCHED',vehicle})};
  if(url.includes('vehicle-lookup'))return {ok:true,json:async()=>({registration:vehicle.registration})};
  const q=new URL(url,'https://example.test').searchParams,choices=JSON.parse(q.get('menuChoices'));requests.push(choices);
  return {ok:true,json:async()=>({status:'MATCHED',result:{kind:'menu_choice',menuFlow:'guided',vehicle,mileage:50000,menu:menus[choices.length],resetFrom:choices.length}})};
 });
 await window.VectaHaynesDashboardLookup.openTechnical(vehicle.registration);
 const form=document.querySelector('[data-schedule-form]');form.elements={mileage:{value:'50000'},system:document.querySelector('[name="system"]'),period:document.querySelector('[name="period"]')};
 for(const e of [form.elements.system,form.elements.period])Object.defineProperty(e,'value',{value:'',writable:true});
 await form.onsubmit({preventDefault(){}});assert.match(document.querySelector('[data-service]').textContent,/Different follow-up question/);assert.equal(requests.length,2);
 assert.equal(requests[1][0].menu,menus[0].id);assert.equal(requests[1][0].option,menus[0].options[0].id);
});

test('successful service lookup recovers from failed vehicle lookup',async()=>{
 const menus=[{id:'hm_'+ '1'.repeat(24),label:'New manufacturer question',options:[{id:'ho_'+'1'.repeat(24),label:'Answer A'}]},{id:'hm_'+'2'.repeat(24),label:'Different follow-up question',options:[{id:'ho_'+'2'.repeat(24),label:'Answer B'}]}];
 const requests=[];
 const {window,document}=setup(async url=>{
  if(url.includes('haynes-vehicle'))return {ok:true,json:async()=>({status:'UNAVAILABLE'})};
  if(url.includes('vehicle-lookup'))return {ok:true,json:async()=>({registration:vehicle.registration})};
  const q=new URL(url,'https://example.test').searchParams,choices=JSON.parse(q.get('menuChoices'));requests.push(choices);
  return {ok:true,json:async()=>({status:'MATCHED',result:{kind:'menu_choice',menuFlow:'guided',vehicle,mileage:50000,menu:menus[choices.length],resetFrom:choices.length}})};
 });
 await window.VectaHaynesDashboardLookup.openTechnical(vehicle.registration);
 const form=document.querySelector('[data-schedule-form]');form.elements={mileage:{value:'50000'},system:document.querySelector('[name="system"]'),period:document.querySelector('[name="period"]')};
 for(const e of [form.elements.system,form.elements.period])Object.defineProperty(e,'value',{value:'',writable:true});
 await form.onsubmit({preventDefault(){}});assert.match(document.querySelector('[data-status]').textContent,/Vehicle matched/);assert.match(document.querySelector('[data-identity]').textContent,/Qashqai/);assert.match(document.querySelector('[data-service]').textContent,/New manufacturer question/);
 await document.querySelector('[data-next-menu]').onchange({target:{value:menus[0].options[0].id}});
 assert.match(document.querySelector('[data-service]').textContent,/Different follow-up question/);
 assert.equal(requests[1][0].menu,menus[0].id);assert.equal(requests[1][0].option,menus[0].options[0].id);
});

test('typing searches saved suggestions without starting duplicate Haynes requests',async()=>{
 const {window,document}=setup(async()=>({ok:true,json:async()=>({status:'MATCHED',vehicle})}));
 const requested=[];window.VectaHaynesJobTools.lookup=async registration=>{requested.push(registration);return vehicle;};
 const input=document.getElementById('haynesDashboardRegistration');input.setCustomValidity=()=>{};
 input.value='FX69XW';input.oninput({target:input});
 await new Promise(resolve=>setTimeout(resolve,680));assert.equal(requested.length,0);
 input.value='fx69 xwu';input.oninput({target:input});
 await new Promise(resolve=>setTimeout(resolve,680));assert.deepEqual(requested,[]);
 assert.equal(document.getElementById('haynesLookupPage'),null);
});
