import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const main=fs.readFileSync('index.html','utf8');
for(const [name,html] of [['Main',main],['mechanics',mechanicVariant(main)]]){
 test(name+' includes the May WGZ 7062 import alongside the October live job',()=>{
  const window={};vm.runInNewContext(html.match(/window\.CONTRACTOR_2026_JOBS=([^;]+);/)[0],{window});
  const historical=window.CONTRACTOR_2026_JOBS.find(j=>j.id==='contractor-2026-row-228');
  const live={id:'october',registration:'WGZ 7062',booking_date:'2026-10-20',status:'completed'};
  const duplicate={...historical,work_required:'Live version wins'};
  window.CONTRACTOR_2026_JOBS=[historical,{...live,work_required:'Duplicate import'}];
  const context={window,app:{jobs:[live]},vectaJobIsDeletedForLists:j=>!!j.deleted,isJobInvoiced:()=>false,isVehicleTaxJob:()=>false,jobCompletionEvidence:j=>j.status==='completed',todayIso:()=> '2026-10-28',isUnallocatedJob:()=>false};
  vm.runInNewContext(html.split('\n').find(line=>line.startsWith('function jobsForList(')),context);
  const rows=context.jobsForList('completed');
  assert.deepEqual(Array.from(rows,j=>j.id),['october','contractor-2026-row-228']);
  assert.equal(rows[1].booking_date,'2026-05-19');assert.equal(rows[1].amount_quoted,390);
  for(const mode of ['today','open','ready','deleted'])assert.equal(context.jobsForList(mode).length,0);
  assert.equal(context.app.jobs.length,1);
  context.app.jobs.push(duplicate);assert.equal(context.jobsForList('completed').find(j=>j.id===historical.id).work_required,'Live version wins');
  duplicate.deleted=true;assert.equal(context.jobsForList('completed').some(j=>j.id===historical.id),false);
 });
}
