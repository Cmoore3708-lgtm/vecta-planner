import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {main,summaryContext} from './website-job-summary.test.js';

export const overheating='Vehicle is overheating - temperature gauge is climbing towards red and engine fan is staying on after the engine is turned off. There is no warm air coming through cabin fans. Potentially thermostat or water pump.\nPicking up Friday';
export const advisoryWork="MOT Advisories, customer would like these done: Nearside Front Brake disc worn, but not excessively (1.1.14 (a) (ii)); Offside Front Brake disc worn, but not excessively (1.1.14 (a) (ii))\n\nMy partner brought my car onsite a few weeks back for the engine management light on. The garage we usually take it to couldn't find the fault but I think you located it back to a dodgy sensor, unsure now which one. I've also got a bit of clicking when turning my car in reverse, got told by that other garage it was my driveshaft.";

test('existing long jobs get concise fault summaries without rewriting instructions or confirming suspected parts',()=>{
 const c=summaryContext();
 for(const [work,title] of [[overheating,'Overheating · No cabin heat'],[advisoryWork,'Engine warning light · Front brake discs · Clicking in reverse']]){
  const job={id:'existing',source:'manual',job_type:'Other',work_required:work,customer_name:'Michael Smith',customer_account:'Staff',technician:'Alfie'},before=JSON.stringify(job);
  assert.equal(c.dashboardJobTitle(job),title);
  for(const card of [c.mobileJobCardHtml(job),c.jobCardHtml(job),c.unallocatedJobCardHtml(job)])assert.ok(card.includes(title));
  const {document}=parseHTML(c.mobileJobCardHtml(job));
  assert.equal(document.querySelector('.mobileJob > b').textContent,title);
  assert.equal(document.querySelector('.mobileJobAssignment + .mobileJobCategory').textContent,'Michael');
  assert.doesNotMatch(c.mobileJobCardHtml(job),/water pump|Picking up Friday|dodgy sensor/);
  assert.equal(c.mechanicWorkView(job).editor,work);
  assert.equal(JSON.stringify(job),before);
 }
});

test('short work remains readable, unknown work is bounded and rendering escapes overrides',()=>{
 const c=summaryContext(),job={source:'manual',job_type:'Other',work_required:'DPF regeneration'};
 assert.equal(c.dashboardJobTitle(job),'DPF regeneration');
 const unknown='Investigate an intermittent unusual symptom reported by the customer during a long motorway journey and contact the customer before further work. '+ 'Additional notes. '.repeat(30);
 const title=c.dashboardJobTitle({...job,work_required:unknown});
 assert.ok(title.startsWith('Investigate an intermittent'));assert.ok(title.length<=90);assert.ok(title.endsWith('…'));
 const note=c.noteWithDashboardTitle('', '<img src=x onerror=alert(1)> & check');
 const {document}=parseHTML(c.mobileJobCardHtml({...job,customer_note:note}));
 assert.equal(document.querySelector('.mobileJob > b').textContent,'<img src=x onerror=alert(1)> & check');
 assert.equal(document.querySelector('img'),null);
 assert.doesNotThrow(()=>c.dashboardJobTitle({...job,customer_note:'[[VECTA_DASHBOARD_TITLE:%invalid]]'}));
});

test('title editor automatically follows description changes but keeps a manually chosen title',()=>{
 const c=summaryContext(),job={source:'manual',job_type:'Other',work_required:overheating};
 const {document,window}=parseHTML('<div>'+c.dashboardTitleEditorHtml(job)+'<textarea id="job_work_required"></textarea><input id="job_job_type" value="Other"></div>');
 c.document=document;c.bindDashboardTitleEditor(job);
 const field=document.getElementById('job_dashboard_title'),work=document.getElementById('job_work_required');
 assert.equal(field.value,'');assert.equal(field.placeholder,'Overheating · No cabin heat');
 field.value='Cooling system investigation';work.value='Replace brake pads';work.dispatchEvent(new window.Event('input'));
 assert.equal(field.value,'Cooling system investigation');assert.equal(field.placeholder,'Replace brake pads');
 field.value='';assert.equal(field.placeholder,'Replace brake pads');
});

