import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../public/js/vecta-planner-rules.js';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const saveSource=html.slice(html.indexOf('async function saveJob(id)'),html.indexOf('function prepareLinkedCustomerVehicleLocal(j)'));
function setup({existing=false,priceValid=true,cloudResult=true,account='Staff',status='completed'}={}){
 const draft={id:'completed-entry',status,registration:'TEST1',customer_account:account,nmuk_vehicle_type:account==='NMUK'?'Internal':'',work_required:'Replace battery',amount_quoted:60,booking_date:new Date().toISOString().slice(0,10),created_at:new Date().toISOString(),customer_note:''};
 const app={jobs:existing?[{...draft,status:'booked',archived:false}]:[],invoices:[],serviceRecords:[],customers:[],vehicles:[]};
 const calls={saved:[],invoices:[],closed:0,rendered:0,compacted:0,gaps:0};
 const context={app,window:{VectaPlannerRules:globalThis.VectaPlannerRules},document:{getElementById:()=>null},localStorage:{setItem(){}},console,alert(){},confirm:()=>true,
 gatherJob:()=>({...draft}),privatePricingItemsFromNote:()=>[],vectaConfirmDuplicateBooking:async()=>true,newBookingPartsStatusForTypes:()=> 'Not required',partsStatusNote:note=>note,
 isUuid:()=>true,isWebsiteBookingJob:()=>false,isUnresolvedWebsiteService:()=>false,validatePrivatePricingForFinalStatus:()=>priceValid,
 vectaRecordWorkCompleted:j=>{j.customer_note+='[[VECTA_WORK_COMPLETED:'+j.completed_at+']]'},vectaAlignActualCompletion(){},prepareLinkedCustomerVehicleLocal:()=>null,
 plannerCloseCompletedGap:()=>{calls.gaps++;return[]},syncTaskFromMiniJob(){},isVehicleTaxJob:()=>false,plannerCompactLane:()=>{calls.compacted++;return[]},ensureContractorSavedFromJob(){},syncFleetMaintenanceFromJob(){},invalidateFinanceDashboardCache(){},saveLocal(){},
 syncSavedJobBundleInBackground:async j=>{calls.saved.push(j);return cloudResult},closeModals:()=>calls.closed++,render:()=>calls.rendered++,openInvoiceForJob:id=>calls.invoices.push(id),
 normaliseClock:value=>String(value||'08:00').slice(0,5),plannerTechnicianLane:value=>value,selectedIso:()=>draft.booking_date,vectaJobIsDeletedForLists:()=>false,isUnallocatedJob:()=>false,jobCompletionEvidence:j=>j.status==='completed'||j.archived,isJobInvoiced:()=>false,todayIso:()=>draft.booking_date};
 vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function plannerJobTimeLocked('),html.indexOf('function plannerPackOrderedJobs('))+'\n'+html.slice(html.indexOf('function shouldAutoAllocateJobSlot('),html.indexOf('async function restoreAug13JobsMovedByOldOverlapRule('))+'\n'+saveSource,context);
 for(const name of ['byTime','allJobsForDate','jobsForDate','jobsForList']){const line=html.split('\n').find(x=>x.startsWith('function '+name+'('));vm.runInContext(line,context)}
 return{context,calls,draft};
}

test('new cards offer the green completion action without requiring an existing job',()=>{
 assert.match(html,/!isHistoricalImport&&j.status!=='quote'&&!jobCompletionEvidence\(j\)\?'<button type="button" class="btn green" id="markComplete">Mark as complete/);
});
for(const account of ['Staff','NMUK'])test(`new ${account} completion saves a financial work record and stays off the planner`,async()=>{
 const {context,calls}=setup({account});assert.equal(await context.saveJob('completed-entry'),true);
 const saved=calls.saved[0];assert.equal(saved.status,'completed');assert.equal(saved.archived,true);assert.equal(saved.amount_quoted,60);assert.ok(saved.completed_at);assert.match(saved.customer_note,/VECTA_WORK_COMPLETED/);
 assert.equal(context.jobsForDate().length,0);assert.equal(context.jobsForList('open').length,0);assert.equal(context.jobsForList('completed').length,1);
 assert.equal(calls.invoices.length,0);assert.equal(calls.compacted,0);assert.equal(calls.gaps,0);assert.equal(calls.closed,1);
});
test('existing staff completion retains the invoice workflow',async()=>{const {context,calls}=setup({existing:true});assert.equal(await context.saveJob('completed-entry'),true);assert.deepEqual(calls.invoices,['completed-entry']);assert.equal(calls.gaps,1)});
test('new completion cannot bypass the required final-price validation',async()=>{const {context,calls}=setup({priceValid:false});assert.equal(await context.saveJob('completed-entry'),false);assert.equal(calls.saved.length,0);assert.equal(context.app.jobs.length,0);assert.equal(calls.closed,0)});
test('cloud rejection keeps the completed record editor open for retry',async()=>{const {context,calls}=setup({cloudResult:false});assert.equal(await context.saveJob('completed-entry'),false);assert.equal(calls.closed,0);assert.equal(calls.invoices.length,0)});


test('declining an edited fixed booking leaves the saved card intact and sends no cloud write',async()=>{
 const {context,calls,draft}=setup({existing:true,status:'booked'}),saved=context.app.jobs[0];
 Object.assign(saved,{technician:'Alfie',drop_time:'10:00',customer_note:'[[VECTA_BOOKING_TIME:fixed]]'});
 Object.assign(draft,{technician:'Alfie',drop_time:'11:00',customer_note:saved.customer_note});
 const before=JSON.stringify(saved);let confirmations=0;context.confirm=message=>{confirmations++;assert.match(message,/fixed at 10:00/);return false};
 assert.equal(await context.saveJob(draft.id),false);assert.equal(confirmations,1);assert.equal(JSON.stringify(saved),before);assert.equal(calls.saved.length,0);assert.equal(calls.closed,0);
});
test('new flexible booking allocates silently while fixed selection keeps the requested time',async()=>{
 for(const mode of ['next','fixed']){
  const {context,calls,draft}=setup({status:'booked'});Object.assign(draft,{technician:'Alfie',drop_time:'08:00',customer_note:'[[VECTA_BOOKING_TIME:'+mode+']]'});
  context.findNextMechanicSlot=()=>{assert.equal(mode,'next');return{booking_date:draft.booking_date,drop_time:'10:00'}};
  context.showPlannerAvailabilityNotice=()=>{throw Error('No automatic mechanic-unavailable popup')};
  assert.equal(await context.saveJob(draft.id),true);assert.equal(calls.saved[0].drop_time,mode==='next'?'10:00':'08:00');assert.equal(calls.closed,1);
 }
});

test('only a successful save for a new or changed registration starts the shared Haynes lookup',async()=>{
 for(const scenario of ['new','changed','unchanged','no vehicle','failed','queued']){
  const {context,draft}=setup({existing:['changed','unchanged'].includes(scenario),cloudResult:scenario==='failed'?false:scenario==='queued'?'queued':true});
  context.normReg=value=>String(value||'').replace(/\s/g,'').toUpperCase();
  if(scenario==='changed')draft.registration='XY34ABC';
  if(scenario==='no vehicle')draft.no_vehicle=true;
  const requests=[];context.window.VectaHaynesJobTools={lookup:async(reg,make,options)=>requests.push([reg,options.background])};
  await context.saveJob(draft.id);
  assert.deepEqual(requests,['new','changed'].includes(scenario)?[[draft.registration,false]]:[],scenario);
 }
});
