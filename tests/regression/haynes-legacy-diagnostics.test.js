import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../workers/haynes/service-browser.mjs',import.meta.url),'utf8');
const createDiagnosticPageRetainer=vm.runInNewContext('('+source.slice(source.indexOf('export function createDiagnosticPageRetainer')).split('\nexport async function')[0].replace(/^export /,'')+')');
test('legacy context retains the failed page and closes the previous diagnostic only',async()=>{
 const first={closed:0,async close(){this.closed++;}},second={closed:0,async close(){this.closed++;}},other={closed:0};
 const retain=createDiagnosticPageRetainer({pages:()=>[first,second,other]});
 assert.equal(await retain(first),true);assert.equal(first.closed,0);
 assert.equal(await retain(second),true);assert.equal(first.closed,1);assert.equal(second.closed,0);assert.equal(other.closed,0);
 assert.equal(await retain({}),false);
});
test('recovery contexts use their own retention policy; unknown contexts fail closed',async()=>{
 const page={};let called;
 assert.equal(await createDiagnosticPageRetainer({retainDiagnosticPage:async p=>{called=p;return true;}})(page),true);assert.equal(called,page);
 assert.equal(await createDiagnosticPageRetainer({})(page),false);
});
