import test from 'node:test';
import assert from 'node:assert/strict';

function normalise(value,key){
  if(key==='drop_time') return String(value||'').slice(0,5);
  if(value===null||value===undefined) return '';
  return typeof value==='string'?value.trim():value;
}
const ignored=new Set(['updated_at','created_at']);
function changedKeys(before,after){
  const keys=new Set([...Object.keys(before||{}),...Object.keys(after||{})]);
  return [...keys].filter(k=>!ignored.has(k)&&normalise(before?.[k],k)!==normalise(after?.[k],k));
}
function decide({baseline,remote,draft}){
  const remoteChanges=changedKeys(baseline,remote);
  const localChanges=changedKeys(baseline,draft);
  const overlap=remoteChanges.filter(k=>localChanges.includes(k)&&normalise(remote[k],k)!==normalise(draft[k],k));
  if(overlap.length) return {ok:false,conflicts:overlap};
  const merged={...remote};
  for(const key of localChanges) merged[key]=draft[key];
  return {ok:true,row:merged};
}

test('timestamp-only server activity never creates a conflict',()=>{
  const baseline={id:'j',updated_at:'2026-09-29T10:00:00Z',amount_quoted:100,work_required:'Service',drop_time:'08:00'};
  const remote={...baseline,updated_at:'2026-09-29T10:05:00Z',drop_time:'08:00:00'};
  const draft={...baseline,work_required:'Service + brakes'};
  const result=decide({baseline,remote,draft});
  assert.equal(result.ok,true); assert.equal(result.row.work_required,'Service + brakes');
});

test('two devices editing different fields merge without losing either change',()=>{
  const baseline={id:'j',amount_quoted:100,work_required:'Service',technician_notes:''};
  const remote={...baseline,technician_notes:'Mechanic finding'};
  const draft={...baseline,amount_quoted:120};
  const result=decide({baseline,remote,draft});
  assert.equal(result.ok,true); assert.equal(result.row.amount_quoted,120); assert.equal(result.row.technician_notes,'Mechanic finding');
});

test('two devices changing the same persisted field creates one genuine conflict',()=>{
  const baseline={id:'j',amount_quoted:100,status:'booked'};
  const remote={...baseline,amount_quoted:130};
  const draft={...baseline,amount_quoted:120,status:'ready_to_invoice'};
  assert.deepEqual(decide({baseline,remote,draft}),{ok:false,conflicts:['amount_quoted']});
});

test('stale device cannot resurrect a completed job',()=>{
  const baseline={id:'j',status:'booked',archived:false};
  const remote={...baseline,status:'completed',archived:true,completed_at:'2026-09-29T14:00:00Z'};
  const draft={...baseline,work_required:'old device edit'};
  const result=decide({baseline,remote,draft});
  assert.equal(result.ok,true); assert.equal(result.row.status,'completed'); assert.equal(result.row.archived,true);
});

test('ready-to-invoice can preserve a newer mechanic note while changing status',()=>{
  const baseline={id:'j',status:'booked',technician_notes:'',amount_quoted:200};
  const remote={...baseline,technician_notes:'Pads measured at 3mm'};
  const draft={...baseline,status:'ready_to_invoice'};
  const result=decide({baseline,remote,draft});
  assert.equal(result.ok,true); assert.equal(result.row.status,'ready_to_invoice'); assert.equal(result.row.technician_notes,'Pads measured at 3mm');
});
