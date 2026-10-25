import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeJobDraft} from '../../lib/job-persistence.js';

test('timestamp-only activity is ignored',()=>{
 const b={id:'j',updated_at:'a',drop_time:'08:00',work_required:'Service'};
 const r={...b,updated_at:'b',drop_time:'08:00:00'};
 const d={...b,work_required:'Service + brakes'};
 const x=mergeJobDraft({baseline:b,remote:r,draft:d});
 assert.equal(x.ok,true); assert.equal(x.row.work_required,'Service + brakes');
});
test('different-field concurrent edits are preserved',()=>{
 const b={id:'j',amount_quoted:100,technician_notes:''};
 const r={...b,technician_notes:'Finding'}; const d={...b,amount_quoted:120};
 const x=mergeJobDraft({baseline:b,remote:r,draft:d});
 assert.equal(x.ok,true); assert.equal(x.row.amount_quoted,120); assert.equal(x.row.technician_notes,'Finding');
});
test('same-field concurrent edits are blocked',()=>{
 const b={id:'j',amount_quoted:100}; const r={...b,amount_quoted:130}; const d={...b,amount_quoted:120};
 assert.deepEqual(mergeJobDraft({baseline:b,remote:r,draft:d}).conflicts,['amount_quoted']);
});
test('stale client cannot resurrect completed server state',()=>{
 const b={id:'j',status:'booked',archived:false}; const r={...b,status:'completed',archived:true,completed_at:'2026-09-29T14:00:00Z'};
 const d={...b,work_required:'old edit'}; const x=mergeJobDraft({baseline:b,remote:r,draft:d});
 assert.equal(x.ok,true); assert.equal(x.row.status,'completed'); assert.equal(x.row.archived,true);
});
