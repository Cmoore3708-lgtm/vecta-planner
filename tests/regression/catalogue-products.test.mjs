import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readSearchProducts,searchProductChoices,readSearchProductFitment} from '../../workers/repair-quotes/catalogue-products.mjs';
import {readCatalogueResults} from '../../workers/repair-quotes/catalogue-results.mjs';
import {readCatalogueSearchState} from '../../workers/repair-quotes/catalogue-search.mjs';
import {readServiceCategory} from '../../workers/gsf/service-capture.mjs';
import {readProductDialog} from '../../workers/gsf/product-dialog.mjs';
import {discoverRepairCategory,lookupGeneralGSF} from '../../workers/repair-quotes/general-gsf.mjs';
import {repairRequest,cleanRepairChoices} from '../../lib/repair-quote.js';
import {promptRepairChoice} from '../../workers/repair-quotes/checker-input.mjs';
const request=repairRequest({registration:'AB12CDE',work:'Fit front ABS sensor',flow:'guided-v1'});
const doc=body=>parseHTML('<html><body><input type="search" placeholder="Search parts">'+body+'</body></html>').document;
// Synthetic DOM layouts using the labels observed in the 12 November report.
// Prices below are fixtures, not inferred pairings of its separate title/price lists.
const card=(label,price='20.00',extra='')=>'<article><div><span>'+label+'</span></div><p>£ '+price+'</p>'+extra+'</article>';
const suggestions='<section><button>ABS sensor</button><button>ABS Ring</button><button>Camshaft Sensor</button></section>';
const cards=card('Wheel Speed / ABS Sensor - Front LH')+card('Wheel Speed / ABS Sensor - Front RH','30.00')+card('Wheel Speed / ABS Sensor - Rear LH','40.00')+card('Wheel Speed / ABS Sensor - Front/Rear RH','50.00');
const searchDoc=()=>doc('<main><h1>Search Results for "abs sensor"</h1>'+suggestions+'<section>'+cards+'</section></main>');

test('priced product cards, including non-link titles, are distinct from related category buttons',()=>{
 const d=searchDoc(),snapshot=readSearchProducts({query:'abs sensor'},d);
 assert.equal(snapshot.products.length,4);assert.equal(snapshot.busy,false);
 assert.deepEqual(snapshot.products.map(p=>p.displayPricePence),[2000,3000,4000,5000]);
 for(const p of snapshot.products)assert.equal(d.querySelector(p.selector).textContent,p.label);
 const choices=searchProductChoices(snapshot.products,request);
 assert.equal(choices.length,3);assert.ok(choices.every(c=>c.scope.axle==='front'));assert.deepEqual(choices.map(c=>c.scope.side),['left','right','right']);
 assert.ok(choices.every(c=>c.choice.costPence===undefined&&c.choice.inStock===undefined));
 assert.ok(choices.every(c=>!['ABS sensor','ABS Ring','Camshaft Sensor'].includes(c.choice.label)));
 const chosen=choices[0],next=repairRequest({...request,work:chosen.choice.work,choices:{gsfCategory:chosen.choice.id}});
 assert.equal(searchProductChoices(snapshot.products,next).find(c=>c.choice.id===chosen.choice.id).scope.side,'left');
});

test('product/price association never comes from document order, shared containers, or hidden/purchase controls',()=>{
 const d=doc('<main><div><span>ABS sensor front left</span><span>ABS sensor rear right</span><p>£10.00</p></div>'+card('ABS sensor','0.00')+'<aside>'+card('ABS sensor','9.00')+'</aside><div hidden>'+card('ABS sensor','8.00')+'</div><article><button aria-label="Add to basket">ABS sensor</button><p>£7.00</p></article><article><a href="https://evil.example/partdetails/A">ABS sensor</a><p>£6.00</p></article></main>');
 assert.deepEqual(readSearchProducts({query:'abs sensor'},d).products,[]);
 const duplicate=readSearchProducts({query:'abs sensor'},doc('<main>'+card('ABS sensor','10.00')+card('ABS sensor','10.00')+'</main>'));
 assert.equal(duplicate.products.length,2);assert.deepEqual(searchProductChoices(duplicate.products,request),[]);
});

test('the same product chooser handles arbitrary descriptions and retains supply-only mode',()=>{
 for(const part of ['radiator','fuel pressure regulator','door lock actuator','wheel bearing','starter motor']){
  const r=repairRequest({registration:'AB12CDE',work:'Supply '+part,flow:'guided-v1'}),products=readSearchProducts({query:part},doc('<main>'+card(part)+'</main>')).products;
  const choices=searchProductChoices(products,r);assert.equal(choices.length,1,part);assert.equal(choices[0].scope.lookup,'parts');
 }
});

