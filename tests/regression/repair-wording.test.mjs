import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {repairRequest,repairScope,cleanRepairChoices} from '../../lib/repair-quote.js';
import {haynesWordingOptions} from '../../workers/repair-quotes/search-wording.mjs';
import {lookupHaynesLabourChoices} from '../../workers/repair-quotes/guided-haynes.mjs';
import {readHaynesRepairPage} from '../../workers/repair-quotes/haynes-page.mjs';
import {promptRepairChoice,promptHaynesLabourChoice} from '../../workers/repair-quotes/checker-input.mjs';
const partId='a'.repeat(32),categoryId='c'.repeat(32);
const request=repairRequest({registration:'YX13OEG',work:'Fit front left ABS sensor',flow:'guided-v1',choices:{gsfCategory:categoryId,part:partId,labourSearch:'abs sensor'}});
const selectedPart={description:'Wheel Speed / ABS Sensor - Front/Rear LH',brand:'Fixture',sku:'FIX100',costPence:3895,inStock:false};
const vehicle={typeId:'t_102001561',make:'Fixture',model:'E',variant:'220 CDI'};
const url='https://www.workshopdata.com/touch/site/layout/repairTimes?typeId='+vehicle.typeId+'&groupId=QUICKGUIDES';
const doc=html=>parseHTML('<html><body>'+html+'</body></html>').document;
const empty=query=>'<p>No results found for the filter used: '+query+' </p>';
// Minimal visible markup captured from Haynes, with account data omitted.
const row='<p>Total time (H)</p><ul><li data-id="1M50010000WV0-1115" data-awnr="1M50010000WV0"><span class="title">1M50010000WV0 Renew the front left <span class="highlightedWord">wheel speed sensor</span><span class="oeCode">OE: 42987101</span></span><span class="custom-checkbox-wrapper add-remove add-remove-job"><span class="icon">+</span><input type="checkbox" id="1M50010000WV0-1115"></span><span class="time">0.50</span></li></ul>';
function pageFixture(query,{loading=0,blank=false,login=false,wrongMessage=false,operation=false}={}){
 let ticks=0;const current=url+'&searchedKey='+encodeURIComponent(query),frame={url:()=>current,evaluate:async(fn,input)=>fn(input,doc(login?'<input type="password">':blank?'':ticks<loading?'<p>Loading…</p>':operation?row:empty(wrongMessage?'other item':query)))};
 return {url:()=>current,frames:()=>[frame],waitForTimeout:async()=>{ticks++;},ticks:()=>ticks};
}
test('supplier wording creates generic alternatives without a component whitelist or dropping positions from the repair',()=>{
 const options=haynesWordingOptions(request,'abs sensor',selectedPart);
 assert.deepEqual(options.map(o=>o.searchQuery),['wheel speed sensor']);
 for(const [description,wanted] of [['Track Control Arm / Wishbone - Front LH','track control arm'],['Coolant Temperature Sender / Temperature Sensor','coolant temperature sender'],['Fuel Pressure Regulator','fuel pressure regulator']]){
  const found=haynesWordingOptions(request,'abs sensor',{description});assert.ok(found.some(o=>o.searchQuery===wanted),description);
 }
 assert.equal(repairScope.resolve(request.work).side,'left');assert.equal(request.choices.labour,undefined);
 assert.deepEqual(haynesWordingOptions(request,'abs sensor'),[]);
 assert.ok(haynesWordingOptions(request,'abs sensor',{description:'<script>bad()</script>'}).every(o=>!o.label.includes('<')));
});
test('only a visible explicit empty message for the current search triggers wording fallback',()=>{
 for(const [html,expected] of [[empty('abs sensor'),true],['<div hidden>'+empty('abs sensor')+'</div>',false],[empty('radiator'),false],['<p>Loading…</p>',false],['',false]])assert.equal(readHaynesRepairPage({query:'abs sensor'},doc(html)).noResults,expected);
});
test('confirmed empty search waits for stability then offers Did you mean without timing out or accepting labour',async()=>{
 const page=pageFixture('abs sensor',{loading:5});let result;
 await assert.rejects(lookupHaynesLabourChoices(page,request,{vehicle,query:'abs sensor',selectedPart}),e=>{result=cleanRepairChoices(e.result,request);return e.code==='CHOICE_REQUIRED';});
 assert.equal(result.selectionKind,'wording');assert.equal(result.stage,'HAYNES_MENU');assert.equal(result.options[0].searchQuery,'wheel speed sensor');
 assert.ok(result.options.every(o=>o.hoursMilli===undefined));assert.equal(result.selectedPart.inStock,false);assert.ok(page.ticks()>=7&&page.ticks()<10);
 const next=await promptRepairChoice({question:async()=>'1'},request,result);
 assert.equal(next.work,request.work);assert.deepEqual(next.choices,{gsfCategory:categoryId,part:partId,labourSearch:'wheel speed sensor'});
 let operations;await assert.rejects(lookupHaynesLabourChoices(pageFixture('wheel speed sensor',{operation:true}),next,{vehicle,query:next.choices.labourSearch,selectedPart}),e=>{operations=cleanRepairChoices(e.result,next);return e.code==='CHOICE_REQUIRED';});
 assert.equal(operations.stage,'HAYNES_LABOUR');assert.equal(operations.options[0].hoursMilli,500);assert.match(operations.options[0].label,/Renew the front left/);
 const confirmed=await promptRepairChoice({question:async()=>'1'},next,operations);
 const answer=await lookupHaynesLabourChoices(pageFixture('wheel speed sensor',{operation:true}),confirmed,{vehicle,query:confirmed.choices.labourSearch,choices:confirmed.choices,selectedPart});
 assert.equal(answer.labour.hoursMilli,500);assert.equal(answer.labour.operationId,'1M50010000WV0');
});
test('blank, stale-message and signed-out pages do not masquerade as empty supplier results',async()=>{
 for(const config of [{blank:true},{wrongMessage:true},{login:true}])await assert.rejects(lookupHaynesLabourChoices(pageFixture('abs sensor',config),request,{vehicle,query:'abs sensor',selectedPart}),e=>e.code!=='CHOICE_REQUIRED');
});
test('wording choices clear old menus and labour while retaining quantity, mode and confirmed part',async()=>{
 const r=repairRequest({...request,work:'Fit 2 front left ABS sensors',operation:undefined,quantity:undefined,choices:{...request.choices,menus:['Sensors'],labour:'b'.repeat(32)}});
 const result={stage:'HAYNES_MENU',selectionKind:'wording',options:haynesWordingOptions(r,'abs sensor',selectedPart)};
 const next=await promptRepairChoice({question:async()=>'1'},r,result);assert.equal(next.quantity,2);assert.equal(next.work,r.work);assert.deepEqual(next.choices,{gsfCategory:categoryId,part:partId,labourSearch:'wheel speed sensor'});
 assert.deepEqual(await promptHaynesLabourChoice({question:async()=>'1'},{menus:['Sensors'],labour:'b'.repeat(32)},result),{labourSearch:'wheel speed sensor'});
 const fitOnly=repairRequest({registration:'YX13OEG',work:'Fit only front left ABS sensor',flow:'guided-v1'});
 const labour=await promptRepairChoice({question:async()=>'1'},fitOnly,result);assert.equal(labour.lookup,'labour');assert.equal(labour.choices.part,undefined);
});
test('wording protocol rejects prices, missing search text and use as a labour confirmation',()=>{
 const result={request,stage:'HAYNES_MENU',selectionKind:'wording',options:haynesWordingOptions(request,'abs sensor',selectedPart),selectedPart,checkedAt:new Date().toISOString()};
 assert.equal(cleanRepairChoices(result,request).options[0].searchQuery,'wheel speed sensor');
 for(const mutate of [r=>r.stage='HAYNES_LABOUR',r=>delete r.selectionKind,r=>delete r.options[0].searchQuery,r=>r.options[0].hoursMilli=500,r=>r.options[0].costPence=1,r=>r.options[0].searchQuery='x'.repeat(151)]){const bad=structuredClone(result);mutate(bad);assert.throws(()=>cleanRepairChoices(bad,request),/INVALID_CHOICES/);}
});
test('an empty suggestion list still permits a manual retry and cancellation',async()=>{
 const result={stage:'HAYNES_MENU',selectionKind:'wording',options:[]};
 const retry=await promptRepairChoice({question:async()=>'wheel speed sensor'},request,result);assert.equal(retry.choices.labourSearch,'wheel speed sensor');
 assert.equal(await promptRepairChoice({question:async()=>'Q'},request,result),null);
});
