import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readProductDialog} from '../../workers/repair-quotes/product-dialog.mjs';
import {readAlternatorTime} from '../../workers/repair-quotes/repair-time-reader.mjs';
test('observed GSF dialog reads account cost and photo, excluding RRP/surcharge',()=>{
 const {document}=parseHTML('<html><body><div role="dialog"><h2>Part Details</h2><h5>Alternator - 150 Amp</h5><p>SKU: A8828</p><p>RRP: £624.31</p><p>£194.74 ex vat</p><p>£10.00 surcharge</p><p>In stock.</p><div><p>Brand</p><p>DriveTec</p></div><div><p>SKU</p><p>A8828</p></div><div><p>Cost inc. VAT</p><p>£233.69</p></div><table><tbody><tr><td>Boldon</td><td>1</td></tr></tbody></table><img src="https://gsfappstorage.blob.core.windows.net/catalogue-assets/ProductImages/WAI/21126N_B1.jpg"></div></body></html>');
 const part=readProductDialog(document);assert.equal(part.unitNetPence,19474);assert.equal(part.sku,'A8828');assert.equal(part.brand,'DriveTec');assert.match(part.imageUrl,/21126N_B1/);
});
test('screenshot-informed Haynes row capture uses hours rather than interpreting 0.70 as minutes',()=>{
 const {document}=parseHTML('<html><body><div>TOTAL TIME (H)</div><input id="numberPlate" value="FV65 JTY"><table><tr><td>1E02944501WV0</td><td><span>Renew the alternator</span></td><td>0.70</td></tr></table></body></html>');const result=readAlternatorTime(document);assert.equal(result.hoursMilli,700);assert.equal(result.registrationVisible,'FV65JTY');assert.equal(result.fitmentConfirmed,false);
 document.querySelector('tr').insertAdjacentHTML('beforeend','<td>1.10</td>');assert.throws(()=>readAlternatorTime(document),/LABOUR_REVIEW_REQUIRED/);
});

test('nested operation label and code sharing one cell are accepted; hidden duplicates ignored',()=>{
 const {document}=parseHTML('<html><body><p>Total time (H)</p><table><tr><td>1E02944501WV0 <span>Renew <b>the alternator</b></span></td><td>0.70</td></tr></table><div hidden><span>Renew the alternator</span><span>1.00</span></div></body></html>');assert.equal(readAlternatorTime(document).hoursMilli,700);
});
test('capture reports a specific reason without assuming a time',()=>{const {document}=parseHTML('<html><body>Sign in</body></html>');assert.throws(()=>readAlternatorTime(document),/OPERATION_NOT_VISIBLE/);});
test('unpriced menu label does not conflict with the one repair-time row',()=>{const {document}=parseHTML('<html><body><p>Total time (H)</p><nav><span>Renew the alternator</span></nav><table><tr><td>1E02944501WV0</td><td>Renew the alternator</td><td>0.70</td></tr></table></body></html>');assert.equal(readAlternatorTime(document).hoursMilli,700);});
test('identical repeated rows deduplicate but different operation codes still require review',()=>{const row='<tr><td>1E02944501WV0</td><td>Renew the alternator</td><td>0.70</td></tr>';const {document}=parseHTML('<html><body><p>Total time (H)</p><table>'+row+row+'</table></body></html>');assert.equal(readAlternatorTime(document).hoursMilli,700);document.querySelectorAll('tr')[1].querySelector('td').textContent='OTHEROPERATION';assert.throws(()=>readAlternatorTime(document),/MULTIPLE_PRICED_OPERATIONS/);});
test('div rows with different wrappers/OE details deduplicate by operation code and time',()=>{const {document}=parseHTML('<html><body><p>Total time (H)</p><div><span>1E02944501WV0</span><span>Renew the alternator</span><span>0.70</span></div><div><span>1E02944501WV0</span><span>Renew the alternator</span><span>OE: 1181M9</span><span>0.70</span></div></body></html>');const result=readAlternatorTime(document);assert.equal(result.hoursMilli,700);assert.equal(result.operationId,'1E02944501WV0');document.querySelectorAll('div')[1].lastElementChild.textContent='1.10';assert.throws(()=>readAlternatorTime(document),/MULTIPLE_PRICED_OPERATIONS/);});
test('operation outside the visible screen does not create a second priced match',t=>{
 t.after(()=>{delete globalThis.innerHeight;delete globalThis.innerWidth;});
 const row=(id,time)=>'<div><span>'+id+'</span><span>Renew the alternator</span><span>'+time+'</span></div>';
 const {document}=parseHTML('<html><body><p>Total time (H)</p>'+row('1E02944501WV0','0.70')+row('1D01901429WV0','0.30')+'</body></html>');
 document.defaultView.innerHeight=1000;document.defaultView.innerWidth=1000;document.querySelectorAll('*').forEach(el=>{el.getBoundingClientRect=()=>({left:10,right:100,top:50,bottom:70,width:90,height:20});});const hidden=document.querySelectorAll('body > div')[1];hidden.querySelectorAll('*').forEach(el=>{el.getBoundingClientRect=()=>({left:10,right:100,top:-50,bottom:-30,width:90,height:20});});
 assert.equal(readAlternatorTime(document).hoursMilli,700);
});

