import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8');
const vehicle={registration:'FX69XWU',make:'Nissan',model:'Qashqai',variant:'1.7 dCi',typeId:'t_301000368',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg'};
function setup(fetcher){const {window,document}=parseHTML('<html><body><div id="modal"><section class="jobVehicleSection"><input id="job_registration" value="FX69 XWU"><input id="job_make" value="Nissan"><input type="checkbox" id="job_no_vehicle"></section><button id="save">Save</button></div></body></html>');window.fetch=fetcher;vm.runInNewContext(source,{window,document,AbortController,setTimeout,clearTimeout,encodeURIComponent});window.initHaynesJobTools(document.querySelector('#modal'));return {window,document,panel:document.querySelector('.haynesJobTools')};}
const response=v=>({ok:true,json:async()=>({status:'MATCHED',vehicle:v})});
test('confirmed vehicle opens a fixed supplier URL, hides broken images and leaves save intact',async()=>{
 const {document,panel}=setup(async()=>response(vehicle));await panel.querySelector('button').onclick();
 const link=panel.querySelector('a');assert.equal(link.href,'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_301000368');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
 assert.match(panel.textContent,/Nissan Qashqai/);panel.querySelector('img').onerror();assert.equal(panel.querySelector('img'),null);assert.equal(document.querySelector('#save').textContent,'Save');
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
