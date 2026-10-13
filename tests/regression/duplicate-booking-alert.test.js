import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=['vectaBookingWorkKeys','vectaDuplicateBookingRows','vectaConfirmDuplicateBooking','deleteJobCompletely'];let source='';
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 if(!names.some(n=>m[1].includes('function '+n+'(')))continue;
 traverse(parse(m[1],{sourceType:'script'}),{FunctionDeclaration(p){if(names.includes(p.node.id.name))source+=m[1].slice(p.node.start,p.node.end)+'\n'}});
}
const draft={id:'new',registration:'VO20 FYA',job_type:'6 Month Safety Check',booking_date:'2026-09-30',status:'booked'};
const existing={...draft,id:'old',registration:'VO20FYA',booking_date:null,work_required:'Safety check'};
function context(extra={}){const c={app:{jobs:[existing]},navigator:{onLine:true},remoteClient:null,normaliseCompletedJobState:r=>r,fromRemote:r=>({...r}),vectaJobIsDeletedForLists:r=>r.softDeleted||false,isJobInvoiced:r=>r.invoiced||false,niceDate:x=>x,confirm:()=>false,alert:()=>{},...extra};vm.createContext(c);vm.runInContext(source,c);return c;}
test('same vehicle and work alerts across dates; different work is allowed',()=>{const c=context();assert.equal(c.vectaDuplicateBookingRows(draft,[existing]).length,1);assert.equal(c.vectaDuplicateBookingRows({...draft,job_type:'Tyres',work_required:'Replace rear tyres'},[existing]).length,0)});
test('self, quotes, completed, cancelled, deleted, invoiced and other vehicles are excluded',()=>{const c=context();for(const patch of [{id:'new'},{registration:'AB12CDE'},{archived:true},{status:'completed'},{status:'quote'},{status:'cancelled'},{status:'deleted'},{invoiced:true},{softDeleted:true}])assert.equal(c.vectaDuplicateBookingRows(draft,[{...existing,...patch}]).length,0)});
test('cloud bookings from another device warn, cancellation blocks save, override is explicit',async()=>{for(const answer of [false,true]){let prompt='';const c=context({app:{jobs:[]},remoteClient:{},vectaFetchAllRemoteRows:async()=>[existing],confirm:m=>{prompt=m;return answer}});assert.equal(await c.vectaConfirmDuplicateBooking(draft,null),answer);assert.match(prompt,/VO20 FYA/);assert.match(prompt,/Unallocated/);assert.match(prompt,/6 Month Safety Check/);}});
test('ordinary edits skip check, quote conversion checks, failed cloud check blocks creation',async()=>{let reads=0;const c=context({remoteClient:{},vectaFetchAllRemoteRows:async()=>{reads++;throw Error('offline')}});assert.equal(await c.vectaConfirmDuplicateBooking(draft,draft),true);assert.equal(reads,0);assert.equal(await c.vectaConfirmDuplicateBooking(draft,{...draft,status:'quote'}),false);assert.equal(reads,1)});
test('new jobs and website acceptance both call the warning before inserting',()=>{assert.match(html,/if\(!await vectaConfirmDuplicateBooking\(j,savedJobBeforeEdit\)\)return false/);assert.match(html,/if\(!await vectaConfirmDuplicateBooking\(j,null\)\)return;\s*app.jobs.push\(j\)/)});
test('deleting a stale MICRA card refreshes completed server state without writing or deleting history',async()=>{let writes=0;const alerts=[];const local={id:'micra',status:'booked',registration:'MICRA'};const canonical={...local,status:'completed',archived:true,completed_at:'2026-09-11T17:00:00Z'};const c=context({app:{jobs:[local]},isSoftDeletedJob:()=>false,remoteClient:{from:()=>({select:()=>({eq:()=>({limit:async()=>({data:[canonical]})})})})},upsertRemote:async()=>writes++,invalidateFinanceDashboardCache(){},saveLocal(){},closeModals(){},render(){},alert:m=>alerts.push(m)});await c.deleteJobCompletely('micra');assert.equal(writes,0);assert.equal(local.status,'completed');assert.equal(local.completed_at,canonical.completed_at);assert.match(alerts[0],/completed history has been kept/);});

test('two different general repairs or tyre jobs on the same vehicle do not warn',()=>{
 const c=context();
 for(const type of ['General','Diagnostics','Tyres','Brakes']){
  const first={...existing,job_type:type,work_required:'Repair rear door lock'};
  const second={...draft,job_type:type,work_required:'Repair front brake lamp'};
  assert.equal(c.vectaDuplicateBookingRows(second,[first]).length,0,type);
  assert.equal(c.vectaDuplicateBookingRows({...second,work_required:'Repair rear door lock'},[first]).length,1,type);
 }
});
test('MOT duplicated inside a combined booking warns, but MOT and a separate repair do not',()=>{
 const c=context(),mot={...existing,job_type:'MOT',work_required:'MOT test 12:30'};
 assert.equal(c.vectaDuplicateBookingRows({...draft,job_type:'MOT || General',work_required:'MOT test and fix rear door'},[mot]).length,1);
 assert.equal(c.vectaDuplicateBookingRows({...draft,job_type:'General',work_required:'Fix rear door'},[mot]).length,0);
});