// Worker adapter tests: capture success must not bypass reviewed vehicle/scope checks.
import {readReviewedHaynesOperation} from '../../workers/repair-quotes/catalogue.mjs';
test('worker accepts the observed capture only against the reviewed operation',async()=>{
 const mapping={registration:'FV65JTY',haynesOperationId:'1E02944501WV0',haynesOperationLabel:'Renew the alternator'};
 const capture={operationId:mapping.haynesOperationId,operationText:'1E02944501WV0 Renew the alternator OE: 1181M9 + 0.70',hoursMilli:700,unit:'hours',registrationVisible:''};
 const frame=value=>({url:()=> 'https://www.workshopdata.com/touch/site/layout/repairTimes',evaluate:async()=>value});
 const page={frames:()=>[frame(capture)]};
 assert.equal((await readReviewedHaynesOperation(page,mapping,'https://www.workshopdata.com')).hoursMilli,700);
 for(const change of [{operationId:'1D01901429WV0'},{registrationVisible:'WRONGREG'},{unit:'minutes'}]){
  await assert.rejects(readReviewedHaynesOperation({frames:()=>[frame({...capture,...change})]},mapping,'https://www.workshopdata.com'),/LABOUR_REVIEW_REQUIRED/);
 }
 await assert.rejects(readReviewedHaynesOperation({frames:()=>[frame(capture),frame({...capture,hoursMilli:300})]},mapping,'https://www.workshopdata.com'),/LABOUR_REVIEW_REQUIRED/);
 await assert.rejects(readReviewedHaynesOperation(page,mapping,'https://other.workshopdata.com'),/LABOUR_REVIEW_REQUIRED/);
});

import {verifyRepairVehicle,repairTimesLink} from '../../workers/repair-quotes/haynes-navigation.mjs';
test('automatic Haynes navigation binds registration and reviewed vehicle type',()=>{
 const vehicle={registration:'FV65JTY',typeId:'t_317000375',make:'Honda',model:'CR-V',variant:'1.6 i-DTEC'};
 const request={registration:'FV65JTY'},mapping={haynesTypeId:'t_317000375'};
 assert.equal(verifyRepairVehicle(vehicle,request,mapping),'t_317000375');
 for(const change of [{registration:'OTHER'},{typeId:'t_999'},{ambiguous:true},{blocked:true},{variant:''}])assert.throws(()=>verifyRepairVehicle({...vehicle,...change},request,mapping),/LABOUR_REVIEW_REQUIRED/);
 assert.throws(()=>verifyRepairVehicle({...vehicle,login:true},request,mapping),/LOGIN_REQUIRED/);
 const url='https://www.workshopdata.com/touch/site/layout/repairTimes?typeId=t_317000375&groupId=QUICKGUIDES';
 assert.equal(repairTimesLink([url,url],'t_317000375'),url);
 for(const links of [[],[url.replace('t_317000375','t_999')],[url.replace('www.workshopdata.com','evil.example')],[url.replace('repairTimes','costEstimate')]])assert.throws(()=>repairTimesLink(links,'t_317000375'),/LABOUR_REVIEW_REQUIRED/);
});

