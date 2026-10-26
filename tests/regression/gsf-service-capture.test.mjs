import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {captureRegistrations,readServiceCategory,readServiceAttributes,captureServices,SERVICE_CATEGORIES,captureServiceCategory} from '../../workers/gsf/service-capture.mjs';
const documentFor=body=>parseHTML('<main>'+body+'</main>').document;
test('capture accepts up to ten unique registrations and rejects ambiguous commands before opening Edge',()=>{
 assert.deepEqual(captureRegistrations(['nu67 vse','FV65JTY']),['NU67VSE','FV65JTY']);
 for(const values of [[],['NU67VSE','nu67 vse'],['../secret'],['NU67VSE','--setup'],Array(11).fill('NU67VSE')])assert.throws(()=>captureRegistrations(values),/INVALID_REGISTRATION/);
});
test('capture requires the requested vehicle beside Clear, excludes recent vehicles and scrubs VIN/email/input values',()=>{
 const input={registration:'NU67VSE',category:'Oil Filter'};
 const recent=documentFor('<section>NU67VSE Nissan Pulsar</section><h5>Oil Filter</h5><p>£4.94</p>');
 assert.equal(readServiceCategory(input,recent).selectedRegistration,false);
 const other=documentFor('<section>FV65JTY <button>Clear</button></section><section>NU67VSE Nissan Pulsar</section><p>£4.94</p>');
 assert.equal(readServiceCategory(input,other).selectedRegistration,false);
 const doc=documentFor('<section>NU67VSE Nissan Pulsar <button>Clear</button></section><h5>Oil Filter</h5><p>SKU: UFI23.265.00 £4.94</p><input value="secret"><p>test@example.test JN1FAAZE0U0000001</p><div hidden>PRIVATE HIDDEN</div>');
 const result=readServiceCategory(input,doc);assert.equal(result.status,'CAPTURED_FOR_REVIEW');assert.deepEqual(result.skuLabels,['UFI23.265.00']);
 assert.deepEqual(result.displayedPrices,['4.94']);assert.equal(result.approvedForPublication,false);
 assert.doesNotMatch(result.visibleText,/secret|example.test|JN1FAAZE|PRIVATE HIDDEN/);
 assert.equal(result.fitmentVerified,false);assert.equal(result.oilVerified,false);
});
test('batch captures all five categories sequentially in one borrowed context; closes every tab and never issues totals',async()=>{
 let active=0,max=0,closed=0;
 const context={newPage:async()=>({close:async()=>{closed++;}})};
 const report=await captureServices(context,['NU67VSE','FV65JTY'],{capture:async(page,registration,category)=>{
  active++;max=Math.max(max,active);await new Promise(resolve=>setImmediate(resolve));active--;
  return {status:'CAPTURED_FOR_REVIEW',selectedRegistration:true,registration,category};
 }});
 assert.equal(max,1);assert.equal(closed,10);assert.equal(report.rows.length,2);
 assert.equal(report.rows[0].categories.length,5);assert.equal(report.rows[0].complete,true);
 assert.equal(report.approvedForPublication,false);assert.equal(report.workerQuoteVerified,false);
 assert.doesNotMatch(JSON.stringify(report),/totalPence|sellNetPence/);
});
test('batch records partial failures and continues other categories, but stops when login expires',async()=>{
 let calls=0,closed=0;
 const context={newPage:async()=>({close:async()=>{closed++;}})};
 const report=await captureServices(context,['NU67VSE'],{capture:async()=>{if(++calls===2)throw Error('timeout with sensitive details');return {status:'CAPTURED_FOR_REVIEW'};}});
 assert.equal(calls,5);assert.equal(report.rows[0].complete,false);assert.equal(report.rows[0].categories[1].reason,'CAPTURE_FAILED');
 assert.doesNotMatch(JSON.stringify(report),/sensitive details/);assert.equal(closed,5);
 calls=0;const login=await captureServices(context,['NU67VSE','FV65JTY'],{capture:async()=>{calls++;throw Error('LOGIN_REQUIRED');}});
 assert.equal(calls,1);assert.equal(login.rows.length,1);assert.equal(login.rows[0].categories[0].reason,'LOGIN_REQUIRED');
});
test('shared worker diagnostic mode does not start another runner or publish supplier evidence',()=>{
 const worker=readFileSync(new URL('../../workers/gsf/worker.mjs',import.meta.url),'utf8');
 assert.equal((worker.match(/chromium\.launchPersistentContext\(profile,/g)||[]).length,1);
 const mode=worker.slice(worker.indexOf('  if(serviceCheck) {'),worker.indexOf('  } else if(setup) {'));
 assert.match(mode,/captureServices\(context,captureRegs/);assert.doesNotMatch(mode,/rpc\(|createRepairBridge|launchPersistentContext/);
 assert.match(worker,/!setup&&!serviceCheck&&repairEnabled/);
});
test('category navigation submits a fresh registration after category load and does not reload selected state',async()=>{
 const calls=[];let current='',selected=false;
 const field={waitFor:async()=>{},count:async()=>1,fill:async value=>{calls.push(['fill',value]);}};
 const clear={count:async()=>0};const search={click:async()=>{calls.push(['submit']);selected=true;}};
 const page={goto:async url=>{assert.equal(selected,false);current=url;calls.push(['goto']);},url:()=>current,getByRole:()=>clear,getByPlaceholder:()=>field,
 evaluate:async()=>({selectedRegistration:selected,displayedPrices:['4.94'],status:'CAPTURED_FOR_REVIEW'})};
 page.getByRole=(role,{name})=>name==='Clear'?clear:search;
 const result=await captureServiceCategory(page,'NU67VSE',SERVICE_CATEGORIES[0]);assert.equal(result.selectedRegistration,true);
 assert.deepEqual(calls,[['goto'],['fill','NU67VSE'],['submit']]);
});

test('attribute capture records classifications without approving compatibility or reading account panels',()=>{
 const {document}=parseHTML('<div role="dialog"><h2>Attributes</h2><table><tr><th>Attribute</th><th>Value</th></tr><tr><td>Specification</td><td>API SN</td></tr><tr><td>Viscosity</td><td>0W-20</td></tr></table></div><aside>Account panel</aside>');
 const capture=readServiceAttributes(document);assert.equal(capture.status,'ATTRIBUTES_CAPTURED');assert.equal(capture.oilVerified,false);assert.deepEqual(capture.rows,[{attribute:'Specification',value:'API SN'},{attribute:'Viscosity',value:'0W-20'}]);
 assert.doesNotMatch(JSON.stringify(capture),/Account panel/);
});
