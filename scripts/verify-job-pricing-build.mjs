import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const dependencies=['jobTypeValues','jobPartsRangeDisplay','gatherJobPartsEditor','gatherPrivatePricingItems','jobPartsEditorHtml','bindJobPartsEditor','privatePricingRowHtml','bindPrivatePricing','syncPrivatePricingTotal','applyTemplate'];
export function verifyJobPricingBridge(source){
 const call=source.match(/window\.VectaJobPricing\.install\(j,\{[^}]+\},!id\)/)?.[0];
 assert.ok(call,'Job pricing must receive helpers from the private job-editor scope.');
 const functions=Object.fromEntries(dependencies.map(name=>[name,()=>name]));
 let supplied,isNewJob;
 const context={window:{VectaJobPricing:{install(job,api,isNew){supplied=api;isNewJob=isNew;}}},j:{},...functions};
 // Functions exist only in the closure, never as properties of window.
 for(const id of ['booked-job',null]){
  context.id=id;
  vm.runInNewContext('(function(){'+call+';})()',context);
  assert.equal(isNewJob,!id);
 }
 assert.deepEqual(Object.keys(supplied).sort(),dependencies.slice().sort());
 for(const name of dependencies){assert.equal(supplied[name],functions[name]);assert.equal(context.window[name],undefined);}
}
export function verifyBuiltJobPricing(directory='dist'){
 for(const entry of ['index.html','mechanic.html']){
  const html=readFileSync(resolve(directory,entry),'utf8');
  const paths=[...html.matchAll(/<script[^>]+src="(\/assets\/vecta-inline-[^"]+)"/g)].map(m=>m[1]);
  const source=paths.map(path=>readFileSync(resolve(directory,'.'+path),'utf8')).join('\n');
  verifyJobPricingBridge(source);
 }
 const helper=readFileSync(resolve(directory,'js/vecta-job-pricing.js'),'utf8');
 for(const name of dependencies)assert.ok(!helper.includes('root.'+name),'Pricing must not read private '+name+' from window.');
 console.log('Built Main and mechanics pricing bridges verified with private editor helpers.');
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname))verifyBuiltJobPricing();
