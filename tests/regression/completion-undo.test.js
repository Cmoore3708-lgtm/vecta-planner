import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import '../../public/js/vecta-offline-sync-rules.js';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=['vectaWorkCompletedAt','vectaRecordWorkCompleted','vectaCompletionDisplay','vectaUndoStamp','vectaApplyExplicitUndo','vectaMergeExplicitUndo','vectaUndoInvoiceBlock','undoJobCompletion','normaliseCompletedJobState','mergeRemoteRows','vectaNormaliseTerminalState','financeEffectiveJob'];
let source='';
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  const script=m[1];if(!names.some(n=>script.includes('function '+n+'(')))continue;
  traverse(parse(script,{sourceType:'script'}),{FunctionDeclaration(p){const n=p.node;if(names.includes(n.id.name))source+=script.slice(n.start,n.end)+'\n'}});
}
const done={id:'job-1',status:'completed',archived:true,completed_at:'2026-09-17T13:37:00Z',updated_at:'2026-09-17T13:37:00Z',booking_date:'2026-09-17',technician:'Alfie',drop_time:'08:00',amount_quoted:220};
const reopened={...done,status:'booked',archived:false,completed_at:null,customer_note:'[[VECTA_UNDO_COMPLETION:2026-09-17T14:00:00Z]]',updated_at:'2026-09-17T14:00:00Z'};
function context(extra={}){
 const c={Date,console,window:{},navigator:{onLine:true},document:{getElementById:()=>null},isJobInvoiced:()=>false,vectaTerminalJobState:()=>null,vectaCompletionStampIsSynthetic:v=>/T(?:12|17):00:00(?:\.000)?Z$/.test(v||''),jobCompletionEvidence:r=>r.archived||r.status==='completed'||!!r.completed_at,vectaSyntheticCompletionNeedsRepair:()=>false,vectaValidJobDate:v=>String(v||'').slice(0,10),fromRemote:r=>({...r}),vectaChooseCompletionStamp:(a,b)=>a||b,vectaInvoiceIsActive:i=>!['void','cancelled','deleted'].includes(i.status),...extra};vm.createContext(c);vm.runInContext(source,c);return c;
}
test('completion clock explicitly uses UK summer and winter time',()=>{const c=context();assert.equal(c.vectaCompletionDisplay(done),'17/09/2026, 14:37');assert.equal(c.vectaCompletionDisplay({...done,completed_at:'2026-01-17T14:37:00Z'}),'17/01/2026, 14:37');assert.match(c.vectaCompletionDisplay({...done,completed_at:'2026-09-17T17:00:00Z'}),/time not recorded/)});
test('UNDO beats a stale completed copy in either merge direction',()=>{const c=context();for(const [a,b] of [[reopened,done],[done,reopened]]){const result=c.mergeRemoteRows([{...a}],[{...b}])[0];assert.equal(result.status,'booked');assert.equal(result.completed_at,null);assert.equal(result.technician,'Alfie');assert.equal(result.amount_quoted,220)}});
test('a genuine second completion survives UNDO reconciliation',()=>{const c=context();const again={...reopened,status:'completed',archived:true,completed_at:'2026-09-17T14:37:00Z',updated_at:'2026-09-17T14:37:00Z'};assert.equal(c.normaliseCompletedJobState(again).status,'completed')});
test('ready to invoice remains possible after undo',()=>{const c=context();assert.equal(c.normaliseCompletedJobState({...reopened,status:'ready_to_invoice'}).status,'ready_to_invoice')});
test('unrelated completed jobs retain their protection',()=>{const c=context();assert.equal(c.mergeRemoteRows([{...done,status:'booked',archived:false,completed_at:null}],[{...done}])[0].status,'completed')});
test('individual and monthly invoice links block undo, void invoice does not',()=>{const c=context();assert.equal(c.vectaUndoInvoiceBlock(done,[{job_id:'job-1',status:'saved'}]),true);assert.equal(c.vectaUndoInvoiceBlock(done,[{fleet_job_ids:'["job-1"]',status:'saved'}]),true);assert.equal(c.vectaUndoInvoiceBlock(done,[{job_id:'job-1',status:'cancelled'}]),false)});
test('old financial date corrections cannot resurrect undone completion',()=>{const c=context({financeCorrectionMap:()=>({'job-1':{completed_at:done.completed_at,status:'completed',amount_quoted:230,finance_corrected_at:done.updated_at}})});const result=c.financeEffectiveJob(reopened);assert.equal(result.status,'booked');assert.equal(result.completed_at,null);assert.equal(result.amount_quoted,230)});
function undoContext({conflict=false,invoice=false,offline=false,fail=false}={}){
 let row={...done},updates=0,ledger=null;const alerts=[];
 const client={from(table){assert.equal(table,'jobs');return {select(){return {eq(){return {limit:async()=>({data:[{...row}]})}}}},update(patch){updates++;return {eq(){return this},is(){return this},async select(){if(fail)return {error:new Error('server failed')};if(conflict)return {data:[]};row={...row,...patch};return {data:[{...row}]}}}}}}};
 const c=context({remoteClient:client,navigator:{onLine:!offline},app:{jobs:[{...done}],settings:{}},alert:m=>alerts.push(m),vectaFetchAllRemoteRows:async()=>invoice?[{job_id:'job-1',status:'saved'}]:[],vectaSetTerminalJobStateLocal:(id,value)=>{ledger=value},vectaWriteTerminalJobState:async()=>true,vectaPendingSync:()=>[],vectaSavePendingSync(){},vectaNormaliseQueuedItem:x=>x,vectaCompletionDateRepairs:{},saveLocal(){},closeModals(){},render(){}});
 return {c,alerts,get row(){return row},get updates(){return updates},get ledger(){return ledger}};
}
test('undo persists the existing row and restores its original planner allocation',async()=>{const x=undoContext();assert.equal(await x.c.undoJobCompletion('job-1'),true);assert.equal(x.row.id,done.id);assert.equal(x.row.status,'booked');assert.equal(x.row.completed_at,null);assert.equal(x.row.technician,'Alfie');assert.equal(x.row.booking_date,done.booking_date);assert.equal(x.row.amount_quoted,220);assert.equal(x.ledger.state,'reopened');assert.equal(x.c.view,'planner')});
test('undo fails safely on invoice, offline, concurrent edit and server failure',async()=>{for(const options of [{invoice:true},{offline:true},{conflict:true},{fail:true}]){const x=undoContext(options);assert.equal(await x.c.undoJobCompletion('job-1'),false);assert.equal(x.c.app.jobs[0].status,'completed');assert.equal(x.ledger,null);assert.equal(x.alerts.length,1)}});

test('work-finished clock is preserved when the invoice is saved later',()=>{const c=context();const job={...done,completed_at:'2026-09-17T13:46:45Z',customer_note:'[[VECTA_WORK_COMPLETED:2026-09-17T13:37:00Z]]'};c.vectaRecordWorkCompleted(job);assert.equal(c.vectaCompletionDisplay(job),'17/09/2026, 14:37')});

test('synthetic completion timestamps from Postgres offsets are recognised',()=>{assert.equal(globalThis.VectaOfflineSyncRules.completionStampIsSynthetic('2026-09-17T17:00:00+00:00'),true);assert.equal(globalThis.VectaOfflineSyncRules.chooseCompletionStamp('2026-09-17T17:00:00+00:00','2026-09-17T13:37:00Z'),'2026-09-17T13:37:00Z')});
