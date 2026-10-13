import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const saveSource=html.slice(html.indexOf('async function saveJob(id)'),html.indexOf('function prepareLinkedCustomerVehicleLocal(j)'));
function setup({existing=false,priceValid=true,cloudResult=true,account='Staff'}={}){
 const draft={id:'completed-entry',status:'completed',registration:'TEST1',customer_account:account,nmuk_vehicle_type:account==='NMUK'?'Internal':'',work_required:'Replace battery',amount_quoted:60,booking_date:new Date().toISOString().slice(0,10),created_at:new Date().toISOString(),customer_note:''};
 const app={jobs:existing?[{...draft,status:'booked',archived:false}]:[],invoices:[],serviceRecords:[],customers:[],vehicles:[]};
 const calls={saved:[],invoices:[],closed:0,rendered:0,compacted:0};
 const context={app,window:{},document:{getElementById:()=>null},localStorage:{setItem(){}},console,alert(){},confirm:()=>true,
 gatherJob:()=>({...draft}),privatePricingItemsFromNote:()=>[],vectaConfirmDuplicateBooking:async()=>true,newBookingPartsStatusForTypes:()=> 'Not required',partsStatusNote:note=>note,
 isUuid:()=>true,isWebsiteBookingJob:()=>false,isUnresolvedWebsiteService:()=>false,validatePrivatePricingForFinalStatus:()=>priceValid,
 vectaRecordWorkCompleted:j=>{j.customer_note+='[[VECTA_WORK_COMPLETED:'+j.completed_at+']]'},vectaAlignActualCompletion(){},prepareLinkedCustomerVehicleLocal:()=>null,
 syncTaskFromMiniJob(){},isVehicleTaxJob:()=>false,plannerCompactLane:()=>{calls.compacted++;return[]},ensureContractorSavedFromJob(){},syncFleetMaintenanceFromJob(){},invalidateFinanceDashboardCache(){},saveLocal(){},
 syncSavedJobBundleInBackground:async j=>{calls.saved.push(j);return cloudResult},closeModals:()=>calls.closed++,render:()=>calls.rendered++,openInvoiceForJob:id=>calls.invoices.push(id),
 selectedIso:()=>draft.booking_date,vectaJobIsDeletedForLists:()=>false,isUnallocatedJob:()=>false,jobCompletionEvidence:j=>j.status==='completed'||j.archived,isJobInvoiced:()=>false,todayIso:()=>draft.booking_date};
 vm.createContext(context);vm.runInContext(saveSource,context);
 for(const name of ['allJobsForDate','jobsForDate','jobsForList']){const line=html.split('\n').find(x=>x.startsWith('function '+name+'('));vm.runInContext(line,context)}
 return{context,calls,draft};
}

test('new cards offer the green completion action without requiring an existing job',()=>{
 assert.match(html,/!isHistoricalImport&&j.status!=='quote'&&!jobCompletionEvidence\(j\)\?'<button type="button" class="btn green" id="markComplete">Mark as complete/);
});
for(const account of ['Staff','NMUK'])test(`new ${account} completion saves a financial work record and stays off the planner`,async()=>{
 const {context,calls}=setup({account});assert.equal(await context.saveJob('completed-entry'),true);
 const saved=calls.saved[0];assert.equal(saved.status,'completed');assert.equal(saved.archived,true);assert.equal(saved.amount_quoted,60);assert.ok(saved.completed_at);assert.match(saved.customer_note,/VECTA_WORK_COMPLETED/);
 assert.equal(context.jobsForDate().length,0);assert.equal(context.jobsForList('open').length,0);assert.equal(context.jobsForList('completed').length,1);
 assert.equal(calls.invoices.length,0);assert.equal(calls.compacted,0);assert.equal(calls.closed,1);
});
test('existing staff completion retains the invoice workflow',async()=>{const {context,calls}=setup({existing:true});assert.equal(await context.saveJob('completed-entry'),true);assert.deepEqual(calls.invoices,['completed-entry'])});
test('new completion cannot bypass the required final-price validation',async()=>{const {context,calls}=setup({priceValid:false});assert.equal(await context.saveJob('completed-entry'),false);assert.equal(calls.saved.length,0);assert.equal(context.app.jobs.length,0);assert.equal(calls.closed,0)});
test('cloud rejection keeps the completed record editor open for retry',async()=>{const {context,calls}=setup({cloudResult:false});assert.equal(await context.saveJob('completed-entry'),false);assert.equal(calls.closed,0);assert.equal(calls.invoices.length,0)});
