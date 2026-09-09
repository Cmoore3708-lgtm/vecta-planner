import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const context=vm.createContext({});
vm.runInContext(readFileSync(resolve('public/js/vecta-job-rules.js'),'utf8'),context);
const rules=context.VectaJobRules;

test('deleted-job rule recognises every supported deletion signal',()=>{
  assert.equal(rules.isDeleted(null),true);
  assert.equal(rules.isDeleted({status:' DELETED '}),true);
  const tag=encodeURIComponent(JSON.stringify({deleted_at:'2026-09-09T00:00:00Z'}));
  assert.equal(rules.isDeleted({customer_note:`note [[VECTA_SOFT_DELETE:${tag}]]`}),true);
  assert.equal(rules.isDeleted({id:'terminal'},{terminalState:()=>({state:'deleted'})}),true);
  assert.equal(rules.isDeleted({id:'tombstone'},{isTombstone:()=>true}),true);
});

test('active and completed jobs remain visible',()=>{
  assert.equal(rules.isDeleted({id:'active',status:'booked'}),false);
  assert.equal(rules.isDeleted({id:'complete',status:'completed',archived:true}),false);
});

test('broken optional deletion stores fail safely',()=>{
  const failure=()=>{throw new Error('store unavailable')};
  assert.equal(rules.isDeleted({id:'active'},{terminalState:failure,isTombstone:failure}),false);
});
