import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function vectaGuardJobUpsert(');
const end=html.indexOf('\nvar VECTA_MISSING_COLUMNS_KEY',start);
assert.ok(start>0&&end>start);
const source=html.slice(start,end);
const id='4e60846a-957d-4d61-a2f6-013b08fca0f4';

async function check(previous,remote,draft){
  let adopted=0;
  const context={console,remoteClient:{from(){return {select(){return {eq(){return {limit:async()=>({data:[remote]})}}}}}}},
    fromRemote:x=>x,isUuid:()=>true,jobCompletionEvidence:x=>x.status==='completed',
    vectaJobHasFinancialValue:x=>Number(x.amount_quoted||0)>0,vectaUndoStamp:()=>'',
    vectaAdoptRemoteJob:()=>{adopted++}};
  vm.runInNewContext(source,context);
  const result=await context.vectaGuardJobUpsert(draft,{expectedRemoteUpdatedAt:previous.updated_at,expectedRemoteRow:previous});
  return {allow:result.allow,adopted};
}

test('a newer timestamp alone does not prevent completing the confirmed card',async()=>{
  const previous={id,status:'work_complete',amount_quoted:30,updated_at:'2026-09-29T10:28:59Z'};
  const remote={...previous,updated_at:'2026-09-29T10:40:00Z'};
  assert.deepEqual(await check(previous,remote,{...previous,status:'completed',completed_at:'2026-09-29T10:41:00Z',updated_at:'2026-09-29T10:41:00Z'}),{allow:true,adopted:0});
});

test('a price already saved on the server can be completed from the same draft',async()=>{
  const previous={id,status:'work_complete',amount_quoted:30,updated_at:'2026-09-29T10:28:59Z'};
  const remote={...previous,amount_quoted:35,updated_at:'2026-09-29T10:40:00Z'};
  assert.deepEqual(await check(previous,remote,{...previous,amount_quoted:35,status:'completed',updated_at:'2026-09-29T10:41:00Z'}),{allow:true,adopted:0});
});

test('a different server price still blocks completion and adopts the cloud row',async()=>{
  const previous={id,status:'work_complete',amount_quoted:30,updated_at:'2026-09-29T10:28:59Z'};
  const remote={...previous,amount_quoted:40,updated_at:'2026-09-29T10:40:00Z'};
  assert.deepEqual(await check(previous,remote,{...previous,amount_quoted:35,status:'completed',updated_at:'2026-09-29T10:41:00Z'}),{allow:false,adopted:1});
});

test('a server edit to another persisted field cannot be overwritten',async()=>{
  const previous={id,status:'work_complete',amount_quoted:30,technician_notes:'',updated_at:'2026-09-29T10:28:59Z'};
  const remote={...previous,technician_notes:'Mechanic added a finding',updated_at:'2026-09-29T10:40:00Z'};
  assert.deepEqual(await check(previous,remote,{...previous,status:'completed',updated_at:'2026-09-29T10:41:00Z'}),{allow:false,adopted:1});
});