test('custom title survives the normal save/reopen path, clears to automatic and preserves other job data',()=>{
 const c=summaryContext(),saved={id:'title-job',customer_account:'Staff',job_type:'Other',work_required:overheating,customer_note:'Call first\n[[PARTS_STATUS:Awaiting parts]]\n[[VECTA_INTERNAL_NOTES:Private]]',amount_quoted:125};
 const field={value:'Cooling system investigation'};
 Object.assign(c,{app:{jobs:[saved]},document:{getElementById:key=>key==='job_dashboard_title'?field:null},syncPrivatePricingTotal:()=>[],gatherJobPartsEditor:()=>[],noteWithPrivatePricing:n=>n,noteWithJobParts:n=>n,dvsaAdvisoryArray:v=>v||[],fleetNormaliseCustomer:v=>v,jobTypeStorageValue:v=>v,jobTypeValues:()=>['Other'],hasMotJobType:()=>false,setMotTimeOnNote:n=>n,carryOverMeta:()=>null,isUnallocatedJob:()=>false,isVehicleTaxJob:()=>false,normalisePartsStatus:()=>'',calculatedPartsStatus:()=>'',fleetIncomeCustomerFromVehicle:()=>'',fleetIsContractorIncome:()=>false,partsStatusNote:n=>n});
 vm.runInContext(main.slice(main.indexOf('function gatherJob(id){'),main.indexOf('\nvar VECTA_DELETED_JOB_IDS_KEY')),c);
 const before=JSON.stringify(saved),draft=c.gatherJob(saved.id);
 assert.equal(c.dashboardJobTitle(draft),field.value);assert.equal(JSON.stringify(saved),before);
 assert.equal(draft.work_required,overheating);assert.equal(draft.amount_quoted,125);assert.match(draft.customer_note,/Call first/);assert.match(draft.customer_note,/VECTA_INTERNAL_NOTES:Private/);
 c.app.jobs=[JSON.parse(JSON.stringify(draft))];
 field.value='Oil cooler and cooling checks';const edited=c.gatherJob(saved.id);
 assert.equal(c.dashboardJobTitle(edited),field.value);assert.equal((edited.customer_note.match(/VECTA_DASHBOARD_TITLE:/g)||[]).length,1);
 c.app.jobs=[edited];field.value='';const cleared=c.gatherJob(saved.id);
 assert.equal(c.dashboardJobTitle(cleared),'Overheating · No cabin heat');assert.equal(cleared.work_required,overheating);
 c.window.VECTA_MECHANIC_DEPLOYMENT=true;field.value='Mechanic title change';
 assert.equal(c.dashboardJobTitle(c.gatherJob(saved.id)),'Oil cooler and cooling checks');
});


test('service and six-month check cards show their types without dashboard description text',()=>{
 const c=summaryContext();
 for(const job_type of ['Service','Full Service','Interim Service','On-Site Service','6 Month Safety Check','Six Month Safety Check','6 monthly check','Full Service || MOT']){
  const job={id:'routine',source:'manual',job_type,work_required:'Carry out all scheduled checks and record results',customer_note:c.noteWithDashboardTitle('', 'Saved dashboard summary')},before=JSON.stringify(job);
  assert.equal(c.dashboardJobTitle(job),'',job_type);
  const phone=parseHTML(c.mobileJobCardHtml(job)).document;
  assert.equal(phone.querySelector('.mobileJob > b'),null,job_type);
  assert.ok(phone.querySelector('.mobileJobTypes'),job_type);
  assert.equal(parseHTML(c.jobCardHtml(job)).document.querySelector('.plannerWorkRequired').textContent,'',job_type);
  assert.equal(parseHTML(c.unallocatedJobCardHtml(job)).document.querySelector('b').textContent,'',job_type);
  assert.match(c.mechanicJobCardHtml(job),/Carry out all scheduled checks/);
  assert.equal(JSON.stringify(job),before);
 }
 for(const job_type of ['Other','Brakes','MOT','Diagnostics'])assert.notEqual(c.dashboardJobTitle({job_type,work_required:'Investigate clicking noise'}),'',job_type);
});
