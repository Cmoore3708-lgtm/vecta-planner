import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {parseHTML} from 'linkedom';
import {eligible,staffEligible} from '../../lib/nmuk-service-reminders.js';
import {trackable} from '../../lib/job-progress.js';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=new Set(['statusText','jobTypeInlineStyle','fleetPlannerJobCategories','fleetPlannerJobTypeKeyMatches','fleetPlannerJobsForVehicle','fleetBookedPlannerJob','fleetBookedTick','fleetBookedLink','fleetBookedGroupCell','completedJobCanUpdateFleet','financeValidJob','mechanicBookingIntervals','installProvisionalBookingActions','saveProvisionalBooking','syncSavedJobBundleInBackground','deleteJobCompletely','mobileCycleStatus','installDashboardJobActions','vectaInstallTrackingLink']);
let source='';
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  if(![...names].some(name=>m[1].includes('function '+name+'(')))continue;
  traverse(parse(m[1],{sourceType:'script'}),{FunctionDeclaration(path){if(names.has(path.node.id.name))source+=m[1].slice(path.node.start,path.node.end)+'\n';}});
}
const job={id:'11111111-1111-4111-8111-111111111111',registration:'AB12 CDE',vehicle:'Nissan Qashqai',booking_date:'2026-11-05',drop_time:'08:00',technician:'Alfie',estimated_hours:1,status:'provisional',job_type:'Full Service || MOT',customer_account:'NMUK',customer_name:'NMUK',archived:false,amount_quoted:200,customer_note:''};
function setup(extra={}){
 const {document}=parseHTML('<html><body><div id="jobModal"><div class="jobModalHead"><h2>New Job</h2><button id="saveJobMobile">Save</button><button id="printJobCard">Print</button></div><input id="job_status" value="provisional"><div class="modalFoot"><button id="cancelJob">Cancel</button><button id="saveJob">Save</button></div></div></body></html>');
 const c={document,console,isOutstandingCarryOver:()=>false,app:{jobs:[{...job}],settings:{}},navigator:{onLine:true},remoteClient:{},todayIso:()=> '2026-11-04',niceDate:x=>x,esc:x=>String(x??''),normReg:x=>String(x||'').replace(/\s/g,'').toUpperCase(),jobTypeValues:j=>String(j.job_type||'').split(' || '),isVehicleTaxJob:()=>false,vectaJobIsDeletedForLists:j=>!!j.deleted||j.archived,isJobInvoiced:()=>false,jobCompletionEvidence:j=>j.status==='completed',isWebsiteBookingJob:()=>false,jobTypeMeta:()=>({colour:'#008844',soft:'#eeffee',contrast:'#fff'}),financeBaseJob:j=>j,plannerTechnicianLane:x=>x,clockMinutes:x=>Number(x.slice(0,2))*60+Number(x.slice(3)),saveLocal(){},render(){},alert(message){c.alerts.push(message)},alerts:[],...extra};
 c.window=c;vm.createContext(c);vm.runInContext(source,c);return c;
}
test('provisional reservation is a grey card and remains in capacity calculations',()=>{
 const c=setup();assert.match(c.jobTypeInlineStyle(job),/background:#cbd0d7!important/);assert.doesNotMatch(c.jobTypeInlineStyle({...job,status:'booked'}),/background:/);
 const slots=c.mechanicBookingIntervals(job.booking_date,'Alfie','');assert.equal(slots.length,1);assert.equal(slots[0].start,480);assert.equal(slots[0].end,540);
});
test('Fleet shows a minus until confirmed, matching combined work and preferring confirmed bookings',()=>{
 const c=setup();assert.equal(c.fleetBookedPlannerJob('AB12CDE','service').id,job.id);assert.equal(c.fleetBookedPlannerJob('AB12CDE','mot').id,job.id);
 assert.match(c.fleetBookedTick(job),/>−</);assert.doesNotMatch(c.fleetBookedTick(job),/✓/);assert.match(c.fleetBookedLink(job),/Provisional booking/);
 c.app.jobs.push({...job,id:'confirmed',status:'booked',booking_date:'2026-11-06'});
 assert.equal(c.fleetBookedPlannerJob('AB12CDE','service').id,'confirmed');assert.match(c.fleetBookedTick(c.app.jobs[1]),/>✓</);
});
test('cancelled, deleted and quote records do not tick Fleet or reserve capacity',()=>{
 const c=setup();c.app.jobs=[{...job,archived:true},{...job,id:'cancelled',status:'cancelled'},{...job,id:'deleted',deleted:true,archived:true},{...job,id:'quote',status:'quote'}];
 assert.equal(c.fleetBookedPlannerJob(job.registration,'service'),null);assert.equal(c.mechanicBookingIntervals(job.booking_date,'Alfie','').length,0);
});
test('provisional rows cannot advance due dates or count as financial work even with stale completion metadata',()=>{
 const c=setup();assert.equal(c.completedJobCanUpdateFleet({...job,completed_at:'2025-11-04',archived:true}),false);
 assert.equal(c.financeValidJob(job),false);assert.equal(c.financeValidJob({...job,status:'booked'}),true);
});
test('NMUK and Staff reminders and public tracking exclude provisional bookings',()=>{
 const reminder={...job,job_type:'Full Service',recipient:'driver@example.test'},vehicle={fleetGroup:'Nissan Internal',registration:job.registration};
 assert.equal(eligible(reminder,job.booking_date,vehicle),false);assert.equal(eligible({...reminder,status:'booked'},job.booking_date,vehicle),true);
 assert.equal(staffEligible({...reminder,customer_account:'Staff'},job.booking_date),false);assert.equal(trackable(job),false);assert.equal(trackable({...job,status:'booked'}),true);
});
test('opening a provisional booking gives Close, Confirm Booking, Cancel booking and Save changes',()=>{
 const c=setup(),modal=c.document.getElementById('jobModal');c.installProvisionalBookingActions(modal,job,job.id,false);
 assert.deepEqual(Array.from(modal.querySelectorAll('.modalFoot button'),x=>x.textContent),['Close','Confirm Booking','Cancel booking','Save changes']);
 assert.equal(modal.querySelector('#saveJobMobile'),null);assert.equal(modal.querySelector('#printJobCard'),null);
});
test('new manual jobs expose Provisional Booking and historical/website/quote editors do not',()=>{
 for(const kind of ['manual','historical','website','quote']){
  const c=setup({isWebsiteBookingJob:()=>kind==='website'}),modal=c.document.getElementById('jobModal');
  c.installProvisionalBookingActions(modal,{...job,status:kind==='quote'?'quote':'booked'},null,kind==='historical');
  assert.equal(!!modal.querySelector('#createProvisionalBooking'),kind==='manual');
 }
});
test('confirmation keeps the same record and requires a confirmed cloud save',async()=>{
 const c=setup();let savedOptions;c.saveJob=async(id,callback,options)=>{savedOptions=options;assert.equal(id,job.id);c.app.jobs[0].status=c.document.getElementById('job_status').value;return true};
 assert.equal(await c.saveProvisionalBooking(job.id,true),true);assert.equal(c.app.jobs.length,1);assert.equal(c.app.jobs[0].status,'booked');assert.equal(savedOptions.requireCloud,true);
});
for(const failWrite of [false,true])test('Save changes '+(failWrite?'retains the original provisional date if saving fails':'reschedules the same provisional booking without confirming it'),async()=>{
 const c=setup(),modal=c.document.getElementById('jobModal');c.installProvisionalBookingActions(modal,job,job.id,false);
 const date=c.document.createElement('input');date.id='job_booking_date';date.value='2026-11-09';modal.appendChild(date);
 const save=modal.querySelector('#saveProvisionalChanges');let writes=0;
 c.saveJob=async(id,callback,options)=>{writes++;assert.equal(id,job.id);assert.equal(options.requireCloud,true);assert.equal(save.disabled,true);c.app.jobs[0]={...c.app.jobs[0],booking_date:date.value,status:c.document.getElementById('job_status').value};return !failWrite};
 assert.equal(await save.onclick(),!failWrite);assert.equal(writes,1);assert.equal(c.app.jobs.length,1);assert.equal(c.app.jobs[0].id,job.id);
 assert.equal(c.app.jobs[0].booking_date,failWrite?job.booking_date:date.value);assert.equal(c.app.jobs[0].status,'provisional');assert.equal(save.disabled,false);
 assert.match(c.fleetBookedTick(c.app.jobs[0]),/>−</);assert.doesNotMatch(c.fleetBookedTick(c.app.jobs[0]),/✓/);
});
test('failed confirmation restores provisional status and releases disabled controls',async()=>{
 const c=setup();c.saveJob=async()=>{c.app.jobs[0]={...job,status:'booked'};return false};
 assert.equal(await c.saveProvisionalBooking(job.id,true),false);assert.equal(c.app.jobs[0].status,'provisional');assert.equal(c.document.getElementById('job_status').value,'provisional');assert.equal(c.document.getElementById('saveJob').disabled,false);
});
test('offline confirmation is refused before changing the job and duplicate clicks share one save',async()=>{
 const c=setup({navigator:{onLine:false}});c.saveJob=async()=>{throw Error('Must not save offline confirmation')};assert.equal(await c.saveProvisionalBooking(job.id,true),false);assert.equal(c.app.jobs[0].status,'provisional');
 c.navigator.onLine=true;let finish;c.saveJob=()=>new Promise(resolve=>finish=resolve);const first=c.saveProvisionalBooking(job.id,true);assert.equal(await c.saveProvisionalBooking(job.id,true),false);finish(false);await first;
});
test('connection loss cannot queue a confirmation as a confirmed booking',async()=>{
 const c=setup({navigator:{onLine:false},updateConnectivityUI(){},queueRemoteOperation(){throw Error('Confirmation must not queue')}});
 assert.equal(await c.syncSavedJobBundleInBackground({...job,status:'booked'},null,job,{requireCloud:true}),false);assert.match(c.__vectaLastJobSaveFailure,/Reconnect/);
});
test('mobile status shortcut opens provisional controls rather than confirming implicitly',()=>{
 const c=setup();let opened;c.openJobModal=id=>opened=id;c.updateJobQuick=()=>{throw Error('Must not bypass confirmation')};c.mobileCycleStatus(job.id);assert.equal(opened,job.id);assert.equal(c.app.jobs[0].status,'provisional');
});
test('stale provisional cancellation cannot cancel a booking already confirmed elsewhere',async()=>{
 const canonical={...job,status:'booked'};const c=setup({isSoftDeletedJob:()=>false,normaliseCompletedJobState:x=>x,fromRemote:x=>x,closeModals(){},remoteClient:{from(){return {select(){return this},eq(){return this},limit:async()=>({data:[canonical]})}}}});
 await c.deleteJobCompletely(job.id,{provisional:true});assert.equal(c.app.jobs[0].status,'booked');assert.match(c.alerts[0],/already changed/);
});
test('Main and mechanics retain the provisional mechanic completion guard',()=>{
 for(const entry of [html,mechanicVariant(html)])assert.match(entry,/\['completed','quote','provisional'\]\.indexOf/);
});
for(const failWrite of [false,true])test('provisional cancellation '+(failWrite?'rolls back on a failed cloud write':'releases its slot without changing the fleet due date'),async()=>{
 let saved={...job},writes=0,terminal=0;const dueDate='2026-11-05';
 const c=setup({isSoftDeletedJob:()=>false,normaliseCompletedJobState:x=>x,fromRemote:x=>x,closeModals(){},jobVehicleLabel:j=>j.registration,vectaSoftDeletedRevenueRecord:()=>false,confirm:()=>true,vectaWriteSoftDeleteMeta:(note,meta)=>'[[VECTA_SOFT_DELETE:'+encodeURIComponent(JSON.stringify(meta))+']]',invalidateFinanceDashboardCache(){},upsertRemote:async(_table,row)=>{writes++;if(failWrite)throw Error('Offline');saved={...row}},vectaWriteTerminalJobState:async()=>terminal++,remoteClient:{from(){return {select(){return this},eq(){return this},limit:async()=>({data:[saved]})}}},fleetPlans:[{currentDueDate:dueDate}]});
 await c.deleteJobCompletely(job.id,{provisional:true});assert.equal(writes,1);assert.equal(c.fleetPlans[0].currentDueDate,dueDate);assert.equal(c.app.jobs[0].archived,!failWrite);assert.equal(terminal,failWrite?0:1);
 assert.equal(c.fleetBookedPlannerJob(job.registration,'service')?.id,failWrite?job.id:undefined);
 if(!failWrite)assert.match(c.app.jobs[0].customer_note,/VECTA_SOFT_DELETE/);
});

test('final dashboard action installer preserves four office actions and prevents mechanics from editing provisional work',()=>{
 for(const mechanic of [false,true]){
  const c=setup({VECTA_MECHANIC_DEPLOYMENT:mechanic,vectaStartCustomerProgress(){},syncOfficeJobActions(){},isUuid:()=>true});
  const modal=c.document.getElementById('jobModal');c.installProvisionalBookingActions(modal,job,job.id,false);c.installDashboardJobActions(job.id);
  assert.deepEqual(Array.from(modal.querySelectorAll('.modalFoot button'),x=>x.textContent),mechanic?['Close']:['Close','Confirm Booking','Cancel booking','Save changes']);
 }
});
