import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import '../../public/js/vecta-job-rules.js';
const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=['vectaSoftDeleteMeta','isSoftDeletedJob','vectaJobIsDeletedForLists','vectaStripSoftDeleteMeta','vectaApplyRestoredJobState','restoreSoftDeletedJob','vectaDeletedJobTombstones','vectaRememberDeletedJob','vectaIsDeletedJobTombstone','vectaNormaliseTerminalState','vectaSetTerminalJobStateLocal','vectaTerminalJobState','vectaApplyTerminalJobStates','vectaReconcileJobsFromCloud','normaliseCompletedJobState','jobCompletionEvidence','jobsForList','plannerLaneActiveJobs','financeValidJob'];
let source='';
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 const script=m[1];if(!names.some(n=>script.includes('function '+n+'(')))continue;
 traverse(parse(script,{sourceType:'script'}),{FunctionDeclaration(p){const n=p.node;if(names.includes(n.id.name))source+=script.slice(n.start,n.end)+'\n'}});
}
const deletedAt='2026-11-12T12:31:17.649Z',restoredAt='2026-11-13T09:00:00Z';
const meta={deleted_at:deletedAt,archived:false,booking_date:'2026-11-12',technician:'Alfie',ramp:'',status:'work_complete',financial_record:false};
const original={id:'job-1',registration:'AB12CDE',vehicle:'Nissan Qashqai',status:'work_complete',archived:false,amount_quoted:40,vat_mode:'inc_vat',booking_date:meta.booking_date,technician:'Alfie',ramp:'',drop_time:'09:00',customer_note:'[[PARTS_STATUS:Not required]]',completed_at:null,updated_at:'2026-11-12T12:00:00Z'};
const deleted={...original,archived:true,updated_at:deletedAt,customer_note:original.customer_note+'\n[[VECTA_SOFT_DELETE:'+encodeURIComponent(JSON.stringify(meta))+']]'};
const restored={...original,updated_at:restoredAt,customer_note:original.customer_note+'\n[[VECTA_RESTORE_JOB:'+restoredAt+']]'};
function context(extra={}){
 const storage=new Map(),c={Date,console,window:{VectaJobRules:globalThis.VectaJobRules},navigator:{onLine:true},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},VECTA_DELETED_JOB_IDS_KEY:'tombstones',vectaTerminalJobStates:{},app:{jobs:[],invoices:[]},saveLocal(){},render(){},invalidateFinanceDashboardCache(){},fromRemote:x=>({...x}),vectaApplyExplicitUndo:x=>x,vectaUndoStamp:()=>0,isJobInvoiced:()=>false,vectaSyntheticCompletionNeedsRepair:()=>false,vectaValidJobDate:v=>String(v||'').slice(0,10),vectaCompletionDateRepairs:{},vectaQueuedJobOperations:()=>({}),normReg:v=>v.replace(/\s/g,''),isVehicleTaxJob:()=>false,financeBaseJob:x=>x,isUnallocatedJob:x=>x.technician==='Unallocated',todayIso:()=>meta.booking_date,plannerTechnicianLane:x=>x,clockMinutes:v=>Number(v.split(':')[0])*60+Number(v.split(':')[1]),jobVehicleLabel:x=>x.registration,vectaPendingSync:()=>[],vectaSavePendingSync(){},vectaArchiveSyncItems(){},vectaNormaliseQueuedItem:x=>x,confirm:()=>true,...extra};
 vm.createContext(c);vm.runInContext(source,c);vm.runInContext(fs.readFileSync(new URL('../../public/js/vecta-job-recovery.js',import.meta.url),'utf8'),c);return c;
}
function markDeleted(c,at=deletedAt){c.vectaSetTerminalJobStateLocal('job-1',{state:'deleted',deleted_at:at,updated_at:at});}
test('cloud refresh and terminal reconciliation retain recoverable rows only in Deleted Jobs',()=>{
 const c=context();markDeleted(c);c.vectaReconcileJobsFromCloud([deleted]);c.vectaApplyTerminalJobStates();
 assert.equal(c.app.jobs.length,1);assert.equal(c.jobsForList('deleted').length,1);
 for(const mode of ['open','ready','today','completed'])assert.equal(c.jobsForList(mode).length,0);
 assert.equal(c.plannerLaneActiveJobs(meta.booking_date,'Alfie').length,0);
 assert.equal(c.financeValidJob(c.app.jobs[0]),false);
 assert.equal(c.app.jobs[0].status,'work_complete');assert.equal(c.app.jobs[0].completed_at,null);assert.equal(c.app.jobs[0].amount_quoted,40);
 c.vectaReconcileJobsFromCloud([deleted]);c.vectaApplyTerminalJobStates();assert.equal(c.jobsForList('deleted').length,1);
});
test('legacy irreversible tombstones stay hidden and snapshot-backed deleted statuses stay recoverable',()=>{
 const c=context();c.vectaReconcileJobsFromCloud([{...original,id:'legacy',status:'deleted'},{...deleted,status:'deleted'}]);c.vectaApplyTerminalJobStates();assert.deepEqual(Array.from(c.app.jobs,j=>j.id),['job-1']);
});
test('restore survives an old deletion ledger, cold starts and subsequent ledger refreshes',()=>{
 for(let session=0;session<2;session++){
  const c=context();markDeleted(c);c.vectaReconcileJobsFromCloud([restored]);c.vectaApplyTerminalJobStates();
  assert.equal(c.app.jobs.length,1);assert.equal(c.jobsForList('open').length,1);assert.equal(c.jobsForList('deleted').length,0);assert.equal(c.vectaIsDeletedJobTombstone('job-1'),false);
  markDeleted(c);c.vectaApplyTerminalJobStates();assert.equal(c.app.jobs.length,1);assert.equal(c.jobsForList('deleted').length,0);
 }
});
test('a later genuine deletion wins over a previous restore marker',()=>{
 const c=context();markDeleted(c,'2026-11-13T10:00:00Z');c.vectaReconcileJobsFromCloud([restored]);c.vectaApplyTerminalJobStates();assert.equal(c.app.jobs.length,0);
 const again={...restored,archived:true,customer_note:restored.customer_note+'\n[[VECTA_SOFT_DELETE:'+encodeURIComponent(JSON.stringify({...meta,deleted_at:'2026-11-13T10:00:00Z'}))+']]'};
 c.vectaReconcileJobsFromCloud([again]);c.vectaApplyTerminalJobStates();assert.equal(c.jobsForList('deleted').length,1);
});
test('unrelated deleted and completed jobs keep their existing protection',()=>{
 const c=context();c.app.jobs=[{...original,id:'hard'},{...original,id:'done'}];c.vectaSetTerminalJobStateLocal('hard',{state:'deleted',deleted_at:deletedAt});c.vectaSetTerminalJobStateLocal('done',{state:'completed',completed_at:deletedAt});c.vectaApplyTerminalJobStates();assert.equal(c.app.jobs.length,1);assert.equal(c.app.jobs[0].status,'completed');
});
function restoreContext({offline=false,conflict=false,fail=false,ledgerFail=false,completed=false,cancel=false}={}){
 let row=JSON.parse(JSON.stringify(deleted)),updates=0,ledger=null;const alerts=[],filters=[];
 if(completed){row.status='completed';row.completed_at='2026-11-12T11:00:00Z';row.customer_note='[[VECTA_SOFT_DELETE:'+encodeURIComponent(JSON.stringify({...meta,status:'completed',archived:true,financial_record:true}))+']]';}
 const client={from(table){assert.equal(table,'jobs');return {select(){return {eq(){return {limit:async()=>({data:[{...row}]})}}}},update(patch){updates++;return {eq(k,v){filters.push([k,v]);return this},is(k,v){filters.push([k,v]);return this},async select(){if(fail)return {error:new Error('server failed')};if(conflict)return {data:[]};row={...row,...patch};return {data:[{...row}]}}}}}}};
 const c=context({remoteClient:client,navigator:{onLine:!offline},app:{jobs:[{...row}]},alert:m=>alerts.push(m),confirm:()=>!cancel,vectaWriteTerminalJobState:async(job,state,value)=>{ledger=value;return !ledgerFail}});markDeleted(c);
 return {c,alerts,filters,get row(){return row},get updates(){return updates},get ledger(){return ledger}};
}
test('Restore writes the same observed row, clears deletion and preserves price/status/allocation',async()=>{
 const x=restoreContext();assert.equal(await x.c.restoreSoftDeletedJob('job-1'),true);assert.equal(x.updates,1);assert.deepEqual(x.filters,[['id','job-1'],['updated_at',deleted.updated_at]]);
 for(const key of ['id','amount_quoted','vat_mode','status','booking_date','technician','ramp','drop_time','completed_at'])assert.equal(x.row[key],original[key]);
 assert.equal(x.row.archived,false);assert.equal(x.c.isSoftDeletedJob(x.row),false);assert.equal(x.c.vectaIsDeletedJobTombstone('job-1'),false);assert.equal(x.ledger.state,'reopened');assert.equal(x.ledger.reopened_at,undefined);assert.equal(x.c.window.__vectaJobSaveFenceUntil,0);assert.equal(x.c.app.jobs.length,1);
});
test('Restoring completed work retains its completion and financial history',async()=>{
 const x=restoreContext({completed:true});assert.equal(await x.c.restoreSoftDeletedJob('job-1'),true);assert.equal(x.row.status,'completed');assert.equal(x.row.archived,true);assert.equal(x.row.completed_at,'2026-11-12T11:00:00Z');assert.equal(x.row.amount_quoted,40);
});
test('offline, concurrent edit and server error never mutate the local deleted record or ledger',async()=>{
 for(const options of [{offline:true},{conflict:true},{fail:true}]){const x=restoreContext(options);assert.equal(await x.c.restoreSoftDeletedJob('job-1'),false);assert.equal(x.c.isSoftDeletedJob(x.c.app.jobs[0]),true);assert.equal(x.ledger,null);assert.equal(x.alerts.length,1);}
 const x=restoreContext({cancel:true});assert.equal(await x.c.restoreSoftDeletedJob('job-1'),false);assert.equal(x.updates,0);
});
test('durable row restore remains effective if secondary ledger write fails',async()=>{
 const x=restoreContext({ledgerFail:true});assert.equal(await x.c.restoreSoftDeletedJob('job-1'),true);markDeleted(x.c);x.c.vectaReconcileJobsFromCloud([x.row]);x.c.vectaApplyTerminalJobStates();assert.equal(x.c.jobsForList('open').length,1);assert.equal(x.c.jobsForList('deleted').length,0);
});


test('recoverable admin deletions stay out of Admin Jobs until explicitly restored',()=>{
 const c=context();c.vectaReconcileJobsFromCloud([{...deleted,source:'monthly_admin'}]);c.vectaApplyTerminalJobStates();assert.equal(c.jobsForList('deleted').length,1);assert.equal(c.jobsForList('admin').length,0);
 c.vectaReconcileJobsFromCloud([{...restored,source:'monthly_admin'}]);c.vectaApplyTerminalJobStates();assert.equal(c.jobsForList('admin').length,1);
});
