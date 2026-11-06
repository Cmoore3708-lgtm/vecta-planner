import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync('public/js/vecta-job-mot-advisories.js','utf8');
const html='<main><input id="job_registration"><input type="checkbox" id="job_no_vehicle"><section class="jobMotAdvisories"><div data-mot-history-body></div></section></main>';
const tests=[
 {completedDate:'2024-04-08',testResult:'PASSED',defects:[{type:'ADVISORY',text:'Older test only'}]},
 {completedDate:'2025-04-10',testResult:'FAILED',defects:[{type:'MAJOR',text:'Major defect'},{type:'ADVISORY',text:'Rear tyre worn <inside>'},{type:'MINOR',text:'Minor defect'}]}
];
function setup(job,fetchVehicle,{online=true,records=[]}={}){
 const {document,window}=parseHTML(html),modal=document.querySelector('main');
 const input=modal.querySelector('#job_registration');input.value=job.registration;
 const timers=new Map(),store=new Map();let id=0;
 vm.runInNewContext(source,{window,document,navigator:{onLine:online},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},setTimeout(fn){timers.set(++id,fn);return id},clearTimeout:i=>timers.delete(i)});
 const mount=()=>window.VectaJobMotAdvisories.mount(modal,job,{fetchVehicle,localRecords:records});
 mount();
 return {input,window,mount,body:()=>modal.querySelector('[data-mot-history-body]').textContent,async flush(){const pending=[...timers.values()];timers.clear();await Promise.all(pending.map(f=>f()))}};
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
 release({registration:'AB12CDE',motTests:tests});await first;
 assert.match(t.body(),/No MOT test history/);assert.doesNotMatch(t.body(),/Rear tyre worn/);
});
