import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../public/js/vecta-planner-rules.js';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('function gatherJob(id){');
const end=html.indexOf('\nvar VECTA_DELETED_JOB_IDS_KEY',start);
assert.ok(start>0&&end>start);

test('previewing an amended price keeps the saved job as the conflict baseline',()=>{
  const saved={id:'job-1',registration:'M23DNK',status:'booked',amount_quoted:160,customer_note:'pricing',customer_account:'Staff',job_type:'general',booking_date:'2026-09-29',technician:'Alfie',updated_at:'2026-09-29T10:28:15Z'};
  const ctx={
    app:{jobs:[saved]},document:{getElementById:key=>key==='job_amount_quoted'?{value:'238'}:null},
    syncPrivatePricingTotal:()=>[],gatherJobPartsEditor:()=>[],
    noteWithPrivatePricing:note=>note,noteWithJobParts:note=>note,
    dvsaAdvisoryArray:value=>value||[],fleetNormaliseCustomer:value=>value,
    jobTypeStorageValue:value=>value,hasMotJobType:()=>false,
    setMotTimeOnNote:note=>note,jobTypeValues:()=>['general'],
    carryOverMeta:()=>null,isUnallocatedJob:()=>false,isVehicleTaxJob:()=>false,
    normalisePartsStatus:()=>'',calculatedPartsStatus:()=>'',
    fleetIncomeCustomerFromVehicle:()=>'',fleetIsContractorIncome:()=>false,
    partsStatusNote:note=>note
  };
  vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
  const preview=ctx.gatherJob(saved.id);
  assert.equal(preview.amount_quoted,238);
  assert.equal(saved.amount_quoted,160);
  assert.equal(saved.updated_at,'2026-09-29T10:28:15Z');
  assert.notEqual(preview,saved);
});

test('the editor retains the opened job as the baseline across background refreshes',()=>{
  assert.match(html,/function openJobModal\(id,preset\)[^\n]*__vectaJobEditorBaseline=liveJob\?\{id:String\(id\),job:JSON\.parse\(JSON\.stringify\(liveJob\)\)\}/);
  assert.match(html,/var savedJobBeforeEdit=editorBaseline&&String\(editorBaseline\.id\)===String\(id\)\?JSON\.parse\(JSON\.stringify\(editorBaseline\.job\)\)/);
  assert.match(html,/function closeModals\(\)\{window\.__vectaJobEditorBaseline=null/);
});

test('saving selected types replaces a stale website/import type array without changing instructions',()=>{
  const saved={id:'ND13GKC',registration:'ND13GKC',customer_account:'Staff',job_type:'Interim Service || Repairs',job_types:['Interim Service','Repairs'],work_required:'Oil & filter change. Also investigate noise.',customer_note:''};
  const fields={job_job_type:{value:'Repairs'}};
  const ctx={app:{jobs:[saved]},document:{getElementById:key=>fields[key]||null},
    syncPrivatePricingTotal:()=>[],gatherJobPartsEditor:()=>[],noteWithPrivatePricing:x=>x,noteWithJobParts:x=>x,
    dvsaAdvisoryArray:x=>x||[],fleetNormaliseCustomer:x=>x,jobTypeStorageValue:x=>x,
    jobTypeValues:x=>String(typeof x==='object'?x.job_types.join(' || '):x).split(' || '),
    hasMotJobType:()=>false,setMotTimeOnNote:x=>x,carryOverMeta:()=>null,isUnallocatedJob:()=>false,isVehicleTaxJob:()=>false,
    normalisePartsStatus:()=>'',calculatedPartsStatus:()=>'',fleetIncomeCustomerFromVehicle:()=>'',fleetIsContractorIncome:()=>false,partsStatusNote:x=>x};
  vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
  const draft=ctx.gatherJob(saved.id);
  assert.equal(draft.job_type,'Repairs');assert.deepEqual(Array.from(draft.job_types),['Repairs']);
  assert.equal(draft.job_colour,'Repairs');assert.equal(draft.work_required,saved.work_required);
  assert.deepEqual(saved.job_types,['Interim Service','Repairs']);
});


test('job time choice persists in existing job notes without mutating the cloud conflict baseline',()=>{
 const saved={id:'fixed',registration:'TEST1',customer_account:'Staff',job_type:'general',status:'booked',booking_date:'2026-11-04',technician:'Alfie',drop_time:'10:00',customer_note:'Call first'};
 const field={value:'11:30'},ctx={app:{jobs:[saved]},window:{VectaPlannerRules:globalThis.VectaPlannerRules},document:{getElementById:key=>key==='job_drop_time'?field:null},
  syncPrivatePricingTotal:()=>[],gatherJobPartsEditor:()=>[],noteWithPrivatePricing:n=>n,noteWithJobParts:n=>n,dvsaAdvisoryArray:v=>v||[],fleetNormaliseCustomer:v=>v,
  jobTypeStorageValue:v=>v,jobTypeValues:()=>['general'],hasMotJobType:()=>false,setMotTimeOnNote:n=>n,carryOverMeta:()=>null,isUnallocatedJob:()=>false,isVehicleTaxJob:()=>false,
  normalisePartsStatus:()=>'',calculatedPartsStatus:()=>'',fleetIncomeCustomerFromVehicle:()=>'',fleetIsContractorIncome:()=>false,partsStatusNote:n=>n,normaliseClock:v=>String(v).slice(0,5)};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function plannerJobTimeLocked('),html.indexOf('function plannerPackOrderedJobs('))+'\n'+html.slice(start,end),ctx);
 const fixed=ctx.gatherJob(saved.id);assert.equal(fixed.drop_time,'11:30');assert.equal(ctx.plannerJobTimeLocked(fixed),true);assert.match(fixed.customer_note,/Call first/);assert.equal(saved.drop_time,'10:00');assert.equal(saved.customer_note,'Call first');
 ctx.app.jobs[0]=JSON.parse(JSON.stringify(fixed));field.value='';const flexible=ctx.gatherJob(saved.id);assert.equal(ctx.plannerJobTimeLocked(flexible),false);assert.equal(flexible.drop_time,'11:30');assert.match(flexible.customer_note,/VECTA_BOOKING_TIME:next/);
});

test('internal workshop notes survive save/reopen and clearing without altering public work or other metadata',()=>{
 const saved={id:'internal-1',customer_account:'Staff',job_type:'general',work_required:'Replace front pads',technician_notes:'Service sheet note',customer_note:'[[VECTA_PRIVATE_PRICING:saved-price]]\n[[JOB_PARTS_URI:saved-parts]]'};
 const field={value:'Office only: supplier query [[bracket]]\nKeep this private £25'},ctx={app:{jobs:[saved]},document:{getElementById:key=>key==='job_internal_workshop_notes'?field:null},
  syncPrivatePricingTotal:()=>[],gatherJobPartsEditor:()=>[],noteWithPrivatePricing:n=>n,noteWithJobParts:n=>n,dvsaAdvisoryArray:v=>v||[],fleetNormaliseCustomer:v=>v,
  jobTypeStorageValue:v=>v,jobTypeValues:()=>['general'],hasMotJobType:()=>false,setMotTimeOnNote:n=>n,carryOverMeta:()=>null,isUnallocatedJob:()=>false,isVehicleTaxJob:()=>false,
  normalisePartsStatus:()=>'',calculatedPartsStatus:()=>'',fleetIncomeCustomerFromVehicle:()=>'',fleetIsContractorIncome:()=>false,partsStatusNote:n=>n};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function internalWorkshopNotes('),end),ctx);
 const draft=ctx.gatherJob(saved.id);assert.equal(ctx.internalWorkshopNotes(draft),field.value);assert.equal(draft.work_required,saved.work_required);assert.equal(draft.technician_notes,saved.technician_notes);assert.equal(ctx.internalWorkshopNotes(saved),'');
 assert.ok(draft.customer_note.startsWith(saved.customer_note));ctx.app.jobs[0]=JSON.parse(JSON.stringify(draft));assert.equal(ctx.internalWorkshopNotes(ctx.app.jobs[0]),field.value);
 field.value='Updated private note';const edited=ctx.gatherJob(saved.id);assert.equal(ctx.internalWorkshopNotes(edited),field.value);assert.equal((edited.customer_note.match(/VECTA_INTERNAL_NOTES:/g)||[]).length,1);
 ctx.app.jobs[0]=edited;field.value='';assert.equal(ctx.gatherJob(saved.id).customer_note,saved.customer_note);
});

test('mechanic saves and completion retain office wording and carry one private alert revision with each changed note',()=>{
 const saved={id:'11111111-1111-4111-8111-111111111111',registration:'TEST001',customer_account:'Staff',job_type:'general',work_required:'Office approved instructions',customer_note:''};
 const fields={job_work_required:{value:'Mechanic must not publish this',defaultValue:saved.work_required},job_customer_note:{value:''},job_internal_workshop_notes:{value:'Front pads worn. Ask Chris to review.'},job_status:{value:'work_complete'}};
 let revision=0;
 const ctx={app:{jobs:[saved]},window:{VECTA_MECHANIC_DEPLOYMENT:true},uid:()=> '22222222-2222-4222-8222-'+String(++revision).padStart(12,'0'),document:{getElementById:key=>fields[key]||null},
  syncPrivatePricingTotal:()=>[],gatherJobPartsEditor:()=>[],noteWithPrivatePricing:n=>n,noteWithJobParts:n=>n,dvsaAdvisoryArray:v=>v||[],fleetNormaliseCustomer:v=>v,
  jobTypeStorageValue:v=>v,jobTypeValues:()=>['general'],hasMotJobType:()=>false,setMotTimeOnNote:n=>n,carryOverMeta:()=>null,isUnallocatedJob:()=>false,isVehicleTaxJob:()=>false,
  normalisePartsStatus:()=>'',calculatedPartsStatus:()=>'',fleetIncomeCustomerFromVehicle:()=>'',fleetIsContractorIncome:()=>false,partsStatusNote:n=>n,vectaJobIsDeletedForLists:j=>j.deleted};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function internalWorkshopNotes('),end),ctx);
 const queue=fs.readFileSync(new URL('../../public/js/vecta-review-queue.js',import.meta.url),'utf8');
 vm.runInContext(queue.slice(queue.indexOf(' function noteAlerts('),queue.indexOf(' function workshopNotes('))+';window.VectaFindings={noteAlerts};',ctx);
 vm.runInContext(html.slice(html.indexOf('window.vectaWorkshopNoteAlerts='),html.indexOf('window.vectaOpenFindingJob=')),ctx);
 const changed=ctx.gatherJob(saved.id);
 assert.equal(changed.work_required,saved.work_required);assert.equal(changed.status,'work_complete');assert.equal(ctx.internalWorkshopNotes(changed),fields.job_internal_workshop_notes.value);assert.equal(saved.customer_note,'');
 assert.match(changed.customer_note,/VECTA_INTERNAL_NOTE_UPDATE:22222222-2222-4222-8222-000000000001/);
 ctx.app.jobs=[JSON.parse(JSON.stringify(changed))];
 assert.equal(ctx.gatherJob(saved.id).customer_note,changed.customer_note,'retry and unchanged saves must keep the same alert ID');
 assert.equal(ctx.window.vectaWorkshopNoteAlerts().length,0,'mechanics must not alert themselves');
 ctx.window.VECTA_MECHANIC_DEPLOYMENT=false;
 let alerts=ctx.window.vectaWorkshopNoteAlerts();assert.equal(alerts.length,1);assert.equal(alerts[0].message,fields.job_internal_workshop_notes.value);assert.equal(alerts[0].job_id,saved.id);assert.equal(alerts[0].internal_note,true);
 assert.equal(ctx.gatherJob(saved.id).work_required,fields.job_work_required.value,'office can still edit customer wording');
 fields.job_internal_workshop_notes.value='';ctx.window.VECTA_MECHANIC_DEPLOYMENT=true;
 const cleared=ctx.gatherJob(saved.id);assert.equal(ctx.internalWorkshopNotes(cleared),'');assert.match(cleared.customer_note,/VECTA_INTERNAL_NOTE_UPDATE:22222222-2222-4222-8222-000000000002/);
 ctx.app.jobs=[cleared];ctx.window.VECTA_MECHANIC_DEPLOYMENT=false;
 assert.equal(ctx.window.vectaWorkshopNoteAlerts()[0].message,'Workshop notes cleared.');
 ctx.app.jobs[0].deleted=true;assert.equal(ctx.window.vectaWorkshopNoteAlerts().length,0);
});