import {inspectRepairCatalogue} from '../../workers/repair-quotes/catalogue-structure.mjs';
test('catalogue calibration captures product structure without account/input secrets or claiming fitment',()=>{
 const {document}=parseHTML('<html><body><header>Account balance £999.00 customer@example.com</header><main><section><strong>FV65 JTY</strong><p>Honda CR-V</p></section><input name="password" type="password" value="secret"><input aria-label="Search registration" value="PRIVATE INPUT"><button aria-label="Search VRM Button"></button><nav><p>Unrelated account</p></nav><article><h3>Alternator - 150 Amp</h3><span>DriveTec</span><p>£194.74</p><span>In stock</span></article><article hidden><h3>Alternator</h3><p>£2.00</p></article><p>2 products</p></main></body></html>');
 const result=inspectRepairCatalogue({registration:'FV65 JTY'},document),encoded=JSON.stringify(result);
 assert.equal(result.candidateCount,1);assert.equal(result.catalogueComplete,false);assert.equal(result.fitmentConfirmed,false);assert.equal(result.registration,'FV65JTY');
 assert.match(encoded,/194.74/);assert.match(encoded,/Search VRM Button/);assert.ok(result.identities.length);assert.match(result.candidates[0].selector,/article/);
 for(const value of ['999.00','customer@example.com','secret','PRIVATE INPUT','£2.00'])assert.ok(!encoded.includes(value),value);
 assert.throws(()=>inspectRepairCatalogue({registration:'<script>'},document),/INVALID_REGISTRATION/);
});

import {navigateHaynesRepair} from '../../workers/repair-quotes/haynes-navigation.mjs';
test('repair navigation searches the requested plate and follows only its verified repair link',async()=>{
 const request={registration:'FV65JTY'},mapping={haynesTypeId:'t_317000375',haynesOperationId:'1E02944501WV0'};
 const repair='https://www.workshopdata.com/touch/site/layout/repairTimes?typeId=t_317000375&groupId=QUICKGUIDES';
 const calls=[];let searched=false,url='',badVehicle=false;
 const operation={count:async()=>1,isVisible:async()=>true,waitFor:async()=>{},scrollIntoViewIfNeeded:async()=>calls.push('scroll')};
 const page={url:()=>url,goto:async target=>{url=target;calls.push(target);},evaluate:async()=>searched?{registration:'FV65JTY',typeId:badVehicle?'t_999':'t_317000375',make:'Honda',model:'CR-V',variant:'1.6'}:{},
 locator:selector=>selector==='a[href]'?{evaluateAll:async()=>[repair]}:selector==='li:not(:has(li))'?{filter:()=>({...operation,nth:()=>operation})}:selector==='#licencePlateBtn'?{count:async()=>1,click:async()=>{searched=true;}}:{count:async()=>1,waitFor:async()=>{},fill:async plate=>calls.push(plate)},
 getByText:()=>({count:async()=>1,click:async()=>calls.push('expand')}),waitForTimeout:async()=>{}};
 assert.deepEqual(await navigateHaynesRepair(page,request,mapping),{registration:'FV65JTY',typeId:'t_317000375'});
 assert.ok(calls.includes('FV65JTY'));assert.ok(calls.includes(repair));assert.ok(calls.includes('scroll'));
 badVehicle=true;searched=false;calls.length=0;
 await assert.rejects(navigateHaynesRepair(page,request,mapping),error=>error.code==='LABOUR_REVIEW_REQUIRED'&&error.stage==='VERIFY_VEHICLE');
 assert.ok(!calls.includes(repair));
});

