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

// Core DOM structure observed directly in TradeHub on 12 November. No account
// data, remote assets or supplier actions are needed to replay these cards.
const observedCard=(code,label,price)=>'<div class="MuiBox-root css-1tzyzib"><div class="transition group-hover:text-[#ed1c24] text-base md:text-base font-semibold line-clamp-1 MuiBox-root css-c7yo1x">'+code+'</div><div class="MuiBox-root css-10kmt1v">'+label+'</div><p class="MuiTypography-root MuiTypography-body1 css-1sxzzle">£'+price+'</p><div><span>In stock.</span></div><div><span data-testid="basket-count" aria-label="current basket count"><button data-testid="add-basket-button">Add to basket</button><span>0</span></span></div></div>';
test('observed unprefixed manufacturer codes remain paired with their own description and price',()=>{
 const d=doc('<main>'+observedCard('6PU012039-011','Wheel Speed / ABS Sensor - Front/Rear LH','38.95')+observedCard('21.0134','Wheel Speed / ABS Sensor - Rear','21.18')+observedCard('0265007790','ABS Sensor','48.58')+'</main>');
 const products=readSearchProducts({query:'abs sensor'},d).products;
 assert.deepEqual(products.map(p=>[p.sku,p.displayPricePence]),[['6PU012039-011',3895],['21.0134',2118],['0265007790',4858]]);
 for(const p of products){assert.equal(d.querySelector(p.selector).textContent,p.label);assert.equal(d.querySelector(p.selector).closest('button'),null);}
 assert.ok(searchProductChoices(products,request).some(c=>c.choice.detail.startsWith('SKU 6PU012039-011')));
});
test('equal names and prices no longer hide distinct manufacturer parts or lose selection after reordering',()=>{
 const a=observedCard('SS20301','ABS Sensor','28.83'),b=observedCard('SS20211','ABS Sensor','28.83');
 const options=html=>searchProductChoices(readSearchProducts({query:'abs sensor'},doc('<main>'+html+'</main>')).products,request);
 const choices=options(a+b);assert.equal(choices.length,2);assert.notEqual(choices[0].choice.id,choices[1].choice.id);
 assert.equal(choices[0].choice.id,options(b+a)[1].choice.id);assert.equal(choices[0].product.sku,'SS20301');
});
test('manufacturer-code capture excludes hidden codes, dimensions, counts and purchase controls',()=>{
 const cards=['<span hidden>SS20301</span>','<span>711mm</span>','<span>24V</span>','<span>12</span>','<button>SS20301</button>','<div><button>SS20301</button></div>'];
 for(const before of cards){const products=readSearchProducts({query:'abs sensor'},doc('<main><div>'+before+'<div>ABS sensor</div><p>£20.00</p></div></main>')).products;assert.equal(products.length,1);assert.equal(products[0].sku,'',before);}
 const outside=readSearchProducts({query:'abs sensor'},doc('<main><div>SS20301</div>'+card('ABS sensor')+'</main>')).products;assert.equal(outside[0].sku,'');
});
test('contradictory labelled and unprefixed identifiers remain unresolved rather than choosing one',()=>{
 const products=readSearchProducts({query:'abs sensor'},doc('<main><div><p>SKU: SS20211</p><div>SS20301</div><div>ABS sensor</div><p>£20.00</p></div></main>')).products;
 assert.equal(products.length,1);assert.equal(products[0].sku,'');
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
