import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync('public/js/vecta-job-mot-advisories.js','utf8');
const html='<main><input id="job_registration"><input type="checkbox" id="job_no_vehicle"><div class="field"><label>Last MOT mileage</label><input type="number" id="job_mileage" value="64000"></div><input id="job_current_mileage" value="65123"><section class="jobMotAdvisories"><div data-mot-history-body></div></section></main>';
const tests=[
 {completedDate:'2024-04-08',testResult:'PASSED',defects:[{type:'ADVISORY',text:'Older test only'}]},
 {completedDate:'2025-04-10',testResult:'FAILED',defects:[{type:'MAJOR',text:'Major defect'},{type:'ADVISORY',text:'Rear tyre worn <inside>'},{type:'MINOR',text:'Minor defect'}]}
];
function setup(job,fetchVehicle,{online=true,records=[],store=new Map()}={}){
 const {document,window}=parseHTML(html),modal=document.querySelector('main');
 const input=modal.querySelector('#job_registration');input.value=job.registration;
 const timers=new Map(),navigator={onLine:online};let id=0;
 vm.runInNewContext(source,{window,document,navigator,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},setTimeout(fn){timers.set(++id,fn);return id},clearTimeout:i=>timers.delete(i)});
 const mount=()=>window.VectaJobMotAdvisories.mount(modal,job,{fetchVehicle,localRecords:records});
 mount();
 return {input,window,mount,document,navigator,mileage:modal.querySelector('#job_last_mot_mileage'),body:()=>modal.querySelector('[data-mot-history-body]').textContent,async flush(){const pending=[...timers.values()];timers.clear();await Promise.all(pending.map(f=>f()))}};
}
test('every fresh card shows advisories from the latest test, even after a failed MOT; reopening uses the recent result',async()=>{
 let count=0;const t=setup({registration:'AB12 CDE'},async()=>{count++;return {registration:'AB12CDE',motTests:tests}});
 await t.flush();t.mount();await t.flush();assert.equal(count,1);
 assert.match(t.body(),/10\/04\/2025.*Rear tyre worn <inside>/);
 assert.doesNotMatch(t.body(),/Older test|Major defect|Minor defect/);
});
test('no MOT history, a clear latest MOT, and an unavailable lookup render different messages',async()=>{
 const none=setup({registration:'AB12CDE'},async()=>({motTests:[]}));await none.flush();assert.match(none.body(),/No MOT test history/);
 const clear=setup({registration:'AB12CDE'},async()=>({motTests:[tests[0],{completedDate:'2026-10-10',defects:[]}]}));await clear.flush();assert.match(clear.body(),/No advisories/);assert.doesNotMatch(clear.body(),/Older test/);
 const unavailable=setup({registration:'AB12CDE'},async()=>{throw Error('offline')});await unavailable.flush();assert.match(unavailable.body(),/unavailable/);assert.doesNotMatch(unavailable.body(),/No advisories/);
});
test('saved advisories on another job are available offline only for the matching registration',async()=>{
 const t=setup({registration:'AB12 CDE'},()=>assert.fail('Offline lookup'),{online:false,records:[{registration:'AB12CDE',mot_advisories:'Bearing play'},{registration:'OTHER',mot_advisories:['Other car']}]});
 assert.match(t.body(),/Bearing play/);assert.doesNotMatch(t.body(),/Other car/);
 t.input.value='CD34EFG';t.input.dispatchEvent(new t.window.Event('input'));assert.match(t.body(),/unavailable while offline/);assert.doesNotMatch(t.body(),/Bearing play/);
});
test('a delayed first registration cannot overwrite the replacement vehicle',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve});
 const t=setup({registration:'AB12CDE'},async reg=>reg==='AB12CDE'?pending:{registration:reg,motTests:[]});
 const first=t.flush();t.input.value='CD34EFG';t.input.dispatchEvent(new t.window.Event('input'));await t.flush();
 release({registration:'AB12CDE',motTests:[{...tests[1],odometerValue:'90000',odometerUnit:'MI'}]});await first;
 assert.equal(t.mileage.value,'');assert.equal(t.mileage.placeholder,'No reading');
 assert.match(t.body(),/No MOT test history/);assert.doesNotMatch(t.body(),/Rear tyre worn/);
});
test('a reopened job upgrades its advisories-only cache and keeps the DVSA reading apart from job and current mileage',async()=>{
 const registration='AB12CDE',key='vecta_job_mot_advisories_v1';
 const store=new Map([[key,JSON.stringify({[registration]:{checked:Date.now(),date:'2025-04-10',lines:[]}})]]);
 let requests=0;
 const t=setup({registration},async()=>{requests++;return {registration,motTests:[{...tests[1],odometerValue:'60734',odometerUnit:'MI'}, {...tests[0],odometerValue:'50000',odometerUnit:'MI'}]};},{store});
 await t.flush();
 assert.equal(requests,1);assert.equal(t.mileage.value,'60,734 mi');assert.equal(t.mileage.readOnly,true);
 assert.equal(t.document.querySelector('#job_current_mileage').value,'65123');assert.equal(t.document.querySelector('#job_mileage').value,'64000');
 const reopened=setup({registration},()=>assert.fail('Offline lookup'),{online:false,store});
 assert.equal(reopened.mileage.value,'60,734 mi');
});
test('an unreadable latest test never displays an older reading, a booking estimate or zero by default',async()=>{
 const t=setup({registration:'AB12CDE'},async()=>({motTests:[{...tests[0],odometerValue:'50000'},{...tests[1],odometerResultType:'NO_ODOMETER',odometerValue:'0'}]}));
 await t.flush();assert.equal(t.mileage.value,'');assert.equal(t.mileage.placeholder,'No reading');
});
test('reconnection fills an offline empty box and preserves a genuine zero and its kilometre unit',async()=>{
 const t=setup({registration:'AB12CDE'},async()=>({motTests:[{...tests[1],odometerValue:0,odometerUnit:'KM',odometerResultType:'READ'}]}),{online:false});
 assert.equal(t.mileage.placeholder,'Unavailable');t.navigator.onLine=true;t.window.dispatchEvent(new t.window.Event('online'));
 await t.flush();assert.equal(t.mileage.value,'0 km');
});