import {openAlternatorOperation} from '../../workers/repair-quotes/haynes-navigation.mjs';
test('alternator expansion waits for asynchronously inserted leaf rows and rejects duplicate visible matches',async()=>{
 let tick=0,clicked=0,scrolled=0,duplicates=false;
 const row={isVisible:async()=>true,scrollIntoViewIfNeeded:async()=>{scrolled++;}};
 const rows={count:async()=>tick<2?0:duplicates?2:1,nth:()=>row};
 const page={getByText:()=>({count:async()=>1,click:async()=>{clicked++;}}),locator:selector=>{assert.equal(selector,'li:not(:has(li))');return {filter:()=>rows};},waitForTimeout:async()=>{tick++;}};
 await openAlternatorOperation(page,{haynesOperationId:'1E02944501WV0'});
 assert.equal(clicked,1);assert.equal(scrolled,1);assert.ok(tick>=2);
 duplicates=true;
 await assert.rejects(openAlternatorOperation(page,{haynesOperationId:'1E02944501WV0'}),/LABOUR_REVIEW_REQUIRED/);
 assert.equal(clicked,1);
});

import {readRepairVehicle} from '../../workers/repair-quotes/haynes-navigation.mjs';
import {repairBrowserReason} from '../../workers/repair-quotes/browser-errors.mjs';
import {expandGSFAlternatives} from '../../workers/repair-quotes/gsf-alternatives.mjs';
test('Haynes retries document replacement but reports a closed browser distinctly',async()=>{
 let tries=0;
 const page={evaluate:async()=>{if(++tries===1)throw Error('Execution context was destroyed');return {registration:'FV65JTY'};},waitForTimeout:async()=>{}};
 assert.equal((await readRepairVehicle(page)).registration,'FV65JTY');assert.equal(tries,2);
 assert.equal(repairBrowserReason(Error('Target page, context or browser has been closed')),'BROWSER_WINDOW_CLOSED');
 assert.equal(repairBrowserReason(Error('net::ERR_ABORTED at https://private.example/token')),'NAVIGATION_INTERRUPTED');
 assert.equal(repairBrowserReason(Error('Execution context was destroyed')),'DOCUMENT_CHANGED');
 await assert.rejects(readRepairVehicle({...page,evaluate:async()=>{throw Error('Target closed');}}),/Target closed/);
});
test('GSF Show More expands additional alternatives and never establishes catalogue completeness',async()=>{
 let expanded=false,clicks=0;
 const card={text:'£194.74 Silver Alternator - 150 Amp'};
 const control={isVisible:async()=>true,click:async()=>{expanded=true;clicks++;}};
 const page={evaluate:async()=>({candidates:expanded?[card,{text:'£180.00 Alternator'}]:[card],catalogueComplete:false}),getByText:label=>{assert.equal(label,'Show More');return {count:async()=>expanded?0:1,nth:()=>control};},waitForTimeout:async()=>{}};
 const result=await expandGSFAlternatives(page,'FV65JTY');assert.equal(result.candidates.length,2);assert.equal(clicks,1);assert.equal(result.catalogueComplete,false);
 expanded=false;control.click=async()=>{clicks++;};
 await assert.rejects(expandGSFAlternatives(page,'FV65JTY',{timeoutMs:0}),/GSF_MORE_DID_NOT_LOAD/);
});

