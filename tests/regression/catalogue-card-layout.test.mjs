import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readRepairGroups,selectedRepairProduct,waitForSelectedRepairProduct,lookupGeneralGSF} from '../../workers/repair-quotes/general-gsf.mjs';
import {repairRequest,cleanRepairChoices,calculateRepairQuote} from '../../lib/repair-quote.js';
import {lookupGeneralRepair} from '../../workers/repair-quotes/general-repair.mjs';
import {requireChoice} from '../../workers/repair-quotes/choice-result.mjs';

// Synthetic structure using the observed v7 card texts and missing headings /
// links. It is not a captured supplier DOM or a live compatibility assertion.
const card=(price,stock,brand='ava',description='Radiator',radio='')=>`<div class="choice">${radio}<img alt="" src="https://gsfappstorage.blob.core.windows.net/catalogue-assets/Brands/${brand}.svg"><div>£${price} <span>${price==='0.00'?'Bronze':'Gold'}</span> ${description} <span>${stock}</span></div></div>`;
const unavailable=()=>card('0.00','Out Of Stock','','');
const group=(sku,body,summary='')=>`<section><p>Radiator</p><p>SKU: ${sku}</p><button>Attributes</button><div class="alternatives">${body}</div>${summary}</section>`;
const fixture=(reference='')=>group('AVAFIX100',card('124.40','Out Of Stock')+card('152.16','Out Of Stock','other')+unavailable().repeat(5),'<h6>£124.40</h6>'+reference)+group('AVAFIX200',card('113.97','Branch Network')+card('165.31','Out Of Stock','other')+unavailable().repeat(4));
const doc=html=>parseHTML('<html><body><main>'+html+'</main></body></html>').document;
const read=html=>readRepairGroups(doc(html));

