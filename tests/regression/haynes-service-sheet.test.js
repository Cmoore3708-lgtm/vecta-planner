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
 const checkbox=sheet.querySelector('.ssHaynes [role="checkbox"]');checkbox.click();assert.equal(sheet.querySelector('.ssHaynes').getAttribute('data-confirmed'),'true');
 const saved=sheet.outerHTML;assert.match(saved,/5.9/);assert.match(saved,/data-confirmed="true"/);
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
