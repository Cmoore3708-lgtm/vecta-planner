import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const ctx={isWebsiteBookingJob:j=>j.source==='website booking',JOB_TYPE_SEPARATOR:' || ',normaliseJobTypeKey:x=>String(x||'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function jobTypeValues('),html.indexOf('function vehicleTaxAliasKey(')),ctx);
vm.runInContext(html.slice(html.indexOf('function formatJobTypeLabel('),html.indexOf('function fallbackJobTypeMeta(')),ctx);
test('dashboard titles use the remaining selection despite old service instructions',()=>{
  for(const type of ['Repairs','MOT','Tyres','Major Service']){
    assert.deepEqual(Array.from(ctx.jobTypeLabels({job_type:type,work_required:'Full service and safety check, investigate noise'})),[type]);
  }
});
test('multiple selections retain their own labels',()=>{
  assert.deepEqual(Array.from(ctx.jobTypeLabels({job_type:'MOT || Tyres',work_required:'Full service'})),['MOT','Tyres']);
});
test('website acceptance serialises separate selectable types',()=>{
  assert.match(html,/job_type:jobTypeStorageValue\(types.length\?types:\[jobType\]\)/);
  assert.deepEqual(Array.from(ctx.jobTypeValues(ctx.jobTypeStorageValue(['Interim Service','Repairs']))),['Interim Service','Repairs']);
});

test('existing website bookings split their legacy comma titles into editable selections',()=>{
  assert.deepEqual(Array.from(ctx.jobTypeValues({source:'website booking',job_type:'Interim Service, Repairs'})),['Interim Service','Repairs']);
  assert.deepEqual(Array.from(ctx.jobTypeValues({source:'manual',job_type:'Custom, specialist work'})),['Custom, specialist work']);
});