test('plain titles, duplicated price headings and unavailable placeholders retain the two observed groups',()=>{
 const result=read(fixture());assert.equal(result.complete,true);assert.equal(result.groups.length,2);
 assert.deepEqual(result.groups.map(g=>g.description),['Radiator','Radiator']);
 assert.deepEqual(result.groups.map(g=>g.summaryPriceCount),[1,0]);
 assert.deepEqual(result.groups.map(g=>g.unavailableCount),[5,4]);
 assert.deepEqual(result.groups.flatMap(g=>g.options.filter(o=>o.inStock).map(o=>[g.sku,o.brand,o.pricePence])),[['AVAFIX200','ava',11397]]);
 assert.equal(result.groups[1].links.length,0);
});
test('only a single separate duplicate heading is excluded; unknown or extra cards still fail',()=>{
 const body=card('124.40','NDC')+card('152.16','RDC','other');
 for(const summary of ['<h6>£99.00</h6>','<h6>£124.40</h6><h6>£124.40</h6>','<div>£124.40 Unknown option</div>'])assert.equal(read(group('AVAFIX100',body,summary)).complete,false);
 assert.equal(read(group('AVAFIX100',body+'<h6>£124.40</h6>')).complete,false);
 assert.equal(read(group('AVAFIX100',body+card('0.00','NDC','',''))).complete,false);
 const mixed=read(group('AVAFIX100',body+card('10.00','RDC','third','Radiator Cap')));assert.equal(mixed.complete,false);assert.equal(mixed.groups[0].description,'');
});
test('decorative badges and grade labels containing icons do not create or remove priced cards',()=>{
 const html=fixture().replace('<h6>£124.40</h6>','<span>Gold</span><h6>£124.40</h6>').replace('<span>Gold</span> Radiator','<span>Gold<svg><path></path></svg></span> Radiator');
 const result=read(html),checks=result.groups[0].checks;
 assert.equal(result.complete,true);assert.equal(checks.priceCount,8);assert.equal(checks.parsedCardCount,7);
 assert.deepEqual(checks.cardGradeCounts,[1,1,1,1,1,1,1]);assert.equal(checks.decorativeGradeCount,1);assert.equal(checks.summaryPriceCount,1);assert.deepEqual(checks.unparsedPriceNodes,[]);
 const double=read(group('AVAFIX100',card('124.40','NDC').replace(' Radiator',' <b>Silver</b> Radiator')));
 assert.equal(double.complete,false);assert.equal(double.groups[0].checks.cardGradesValid,false);
});
test('every unrecognised price stays a failure with a precise, bounded diagnostic',()=>{
 const result=read(fixture().replace('<h6>£124.40</h6>','<h6>£99.00</h6>'));
 assert.equal(result.complete,false);assert.equal(result.groups[0].checks.pricesAccounted,false);
 assert.deepEqual(result.groups[0].checks.unparsedPriceNodes,[{tag:'h6',text:'£99.00'}]);
 const unknown=read(group('AVAFIX100',card('124.40','NDC')+'<div>£5.00 Mystery part Local Branch</div>'));
 assert.equal(unknown.complete,false);assert.equal(unknown.groups[0].checks.priceCount,2);assert.equal(unknown.groups[0].checks.parsedCardCount,1);
});
test('the observed RRP is reference information, not another priced part or a quote amount',()=>{
 for(const reference of ['<p>RRP: £212.58</p>','<div><p><span>RRP:</span> <span>£212.58</span></p></div>']){
  const result=read(fixture(reference)),checks=result.groups[0].checks;
  assert.equal(result.complete,true);assert.equal(checks.priceCount,9);assert.equal(checks.parsedCardCount,7);
  assert.equal(checks.summaryPriceCount,1);assert.equal(checks.rrpPriceCount,1);assert.equal(checks.pricesAccounted,true);assert.deepEqual(checks.unparsedPriceNodes,[]);
  assert.deepEqual(result.groups.flatMap(g=>g.options.filter(o=>o.inStock).map(o=>o.pricePence)),[11397]);
  assert.ok(result.groups.every(g=>g.options.every(o=>o.pricePence!==21258)));
 }
 for(const part of ['Alternator','Brake Pad Set','Fuel Pressure Regulator'])assert.equal(read(fixture('<p>RRP: £212.58</p>').replaceAll('Radiator',part)).complete,true);
});
test('reference prices cannot conceal unknown prices, interactive choices or incomplete cards',()=>{
 for(const reference of ['<p>£212.58</p>','<p>Price: £212.58</p>','<p>RRP: £212.58 £5.00</p>','<p>RRP: £212.58 Radiator</p>','<button>RRP: £212.58</button>','<p>RRP: <button>£212.58</button></p>','<p>RRP: £212.58</p><p>RRP: £300.00</p>','<p>RRP: £212.58</p><p>Unknown price: £5.00</p>'])assert.equal(read(fixture(reference)).complete,false,reference);
 const broken=read(group('AVAFIX100','<div>£124.40 Unrecognised part NDC</div>','<p>RRP: £212.58</p>'));
 assert.equal(broken.complete,false);assert.equal(broken.groups[0].checks.parsedCardCount,0);
 const nested=read(group('AVAFIX100',card('124.40','NDC').replace('<span>NDC</span>','<p>RRP: £212.58</p><span>NDC</span>')));
 assert.equal(nested.complete,false);
});
test('radio/image siblings stay with their card, and a stale checked attribute cannot override live state',()=>{
 const d=doc(group('AVAFIX100',card('124.40','NDC','ava','Radiator','<input type="radio" checked>')+card('152.16','RDC','other','Radiator','<input type="radio">')));
 let result=readRepairGroups(d);assert.equal(result.groups[0].options[0].selected,true);assert.equal(result.groups[0].options[0].brand,'ava');
 assert.equal(d.querySelector(result.groups[0].options[0].selector).querySelectorAll('input').length,1);
 Object.defineProperty(d.querySelector('input'),'checked',{value:false});result=readRepairGroups(d);assert.equal(result.groups[0].options[0].selected,false);
});
test('the observed full SKU supplies the calibrated detail route when there is no product link',()=>{
 const g=read(fixture()).groups[1],option=g.options[0];
 assert.equal(selectedRepairProduct(g,option).url,'https://trade.gsfcarparts.com/partdetails/AVAFIX200');
 for(const sku of ['', '../basket','WRONG/CODE','https://example.test'])assert.throws(()=>selectedRepairProduct({...g,sku},option),e=>e.detail==='SELECTED_PRODUCT_SKU_MISSING');
 assert.throws(()=>selectedRepairProduct({...g,links:['/partdetails/OTHER']},option),/PRODUCT_LINK_UNCONFIRMED/);
 assert.throws(()=>selectedRepairProduct({...g,links:['/partdetails/AVAFIX200','/partdetails/OTHER']},option),e=>e.detail==='SELECTED_PRODUCT_LINK_AMBIGUOUS');
 assert.equal(selectedRepairProduct({...g,options:[{...option,brand:''}]},{...option,brand:''}).searchTerm,g.sku);
 assert.throws(()=>selectedRepairProduct({...g,options:[option,option]},option),e=>e.detail==='SELECTED_OPTION_NOT_CONFIRMED');
 assert.equal(selectedRepairProduct({...g,sku:'MANW123/4',links:['/partdetails/MANW123%2F4']},option).url,'https://trade.gsfcarparts.com/partdetails/MANW123%2F4');
});
test('semantic selection evidence must match; an unrelated checked card cannot establish selection',()=>{
 const g=read(fixture()).groups[1],option=g.options[0];
 assert.throws(()=>selectedRepairProduct({...g,options:g.options.map((o,i)=>({...o,selectionControlPresent:true,selected:i===1}))},option),e=>e.detail==='SELECTED_OPTION_NOT_CONFIRMED');
 const selected={...g,options:g.options.map((o,i)=>({...o,selectionControlPresent:true,selected:i===0}))};
 assert.equal(selectedRepairProduct(selected,option).searchTerm,'AVAFIX200');
});
test('unreadable brands require a unique price/description when selection controls are absent',()=>{
 const g=read(fixture()).groups[1],option={...g.options[0],brand:''};
 assert.equal(selectedRepairProduct({...g,options:[option]},option).searchTerm,g.sku);
 for(const duplicate of [{...option,brand:'Other'},{...option,grade:'Silver'},{...option,inStock:false,brand:'Other'}]){
  assert.throws(()=>selectedRepairProduct({...g,options:[option,duplicate]},option),e=>['SELECTED_PRODUCT_IDENTITY_AMBIGUOUS','SELECTED_OPTION_NOT_CONFIRMED'].includes(e.detail));
 }
});
test('selection waits for stable refreshed SKU evidence and keeps checking the vehicle',async()=>{
 const group=read(fixture()).groups[1],option=group.options[0];let tick=0;
 const page={url:()=> 'https://trade.gsfcarparts.com/parts/848',waitForTimeout:async()=>{tick++;},evaluate:async fn=>fn.name==='readServiceCategory'?{registration:'AB12CDE',selectedRegistration:true}:{complete:true,groups:[{...group,sku:tick<2?'AVAFIXOLD':'AVAFIX200'}]}};
 assert.equal((await waitForSelectedRepairProduct(page,'AB12CDE','848',group,option)).target.searchTerm,'AVAFIX200');assert.equal(tick,5);
 page.evaluate=async()=>({registration:'WRONG',selectedRegistration:false});await assert.rejects(waitForSelectedRepairProduct(page,'AB12CDE','848',group,option),e=>e.detail==='VEHICLE_CHANGED');
});
function lookupFixture({missingBrand=false,reference='',allOutOfStock=false}={}){
 let url='https://trade.gsfcarparts.com/',productOverride={};const events=[],document=doc(missingBrand?fixture(reference).replaceAll('https://gsfappstorage.blob.core.windows.net/catalogue-assets/Brands/ava.svg','/images/unreadable-logo.svg'):fixture(reference));
 if(allOutOfStock){for(const el of document.querySelectorAll('span'))if(el.textContent==='Branch Network')el.textContent='Out Of Stock';}
 const request=repairRequest({registration:'AB12CDE',work:'Supply and fit radiator',flow:'guided-v1'});
 const page={url:()=>url,goto:async value=>{url=value;events.push(value);},waitForTimeout:async()=>{},keyboard:{press:async()=>{}},locator:selector=>({count:async()=>1,isVisible:async()=>true,fill:async()=>{},press:async()=>{},click:async()=>{events.push(document.querySelector(selector)?.textContent?.trim()||selector);},evaluateAll:async()=>[{href:'/parts/848',text:'Radiator'}]}),evaluate:async(fn,input)=>{
  if(fn.name==='readCatalogueResults')return {controls:[],emptyMessages:[],pageState:{busy:false}};
  if(fn.name==='readCatalogueSearchState')return {fields:[{catalogue:true,selector:'#search'}]};
  if(fn.name==='readRepairGroups')return readRepairGroups(document);
  if(fn.name==='readServiceCategory')return {status:'CAPTURED_FOR_REVIEW',registration:request.registration,selectedRegistration:true,visibleText:'Fixture vehicle'};
  if(fn.name==='readServiceAttributes')return {status:'ATTRIBUTES_CAPTURED',rows:[{attribute:'Core width',value:'Fixture width'}]};
  if(fn.name==='readProductDialog'){events.push({productOptions:input});return {unitNetPence:11397,description:'Radiator',brand:'AVA',sku:'FIX200',inStock:true,stock:[{quantity:1}],vatBasis:'EX_VAT',...productOverride};}
  throw Error('Unexpected reader '+fn.name);
 }};
 const deps={selectVehicle:async()=>({registration:request.registration,selectedRegistration:true})};
 return {request,page,deps,events,changeProduct:value=>{productOverride=value;}};
}
test('observed catalogue shape offers its available part, then verifies the selected SKU without an anchor',async()=>{
 const f=lookupFixture();let options;
 await assert.rejects(lookupGeneralGSF(f.page,f.request,f.deps),e=>{options=e.result?.options;return e.code==='CHOICE_REQUIRED'&&e.result.stage==='GSF_PART';});
 assert.equal(options.length,4);assert.equal(options[0].costPence,11397);
 const selected=repairRequest({...f.request,choices:{part:options[0].id}}),result=await lookupGeneralGSF(f.page,selected,f.deps);
 assert.equal(result.part.sku,'FIX200');assert.equal(result.part.costPence,11397);assert.equal(result.part.brand,'AVA');
 assert.ok(f.events.includes('https://trade.gsfcarparts.com/partdetails/AVAFIX200'));
 for(const changed of [{unitNetPence:11398},{brand:'OTHER'},{sku:'WRONG'},{inStock:false},{stock:[{quantity:0}]},{vatBasis:'INC_VAT'}]){
  f.changeProduct(changed);await assert.rejects(lookupGeneralGSF(f.page,selected,f.deps),e=>e.detail==='SELECTED_PRODUCT_CHANGED');
 }
});
test('the RRP-bearing catalogue still offers its part and resolves the missing logo from product details',async()=>{
 const f=lookupFixture({missingBrand:true,reference:'<p>RRP: £212.58</p>'});let options;
 await assert.rejects(lookupGeneralGSF(f.page,f.request,f.deps),e=>{options=e.result?.options;return e.code==='CHOICE_REQUIRED';});
 assert.ok(!options[0].label.toLowerCase().includes('ava'));assert.equal(options.length,4);assert.equal(options[0].costPence,11397);
 const selected=repairRequest({...f.request,choices:{part:options[0].id}}),result=await lookupGeneralGSF(f.page,selected,f.deps);
 assert.equal(result.part.brand,'AVA');assert.equal(result.part.sku,'FIX200');assert.equal(result.part.costPence,11397);
 for(const changed of [{brand:''},{unitNetPence:11398},{description:'Radiator Cap'},{sku:'WRONG'},{inStock:false}]){
  f.changeProduct(changed);await assert.rejects(lookupGeneralGSF(f.page,selected,f.deps),e=>e.detail==='SELECTED_PRODUCT_CHANGED');
 }
});
test('priced out-of-stock parts pass explicit GSF and Haynes choices without losing their stock status',async()=>{
 for(const allOutOfStock of [false,true]){
  const f=lookupFixture({missingBrand:true,reference:'<p>RRP: £212.58</p>',allOutOfStock}),now=Date.now(),stamp=new Date(now).toISOString(),labourId='b'.repeat(32);let options,haynesCalls=0;
  const deps={now:()=>now,gsf:(page,r)=>lookupGeneralGSF(page,r,{...f.deps,now:()=>now}),haynes:async(_page,r,{selectedPart})=>{
   haynesCalls++;assert.equal(selectedPart.inStock,false);
   if(!r.choices.labour)requireChoice(r,'HAYNES_LABOUR',[{id:labourId,label:'Renew radiator',detail:'Synthetic Haynes operation',hoursMilli:700}],{now:()=>now,selectedPart});
   return {variant:'Fixture vehicle',labour:{source:'HAYNES_PRO',registration:r.registration,variant:'Fixture vehicle',operation:r.operation,operationId:'1BR1234567',operationLabel:'Renew radiator',hoursMilli:700,unit:'hours',scopeConfirmed:true,checkedAt:stamp,choiceId:labourId}};
  }};
  await assert.rejects(lookupGeneralRepair({gsfPage:f.page},f.request,deps),e=>{options=cleanRepairChoices(e.result,f.request,{now}).options;return e.code==='CHOICE_REQUIRED';});
  assert.equal(haynesCalls,0);assert.equal(options.length,4);assert.ok(options.every(o=>o.costPence>0&&o.costPence!==21258));
  assert.equal(options[0].inStock,!allOutOfStock);
  const chosen=options.find(o=>o.costPence===12440);assert.equal(chosen.inStock,false);
  f.changeProduct({unitNetPence:12440,sku:'FIX100',inStock:false,stock:[{quantity:0}]});
  const selected=repairRequest({...f.request,choices:{part:chosen.id}});
  await assert.rejects(lookupGeneralRepair({gsfPage:f.page},selected,deps),e=>{const cleaned=cleanRepairChoices(e.result,selected,{now});assert.equal(cleaned.selectedPart.inStock,false);return e.code==='CHOICE_REQUIRED'&&cleaned.stage==='HAYNES_LABOUR';});
  const final=repairRequest({...selected,choices:{...selected.choices,labour:labourId}}),evidence=await lookupGeneralRepair({gsfPage:f.page},final,deps),quote=calculateRepairQuote(evidence,final,{now});
  assert.equal(quote.part.inStock,false);assert.equal(quote.part.costPence,12440);assert.equal(quote.chargedHoursMilli,1000);assert.equal(quote.netPence+quote.vatPence,quote.totalIncVatPence);
  assert.ok(f.events.some(e=>e.productOptions?.allowUnavailablePrice===true));
  for(const changed of [{unitNetPence:12441},{sku:'WRONG'},{vatBasis:'INC_VAT'},{inStock:true},{brand:''}]){
   f.changeProduct({unitNetPence:12440,sku:'FIX100',inStock:false,stock:[{quantity:0}],...changed});
   await assert.rejects(lookupGeneralRepair({gsfPage:f.page},final,deps),e=>e.detail==='SELECTED_PRODUCT_CHANGED');
  }
 }
});
