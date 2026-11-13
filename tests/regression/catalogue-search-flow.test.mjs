import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readSearchProducts,searchProductChoices} from '../../workers/repair-quotes/catalogue-products.mjs';
import {readCatalogueResults,categoryChoiceId} from '../../workers/repair-quotes/catalogue-results.mjs';
import {discoverRepairCategory,scopesForFitment,gsfPartChoices} from '../../workers/repair-quotes/general-gsf.mjs';
import {repairRequest,repairScope,cleanRepairChoices} from '../../lib/repair-quote.js';
import {promptRepairChoice} from '../../workers/repair-quotes/checker-input.mjs';
const request=repairRequest({registration:'AB12CDE',work:'Supply and fit abs sensor',flow:'guided-v1'});
const doc=body=>parseHTML('<html><body><main>'+body+'</main></body></html>').document;
const suggestions='<button>ABS / Traction Control Sensor</button><button>ABS Ring</button>';
const card=(price,extra='')=>'<article><div><span>ABS/Traction Control Sensor</span></div><p>£'+price+'</p>'+extra+'</article>';

function browser({delay=0,neverReady=false}={}){
 let url='',reads=0;const clicks=[],progress=[];
 const page={url:()=>url,goto:async v=>{url=v;},waitForTimeout:async()=>{},locator:selector=>({count:async()=>1,isVisible:async()=>true,fill:async()=>{},press:async()=>{url='https://trade.gsfcarparts.com/enhancedSearch/abs%20sensor';},evaluateAll:async()=>[],click:async()=>{clicks.push(selector);url='https://trade.gsfcarparts.com/parts/123';}}),evaluate:async(fn,input)=>{
  if(fn.name==='readCatalogueSearchState')return {fields:[{catalogue:true,selector:'#search'}]};
  if(fn.name==='readServiceCategory')return {selectedRegistration:true,registration:request.registration};
  if(fn===readSearchProducts){reads++;return readSearchProducts(input,doc(suggestions+(neverReady||reads<=delay?'<article><span>ABS Sensor - Front LH</span><p>Price pending</p></article>':card('20.00')+card('30.00'))));}
  if(fn===readCatalogueResults)return readCatalogueResults(input,doc(suggestions+'<p>ABS Sensor - Front LH</p>'));
  throw Error('Unexpected '+fn.name);
 }};
 return {page,clicks,progress,reads:()=>reads,options:{request,selectVehicle:async()=>({selectedRegistration:true}),onProgress:(stage,counts)=>progress.push({stage,...counts})}};
}

test('empty GSF product search offers actual related categories under Did you mean',async()=>{
 const f=browser(),original=f.page.evaluate;
 f.page.evaluate=async(fn,input)=>{
  if(fn===readSearchProducts)return {products:[],productTitleCount:0,busy:false};
  if(fn===readCatalogueResults)return readCatalogueResults(input,doc('<p>No products found</p>'+suggestions));
  return original(fn,input);
 };
 let result;await assert.rejects(discoverRepairCategory(f.page,'abs sensor',f.options),e=>{result=cleanRepairChoices(e.result,request);return e.code==='CHOICE_REQUIRED';});
 assert.equal(result.selectionKind,'wording');assert.ok(result.options.some(o=>o.label==='ABS / Traction Control Sensor'));assert.equal(f.clicks.length,0);
});

test('global product prices never become choices, whether loaded or still pending',async()=>{
 for(const options of [{delay:0},{delay:8},{neverReady:true}]){
  const f=browser(options);let choices;
  await assert.rejects(discoverRepairCategory(f.page,'abs sensor',f.options),e=>{choices=cleanRepairChoices(e.result,request);return e.code==='CHOICE_REQUIRED';});
  assert.equal(choices.selectionKind,'wording');
  assert.deepEqual(choices.options.map(o=>o.label),['ABS / Traction Control Sensor']);
  assert.equal(f.reads(),0);assert.equal(f.clicks.length,0);
  assert.ok(choices.options.every(o=>!o.costPence&&!o.detail.includes('Displayed')));
 }
});

test('an explicit related-category choice opens that category instead of offering broad products again',async()=>{
 const f=browser(),control=readCatalogueResults({query:'abs sensor'},doc(suggestions)).controls[0];
 const chosen=repairRequest({...request,work:'Supply and fit ABS / Traction Control Sensor',choices:{gsfCategory:categoryChoiceId(control)}});
 assert.equal(await discoverRepairCategory(f.page,'abs / traction control sensor',{...f.options,request:chosen}),'123');
 assert.equal(f.clicks.length,1);assert.equal(f.reads(),0);assert.equal(f.progress.at(-1).stage,'GSF_SELECTED_CATEGORY');
});

test('identically named cards show their own displayed prices without asserting VAT or confirmed cost',()=>{
 const products=readSearchProducts({query:'abs sensor'},doc(card('20.00','<p>SKU: FIX100</p>')+card('25.00','<p>SKU: FIX200</p>'))).products;
 const choices=searchProductChoices(products,request).map(c=>c.choice);
 assert.equal(choices.length,2);assert.match(choices[0].detail,/SKU FIX100.*Displayed £20.00.*VAT and vehicle fitment to confirm/);
 assert.match(choices[1].detail,/SKU FIX200.*Displayed £25.00/);
 assert.ok(choices.every(c=>c.costPence===undefined&&c.inStock===undefined));
});

test('fifty nested product cards have bounded style reads and fresh visibility on each snapshot',()=>{
 const d=doc(suggestions+Array.from({length:50},(_,i)=>'<section><div><div><div>'+card((20+i).toFixed(2))+'</div></div></div></section>').join(''));
 let calls=0;d.defaultView.getComputedStyle=n=>{calls++;return n.style;};
 const total=d.querySelectorAll('*').length;
 assert.equal(readSearchProducts({query:'abs sensor'},d).products.length,50);assert.ok(calls<=total,{calls,total});
 calls=0;readCatalogueResults({query:'abs sensor'},d);assert.ok(calls<=total,{calls,total});
 d.querySelector('section').hidden=true;
 assert.equal(readSearchProducts({query:'abs sensor'},d).products.length,49);
});

test('unspecified positions become distinct selectable options without crossing source rows',async()=>{
 const rows=[{attribute:'Fitting Position',value:'Front Axle LH'},{attribute:'Fitting Position',value:'Rear Axle RH'}];
 const scopes=scopesForFitment(rows,repairScope.resolve(request.work));
 assert.deepEqual(scopes.map(s=>[s.axle,s.side]),[['front','left'],['rear','right']]);
 const candidates=scopes.map(scope=>({scope,rows,group:{sku:'FIX100',description:'ABS Sensor'},option:{description:'ABS Sensor',brand:'Fixture',grade:'Gold',pricePence:2000,inStock:false}}));
 const options=gsfPartChoices(candidates,request,'123');
 const result=cleanRepairChoices({request,stage:'GSF_PART',options,checkedAt:new Date().toISOString()},request);
 assert.notEqual(options[0].id,options[1].id);assert.match(options[0].detail,/front left/);assert.match(options[1].detail,/rear right/);
 const chosen=await promptRepairChoice({question:async()=>'2'},request,result,{log:()=>{}});
 assert.equal(chosen.work,'Supply and fit rear right abs sensor');
 assert.deepEqual(scopesForFitment(rows,repairScope.resolve('Fit front right abs sensor')),[]);
});
