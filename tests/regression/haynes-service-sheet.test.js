import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const source=readFileSync(new URL('../../public/js/haynes-service-sheet.js',import.meta.url),'utf8');
const vehicle={registration:'FX69XWU',vehicle:'NISSAN Qashqai (J11) 1.7 dCi',engineCode:'R9N-401',modelYears:'2018 - 2020',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg'};
const data={vehicle,mileage:50000,period:'mp_1',periods:[{id:'mp_1',label:'50,000 miles/48 months'}],conditions:'Normal conditions (United Kingdom)',parts:['Oil filter','Filter, cabin air'],additional:['Renew fuel filter every 37,500 miles/36 months'],oil:[{specification:'SAE 5W-30 · ACEA C3',capacity:'Engine sump, including filter 5.9 (l)',applicability:'Engine (except North America)'}],ageMonths:84,fetchedAt:'2026-10-06T10:00:00Z'};
function setup(service){const {document,window}=parseHTML('<html><body><div class="servicePrint"><div class="ssHeader"></div><div class="ssInfo"><span class="ssMileageEntry">50000</span></div><div class="ssFluidsHorizontal"><div class="ssField"></div><div class="ssField"></div></div></div></body></html>');const context={window,document,URLSearchParams,setTimeout,clearTimeout,console,fetch:async url=>({json:async()=>url.includes('supabase-config')?{haynesServiceTest:true}:url.includes('haynes-vehicle')?{status:'MATCHED',vehicle}:await service(url)})};vm.runInNewContext(source,context);return{document,window,sheet:document.querySelector('.servicePrint')};}
const settle=()=>new Promise(r=>setImmediate(r));
test('service sheet saves a supplier snapshot, preserves mechanic oil edits, and clears stale requirements immediately on mileage change',async()=>{
 const {document,window,sheet}=setup(async()=>({status:'MATCHED',result:data}));
 await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();
 assert.match(sheet.textContent,/SAE 5W-30/);assert.equal(sheet.querySelector('.ssHaynesVehicle img').getAttribute('src'),vehicle.imageUrl);
 assert.equal(sheet.querySelector('.ssField').textContent,data.oil[0].specification);
 assert.equal(sheet.querySelector('.ssHaynesConfirm'),null);assert.equal(sheet.querySelector('.ssHaynesOilReference'),null);
 const saved=sheet.outerHTML;assert.match(saved,/5.9/);assert.match(saved,/Scheduled parts/);
 sheet.querySelector('.ssField').textContent='Technician-approved alternative';
 const field=sheet.querySelector('.ssMileageEntry');field.textContent='60000';field.dispatchEvent(new window.Event('input'));
 assert.equal(sheet.querySelector('.ssHaynesData').textContent,'');assert.equal(sheet.querySelectorAll('.ssField')[1].textContent,'');assert.equal(sheet.querySelector('.ssField').textContent,'Technician-approved alternative');
 // Remove sheet before debounced refresh; a detached sheet cannot receive another vehicle's data.
 sheet.remove();await new Promise(r=>setTimeout(r,950));
});
test('late lookup response cannot populate a changed odometer reading',async()=>{
 let resolve;const response=new Promise(r=>{resolve=r;});const {window,sheet}=setup(()=>response);
 await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();
 sheet.querySelector('.ssMileageEntry').textContent='51000';resolve({status:'MATCHED',result:data});await settle();
 assert.equal(sheet.querySelector('.ssHaynesData').textContent,'');assert.equal(sheet.querySelector('.ssField').textContent,'');
});
test('changing mileage requests a fresh automatic interval and replaces the service parts',async()=>{
 const requests=[];
 const {window,sheet}=setup(async url=>{const q=new URL(url,'https://example.test').searchParams;requests.push({mileage:q.get('mileage'),period:q.get('period')});const miles=Number(q.get('mileage'));return {status:'MATCHED',result:{...data,mileage:miles,period:miles===50000?'mp_1':'mp_2',periods:[{id:'mp_2',label:'75,000 miles/72 months'}],parts:miles===50000?data.parts:['Oil filter','Fuel filter']}};});
 await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();
 const field=sheet.querySelector('.ssMileageEntry');field.textContent='75000';field.dispatchEvent(new window.Event('input'));
 assert.equal(sheet.querySelector('.ssHaynesData').textContent,'');
 await new Promise(r=>setTimeout(r,1000));await settle();
 assert.deepEqual(requests.at(-1),{mileage:'75000',period:''});
 assert.match(sheet.querySelector('.ssHaynesParts').textContent,/Fuel filter/);
 assert.doesNotMatch(sheet.querySelector('.ssHaynesParts').textContent,/cabin air/);
 assert.match(sheet.querySelector('.ssHaynesStatus').textContent,/75,000/);
 sheet.remove();
});
test('compact inspection layout moves existing fields without losing technician entries',async()=>{
 const {document,window,sheet}=setup(async()=>({status:'MATCHED',result:data}));
 const sections=document.createElement('div');sections.innerHTML='<div class="ssHealth"></div><div class="ssMeasureGrid"><section><span contenteditable="true">6mm</span></section><div class="ssRightStack"><section>Brake pads</section><section>Brake discs</section></div></div><div class="ssLower"><section>MOT advisory</section><section><span contenteditable="true">Mechanic note</span></section></div><div class="ssBottom"><div class="ssGuide">Condition guide</div></div>';
 sheet.appendChild(sections);const fields=[...sections.querySelectorAll('[contenteditable]')];
 await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();
 assert.equal(sheet.querySelector('.ssHealth .ssGuide').textContent,'Condition guide');
 assert.equal(sheet.querySelector('.ssHaynesLowerGrid').children.length,3);
 assert.ok(fields.every(field=>sheet.contains(field)));
 assert.equal(fields[1].textContent,'Mechanic note');sheet.remove();
});
test('Haynes marks scheduled filters as required without marking work completed and clears stale ticks',async()=>{
 const {document,window,sheet}=setup(async()=>({status:'MATCHED',result:{...data,additional:['Renew air filter every 37,500 miles/36 months']}}));
 const table=document.createElement('table');table.className='ssOps';table.innerHTML='<tr><th>Item</th><th>Completed</th></tr>'+['Interim service','Air filter','Pollen filter','Fuel filter'].map(label=>'<tr><td>'+label+'</td><td class="ssDone"><span class="ssCheck selected">✓</span></td></tr>').join('');sheet.appendChild(table);
 const completed=[...table.querySelectorAll('.ssCheck')];
 await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();
 const rows=[...table.querySelectorAll('tr')].slice(1);
 assert.deepEqual(rows.map(row=>row.querySelector('.ssHaynesRequired').textContent),['✓','','✓','']);
 assert.ok(completed.every(cell=>cell.classList.contains('selected')));
 const field=sheet.querySelector('.ssMileageEntry');field.textContent='60000';field.dispatchEvent(new window.Event('input'));
 assert.ok(rows.every(row=>row.querySelector('.ssHaynesRequired').textContent===''));
 assert.ok(completed.every(cell=>cell.classList.contains('selected')));sheet.remove();await new Promise(r=>setTimeout(r,950));
});

test('recommendations move to a separate saved page and clear when mileage changes',async()=>{
 const {window,sheet}=setup(async()=>({status:'MATCHED',result:data}));
 await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();
 const page=sheet.querySelector('.ssHaynesRecommendations');
 assert.ok(page);assert.equal(page.parentNode,sheet);
 assert.match(page.textContent,/FX69XWU.*50,000/);
 assert.match(page.textContent,/Renew fuel filter/);
 assert.doesNotMatch(sheet.querySelector('.ssHaynesData').textContent,/Renew fuel filter/);
 assert.match(sheet.outerHTML,/ssHaynesRecommendations/);
 sheet.querySelector('.ssMileageEntry').dispatchEvent(new window.Event('input'));
 assert.equal(sheet.querySelector('.ssHaynesRecommendations'),null);sheet.remove();
});

test('service image carries registration and job colour through the shared renderer even when schedule fails',async()=>{
 const {window,sheet}=setup(async()=>({status:'LOGIN_REQUIRED'}));
 window.app={jobs:[{id:'job-1',registration:'FX69XWU',vehicle_colour:'Blue'}]};sheet.setAttribute('data-job-id','job-1');
 const calls=[];
 window.VectaHaynesJobTools={remember(){},dashboardColour:j=>j.vehicle_colour,lookupDashboardColour:async()=>{}};
 window.VectaVehicleImage={mount:scope=>{const img=scope.querySelector('img');if(img)calls.push({reg:img.dataset.registration,colour:img.dataset.colour,source:img.dataset.haynesSource});}};
 await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();
 assert.ok(calls.length);assert.ok(calls.every(c=>c.reg==='FX69XWU'&&c.colour==='Blue'&&c.source===vehicle.imageUrl));
 assert.match(sheet.querySelector('.ssHaynesStatus').textContent,/Sign in to HaynesPro/);
 assert.equal(sheet.querySelector('.ssHaynesParts'),null);
 sheet.remove();
});

for(const [status,message] of [['OFFLINE',/worker is offline/],['WORKER_UPDATE_REQUIRED',/Update the Workshop PC/],['SCHEDULE_REQUIRED',/No supported UK service schedule/],['NOT_CONFIGURED',/not configured/]])test('service failure explains '+status,async()=>{
 const {window,sheet}=setup(async()=>({status}));await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();assert.match(sheet.querySelector('.ssHaynesStatus').textContent,message);assert.ok(sheet.querySelector('.ssHaynesRefresh'));sheet.remove();
});

test('required checkboxes are supplier-selected and do not change completed work',async()=>{
 const {document,window,sheet}=setup(async()=>({status:'MATCHED',result:data}));const table=document.createElement('table');table.className='ssOps';table.innerHTML='<tr><th>Item</th><th>Completed</th></tr><tr><td>Air filter</td><td><span class="ssCheck selected">✓</span></td></tr><tr><td>Pollen filter</td><td><span class="ssCheck"></span></td></tr>';sheet.append(table);
 await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();
 const required=table.querySelectorAll('.ssHaynesRequiredCheck');assert.equal(required[0].getAttribute('aria-checked'),'false');assert.equal(required[1].getAttribute('aria-checked'),'true');assert.equal(required[1].getAttribute('aria-disabled'),'true');assert.equal(table.querySelectorAll('td:last-child .ssCheck.selected').length,1);sheet.remove();
});

test('mileage selection corrects an older worker age-selected schedule before displaying parts',async()=>{
 const requests=[];const periods=[{id:'mp_126',label:'126,000 miles/84 months'},{id:'mp_162',label:'162,000 miles/108 months'}];
 const {window,sheet}=setup(async url=>{const q=new URL(url,'https://example.test').searchParams;requests.push(q.get('period'));return {status:'MATCHED',result:{...data,mileage:121023,period:q.get('period')||'mp_162',periods}};});
 sheet.querySelector('.ssMileageEntry').textContent='121023';
 // Return the exact requested odometer, rather than the generic fixture mileage.
 await window.initHaynesServiceSheet(sheet,'FX69XWU','service');await settle();await settle();assert.deepEqual(requests,['','mp_126']);assert.match(sheet.querySelector('.ssHaynesParts').textContent,/Oil filter/);sheet.remove();
});

test('All Green marks the three top-ups without marking replacements or completed operations',()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');const source=html.slice(html.indexOf('function tickAllServiceGreen()'),html.indexOf('\n',html.indexOf('function tickAllServiceGreen()')));
 const {document,window}=parseHTML('<div id="printSheet"><div class="servicePrint" data-sheet-type="service"><span class="ssRagDot red selected" data-group="brakes"></span><span class="ssRagDot green" data-group="brakes"></span>'+['Brake Fluid','Coolant','Screenwash'].map(x=>'<span class="ssHaynesTopUp" aria-label="'+x+' topped up"></span><span class="ssHaynesTopUp ssHaynesReplaced"></span>').join('')+'<span class="ssCheck"></span></div></div>');
 const context={document,updateServiceHealthScore(){}};vm.runInNewContext(source,context);context.tickAllServiceGreen();assert.equal(document.querySelectorAll('.ssHaynesTopUp.selected').length,3);assert.equal(document.querySelectorAll('.ssHaynesReplaced.selected,.ssCheck.selected').length,0);assert.equal(document.querySelectorAll('.ssRagDot.green.selected').length,1);
});

