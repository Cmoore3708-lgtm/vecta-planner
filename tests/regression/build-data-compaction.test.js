import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { encodeRecords, compactBuildData } from '../../scripts/compact-build-data.mjs';

const source=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=['window.INITIAL_FLEET_VEHICLES','window.CONTRACTOR_2026_JOBS',
  'window.CONTRACTOR_2026_NEW_VEHICLES','window.NMUK_2026_JOBS','HISTORICAL_COMPLETION_SEED'];

for(const name of names)test(`build encoding preserves every field, value and key order in ${name}`,()=>{
  const line=source.split('\n').find(line=>line.trim().startsWith(name+'=')||line.trim().startsWith(name+' =')||line.trim().startsWith('var '+name+'='));
  assert.ok(line,'seed assignment must exist');
  const original=JSON.parse(line.slice(line.indexOf('=')+1).trim().replace(/;$/,''));
  const encoded=compactBuildData(line);
  assert.ok(encoded.length<line.length,'actual seed must shrink');
  const context={window:{}};
  vm.runInNewContext(encoded,context);
  const decoded=name.startsWith('window.')?context.window[name.slice(7)]:context[name];
  assert.equal(JSON.stringify(decoded),JSON.stringify(original),'also checks key order, missing fields and record order');
});

test('mixed schemas, nulls, false, zero, Unicode and empty strings round trip exactly',()=>{
  const records=Array.from({length:80},(_,i)=>i%2?{longRegistrationField:'AXEL 1',value:null,zero:0,flag:false}:{value:'£é',longRegistrationField:'',nested:{x:[1,null]}});
  assert.equal(JSON.stringify(vm.runInNewContext(encodeRecords(records))),JSON.stringify(records));
});

test('executable assignments and unrelated arrays are never compacted',()=>{
  const script='window.CONTRACTOR_2026_JOBS=(window.CONTRACTOR_2026_JOBS||[]).concat(window.NMUK_2026_JOBS||[]);\nwindow.other=[{"x":1}];';
  assert.equal(compactBuildData(script),script);
});