test('reviewed operation scope distinguishes two alternator jobs without hardcoding the time',()=>{
 const {document}=parseHTML('<html><body><p>Total time (H)</p><ul><li><span>1E02944501WV0 Renew the alternator</span><span>0.70</span></li><li><span>1D01901429WV0 Renew the alternator</span><span>0.30</span></li></ul></body></html>');
 assert.throws(()=>readAlternatorTime(document),/MULTIPLE_PRICED_OPERATIONS/);
 assert.equal(readAlternatorTime({operationId:'1E02944501WV0'},document).hoursMilli,700);
 assert.equal(readAlternatorTime({operationId:'1D01901429WV0'},document).hoursMilli,300);
 document.querySelector('li').lastElementChild.textContent='1.10';
 assert.equal(readAlternatorTime({operationId:'1E02944501WV0'},document).hoursMilli,1100);
 document.querySelector('li').insertAdjacentHTML('beforeend','<span>2.00</span>');
 assert.throws(()=>readAlternatorTime({operationId:'1E02944501WV0'},document),/MULTIPLE_TIMES/);
 assert.throws(()=>readAlternatorTime({operationId:'1E00000000WV0'},document),/TIME_NOT_FOUND/);
});
test('hours header may be outside viewport after scrolling to the reviewed operation',t=>{
 t.after(()=>{delete globalThis.innerHeight;delete globalThis.innerWidth;});
 const {document}=parseHTML('<html><body><p>Total time (H)</p><ul><li><span>1E02944501WV0 Renew the alternator</span><span>0.70</span></li></ul></body></html>');
 document.defaultView.innerHeight=1000;document.defaultView.innerWidth=1000;
 document.querySelectorAll('*').forEach(el=>{el.getBoundingClientRect=()=>({left:10,right:100,top:50,bottom:70,width:90,height:20});});
 document.querySelector('p').getBoundingClientRect=()=>({left:10,right:100,top:-50,bottom:-30,width:90,height:20});
 assert.equal(readAlternatorTime({operationId:'1E02944501WV0'},document).hoursMilli,700);
});
test('worker passes the reviewed operation to browser capture and retains the specific rejection',async()=>{
 const mapping={registration:'FV65JTY',haynesOperationId:'1E02944501WV0',haynesOperationLabel:'Renew the alternator'};
 const page={frames:()=>[{url:()=> 'https://www.workshopdata.com/touch/site/layout/repairTimes',evaluate:async(fn,arg)=>{assert.equal(arg.operationId,mapping.haynesOperationId);throw Error('LABOUR_REVIEW_REQUIRED:HOURS_UNIT_NOT_CONFIRMED');}}]};
 await assert.rejects(readReviewedHaynesOperation(page,mapping,'https://www.workshopdata.com'),error=>error.detail==='HOURS_UNIT_NOT_CONFIRMED');
});

test('reviewed operation can be rendered outside viewport; an unscoped scan still excludes it',t=>{
 t.after(()=>{delete globalThis.innerHeight;delete globalThis.innerWidth;});
 const {document}=parseHTML('<html><body><p>Total time (H)</p><ul><li><span>1E02944501WV0 Renew the alternator</span><span>0.70</span></li></ul></body></html>');
 document.defaultView.innerHeight=1000;document.defaultView.innerWidth=1000;
 document.querySelectorAll('*').forEach(el=>{el.getBoundingClientRect=()=>({left:10,right:100,top:1100,bottom:1120,width:90,height:20});});
 assert.throws(()=>readAlternatorTime(document),/OPERATION_NOT_VISIBLE/);
 assert.equal(readAlternatorTime({operationId:'1E02944501WV0'},document).hoursMilli,700);
 document.querySelector('li').hidden=true;
 assert.throws(()=>readAlternatorTime({operationId:'1E02944501WV0'},document),/OPERATION_NOT_VISIBLE/);
});
test('capture opens a clipped job section once and retries the reviewed ID',async()=>{
 let toggles=0;
 const mapping={registration:'FV65JTY',haynesOperationId:'1E02944501WV0',haynesOperationLabel:'Renew the alternator'};
 const frame={url:()=> 'https://www.workshopdata.com/touch/site/layout/repairTimes',evaluate:async()=>{if(!toggles)throw Error('LABOUR_REVIEW_REQUIRED:OPERATION_NOT_VISIBLE');return {operationId:mapping.haynesOperationId,operationText:'1E02944501WV0 Renew the alternator 0.70',hoursMilli:700,unit:'hours'};}};
 const page={frames:()=>[frame],getByText:label=>{assert.equal(label,'Alternator');return {count:async()=>1,click:async()=>{toggles++;}};},locator:()=>({filter:()=>({count:async()=>1,scrollIntoViewIfNeeded:async()=>{}})}),waitForTimeout:async()=>{}};
 assert.equal((await readReviewedHaynesOperation(page,mapping,'https://www.workshopdata.com')).hoursMilli,700);assert.equal(toggles,1);
});