test('Save closes paperwork and returns to its linked job only after successful persistence',async()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8'),start=html.indexOf('async function saveServiceSheetAndClose()'),source=html.slice(start,html.indexOf('\n',start));
 for(const success of [false,true]){const actions=[];const context={activeServiceJobId:'job-1',app:{jobs:[{id:'job-1'}]},saveServiceSheet:async()=>{actions.push('save');return success;},closeServicePreview:()=>actions.push('close'),openJobModal:id=>actions.push(id)};vm.runInNewContext(source,context);await context.saveServiceSheetAndClose();assert.deepEqual(actions,success?['save','close','job-1']:['save']);}
});

test('print freezes the personalised image at high resolution and restores its source afterwards',async()=>{
 const {document,window,sheet}=setup(async()=>({status:'OFFLINE'}));const picture=document.createElement('div');picture.className='ssHaynesVehicle';const img=document.createElement('img');img.src='data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E';picture.append(img);sheet.append(picture);Object.defineProperty(img,'naturalWidth',{value:299});Object.defineProperty(img,'naturalHeight',{value:220});img.decode=async()=>{};
 let draws=0,canvas;const create=document.createElement.bind(document);document.createElement=name=>{if(name!=='canvas')return create(name);canvas={getContext:()=>({drawImage:()=>draws++}),toDataURL:()=>'data:image/png;base64,test'};return canvas;};
 const original=img.src;await window.prepareHaynesServicePrint(sheet);assert.equal(draws,1);assert.ok(canvas.width>=1200);assert.match(img.src,/^data:image\/png/);window.dispatchEvent(new window.Event('afterprint'));assert.equal(img.src,original);assert.equal(img.dataset.printSnapshot,undefined);sheet.remove();
});
