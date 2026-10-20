import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