function browser({fitment=true,vehicle=true,price=2000,description='Wheel Speed / ABS Sensor - Front LH'}={}){
 let url='',opened=false,presses=0,clicks=[];
 const productsDoc=()=>description==='ABS Sensor'?doc('<main>'+suggestions+card(description)+'</main>'):searchDoc();
 const page={keyboard:{press:async()=>{}},url:()=>url,goto:async v=>{url=v;opened=false;},waitForTimeout:async()=>{},evaluate:async(fn,input)=>{
  if(fn===readCatalogueSearchState)return readCatalogueSearchState(doc(suggestions));
  if(fn===readSearchProducts)return readSearchProducts(input,productsDoc());
  if(fn===readCatalogueResults)return readCatalogueResults(input,productsDoc());
  if(fn===readServiceCategory)return {selectedRegistration:vehicle,registration:request.registration,visibleText:'Fixture vehicle'};
  if(fn===readSearchProductFitment)return {fitsSelectedVehicle:fitment,rows:[{attribute:'Fitting Position',value:'Front Axle Left'}]};
  if(fn===readProductDialog){if(!opened)throw Error('PRODUCT_DETAILS_NOT_OPEN');return {description,sku:'SENSOR1',brand:'Fixture',unitNetPence:price,costIncVatPence:Math.round(price*1.2),vatBasis:'EX_VAT',inStock:false,stock:[]};}
  throw Error('Unexpected reader '+fn.name);
 },locator:selector=>({fill:async()=>{},press:async()=>{presses++;url='https://trade.gsfcarparts.com/enhancedSearch/abs%20sensor';},count:async()=>1,isVisible:async()=>true,evaluateAll:async()=>[{href:'https://trade.gsfcarparts.com/parts/123',text:'ABS sensor'}],click:async()=>{clicks.push(selector);opened=true;url='https://trade.gsfcarparts.com/partdetails/SENSOR1';}})};
 return {page,counts:()=>({presses,clicks})};
}
const selectVehicle=async()=>({selectedRegistration:true,registration:request.registration});
async function navigationChoice(f,r=request){let result;await assert.rejects(discoverRepairCategory(f.page,'abs sensor',{request:r,selectVehicle}),e=>{result=e.result;return e.code==='CHOICE_REQUIRED'&&result.selectionKind==='product';});return cleanRepairChoices(result,r);}

test('guided search submits first and prioritises product cards over even an exact related category',async()=>{
 const f=browser(),result=await navigationChoice(f);assert.equal(result.options.length,3);assert.equal(f.counts().presses,1);assert.deepEqual(f.counts().clicks,[]);
 const next=await promptRepairChoice({question:async()=>'1'},request,result,{log:()=>{}});
 assert.equal(next.choices.gsfCategory,result.options[0].id);assert.match(next.work,/front left abs sensor/i);
 const selected=await discoverRepairCategory(f.page,'abs sensor',{request:next,selectVehicle});
 assert.equal(selected.kind,'search-product');assert.equal(selected.productDetails.sku,'SENSOR1');assert.match(f.counts().clicks[0],/span/);
});

test('selected product details supply the verified price, include out-of-stock choices and re-read on final selection',async()=>{
 const f=browser(),result=await navigationChoice(f),r=await promptRepairChoice({question:async()=>'1'},request,result,{log:()=>{}});let choice;
 await assert.rejects(lookupGeneralGSF(f.page,r,{selectVehicle}),e=>{choice=cleanRepairChoices(e.result,r);return e.code==='CHOICE_REQUIRED'&&choice.stage==='GSF_PART';});
 assert.equal(choice.options[0].costPence,2000);assert.equal(choice.options[0].inStock,false);
 const final=await promptRepairChoice({question:async()=>'1'},r,choice,{log:()=>{}}),evidence=await lookupGeneralGSF(f.page,final,{selectVehicle});
 assert.equal(evidence.part.sku,'SENSOR1');assert.equal(evidence.part.costPence,2000);assert.equal(evidence.part.inStock,false);
 assert.equal(f.counts().clicks.length,2);
 for(const options of [{fitment:false},{vehicle:false},{price:2100}]){
  await assert.rejects(lookupGeneralGSF(browser(options).page,final,{selectVehicle}),e=>e.code==='REVIEW_REQUIRED');
 }
});

test('a position discovered in product attributes is offered without losing the selected search product',async()=>{
 const f=browser({description:'ABS Sensor'}),result=await navigationChoice(f),r=await promptRepairChoice({question:async()=>'1'},request,result,{log:()=>{}});let choice;
 await assert.rejects(lookupGeneralGSF(f.page,r,{selectVehicle}),e=>{choice=cleanRepairChoices(e.result,r);return e.code==='CHOICE_REQUIRED';});
 assert.equal(choice.options[0].work,'Supply and fit front left abs sensor');
 const final=await promptRepairChoice({question:async()=>'1'},r,choice,{log:()=>{}});
 assert.equal(final.choices.gsfCategory,r.choices.gsfCategory);
 assert.equal((await lookupGeneralGSF(f.page,final,{selectVehicle})).part.costPence,2000);
});

test('search-page product selection does not assert vehicle fitment from the original registration alone',()=>{
 assert.equal(readSearchProductFitment(doc('<main><button>Check if this part fits your vehicle</button><p>Does this part fit your vehicle?</p></main>')).fitsSelectedVehicle,false);
 assert.equal(readSearchProductFitment(doc('<main><p>This part fits your vehicle.</p><table><tr><td>Fitting Position</td><td>Front Axle Left</td></tr></table></main>')).fitsSelectedVehicle,true);
 assert.equal(readSearchProductFitment(doc('<main><p>This part is not compatible with your vehicle.</p></main>')).fitsSelectedVehicle,false);
 assert.equal(readSearchProductFitment(doc('<main><p>This part fits your vehicle.</p><p>This part is not compatible with your vehicle.</p></main>')).fitsSelectedVehicle,false);
});
