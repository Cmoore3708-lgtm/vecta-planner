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
