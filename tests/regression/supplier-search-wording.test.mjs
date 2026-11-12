import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {repairRequest,repairScope,cleanRepairChoices} from '../../lib/repair-quote.js';
import {readCatalogueResults,suggestedCategoryChoices,categoryChoiceId} from '../../workers/repair-quotes/catalogue-results.mjs';
import {readSearchProducts,searchProductChoices} from '../../workers/repair-quotes/catalogue-products.mjs';
import {discoverRepairCategory,productVerificationCategory,searchProductVehicleCategory} from '../../workers/repair-quotes/general-gsf.mjs';

// Result-section/card structure observed in signed-in TradeHub, 12 November.
// These replay the rendered page; none asserts vehicle compatibility.
const doc=html=>parseHTML('<html><body>'+html+'</body></html>').document;
const related=labels=>'<div><div>Related categories</div><div>'+labels.map(label=>'<div><button type="button"><div><img alt="'+label+'"><div><span>'+label+'</span></div></div></button></div>').join('')+'</div></div>';
const card=(sku,label,price,stock='In stock in Group. Get it in 72 hours.')=>'<div><div><button aria-label="Add to favourites"></button></div><div><div><img alt="Product"></div><div><div>'+sku+'</div><div>'+label+'</div><p>'+(price?'£'+price:'Price pending')+'</p><div><span>'+stock+'</span></div><div><span data-testid="basket-count"><button data-testid="add-basket-button">Add to basket</button><span>0</span></span></div></div></div></div>';
const parts=cards=>'<div><div>Parts - '+cards.length+' products found</div><div>'+cards.join('')+'</div></div>';
const search=(query,labels,cards)=>'<main><h1>Search Results for "'+query+'"</h1>'+related(labels)+(cards?parts(cards):'')+'</main>';
const request=work=>repairRequest({registration:'AB12CDE',work,flow:'guided-v1'});
const drops=[card('FDL7578','Stabiliser Rod/Strut - Front LH/RH','26.98'),card('90133373101','Sway Bar Drop Link','23.75'),card('95134379300','Drop Link Bush - Front','5.46'),card('FDL7584','Stabiliser Rod/Strut - Front LH/RH','44.65','Out of stock')];

test('wishbone offers the actual Suspension Arm alternatives without requiring shared search words',()=>{
 const results=readCatalogueResults({query:'wishbone'},doc(search('wishbone',['Suspension Arm','Suspension Arm Bush'])));
 assert.deepEqual(results.controls.map(c=>c.label),['Suspension Arm','Suspension Arm Bush']);
 assert.ok(results.controls.every(c=>c.searchSuggestion===true));
 const choices=suggestedCategoryChoices(results,request('Fit 2 front left wishbone'));
 assert.deepEqual(choices.map(c=>c.work),['Supply and fit 2 front left Suspension Arm','Supply and fit 2 front left Suspension Arm Bush']);
 assert.equal(readSearchProducts({query:'wishbone'},doc(search('wishbone',['Suspension Arm']))).productTitleCount,0);
});

test('alternative category controls must belong to the current visible Related categories section',()=>{
 const html=search('wishbone',['Suspension Arm','Add to basket','Show more','+2 Show more','+2'])+'<aside>'+related(['Unrelated promotion'])+'</aside><button>Unrelated navigation</button><nav><button>Wishbone</button></nav>';
 const d=doc(html);d.querySelector('main').insertAdjacentHTML('beforeend','<div hidden>'+related(['Hidden alternative'])+'</div><section><button>Unrelated recommendation</button></section>');
 const results=readCatalogueResults({query:'wishbone'},d);
 assert.deepEqual(results.controls.map(c=>c.label),['Suspension Arm']);
 assert.deepEqual(readCatalogueResults({query:'radiator'},d).controls,[]);
 assert.deepEqual(readCatalogueResults({query:'wishbone'},doc(search('other term',['Suspension Arm']))).controls,[]);
 assert.deepEqual(readCatalogueResults({query:'wishbone'},doc('<main>'+related(['Suspension Arm'])+'</main>')).controls,[]);
});

test('drop link results retain different supplier names, part numbers, prices and explicit positions',()=>{
 const d=doc(search('drop link',['Stabiliser Link'],drops));
 const snapshot=readSearchProducts({query:'drop link'},d);
 assert.equal(snapshot.products.length,4);assert.equal(snapshot.productTitleCount,4);
 assert.deepEqual(snapshot.products.map(p=>[p.sku,p.displayPricePence]),[['FDL7578',2698],['90133373101',2375],['95134379300',546],['FDL7584',4465]]);
 const choices=searchProductChoices(snapshot.products,request('Fit front drop link'));
 assert.deepEqual(choices.filter(c=>c.product.sku==='FDL7578').map(c=>c.scope.side),['left','right']);
 assert.ok(choices.every(c=>c.choice.costPence===undefined));
 for(const p of snapshot.products)assert.equal(d.querySelector(p.selector).textContent,p.label);
});

test('synonym products cannot come from stale headings, other sections, hidden cards or purchase controls',()=>{
 const d=doc(search('drop link',['Stabiliser Link'],[drops[0]]));
 d.querySelector('main').insertAdjacentHTML('beforeend','<section><h2>Recommended products</h2>'+card('OTHER12','Stabiliser Rod/Strut','1.00')+'</section><div hidden>'+parts([drops[3]])+'</div>');
 assert.deepEqual(readSearchProducts({query:'drop link'},d).products.map(p=>p.sku),['FDL7578']);
 assert.deepEqual(readSearchProducts({query:'radiator'},d).products,[]);
 assert.deepEqual(readSearchProducts({query:'drop link'},doc('<main>'+drops[0]+'</main>')).products,[]);
 const unsafe=doc(search('drop link',[],['<div><div>FDL7578</div><button aria-label="Add to basket">Stabiliser Rod/Strut</button><p>£10.00</p></div>']));
 assert.deepEqual(readSearchProducts({query:'drop link'},unsafe).products,[]);
});

test('unpriced or zero-priced synonym cards cannot divert the lookup to a related category',()=>{
 for(const price of ['', '0.00']){
  const snapshot=readSearchProducts({query:'drop link'},doc(search('drop link',['Stabiliser Link'],[card('FDL7578','Stabiliser Rod/Strut - Front LH/RH',price)])));
  assert.equal(snapshot.products.length,0);assert.equal(snapshot.productTitleCount,1);
 }
});

test('an unpriced synonym never borrows a price from elsewhere in the result section',()=>{
 const d=doc(search('drop link',['Stabiliser Link'],[card('FDL7578','Stabiliser Rod/Strut',''),' <aside><p>£12.00</p></aside>','<div><p>Promotion</p><p>£15.00</p></div>']));
 const snapshot=readSearchProducts({query:'drop link'},d);
 assert.equal(snapshot.products.length,0);assert.equal(snapshot.productTitleCount,1);
});

function browser(render){
 let query='',url='https://trade.gsfcarparts.com/',reads=0;const clicks=[];
 const page={url:()=>url,goto:async v=>{url=v;},keyboard:{press:async()=>{}},waitForTimeout:async()=>{},locator:selector=>({count:async()=>1,isVisible:async()=>true,fill:async value=>{query=value;},press:async()=>{url='https://trade.gsfcarparts.com/enhancedSearch/'+encodeURIComponent(query);},evaluateAll:async()=>[],click:async()=>{clicks.push(doc(render(query,reads)).querySelector(selector)?.textContent);url='https://trade.gsfcarparts.com/parts/123';}}),evaluate:async(fn,input)=>{
  if(fn.name==='readCatalogueSearchState')return {fields:[{catalogue:true,selector:'#search'}]};
  if(fn.name==='readServiceCategory')return {selectedRegistration:true,registration:'AB12CDE'};
  if(fn===readSearchProducts){reads++;return fn(input,doc(render(query,reads)));}
  if(fn===readCatalogueResults)return fn(input,doc(render(query,reads)));
  throw Error('Unexpected '+fn.name);
 }};
 return {page,clicks,reads:()=>reads,selectVehicle:async()=>({selectedRegistration:true})};
}

test('actual product results win over related wording for drop link and lambda sensor searches',async()=>{
 for(const [query,labels,cards] of [['drop link',['Stabiliser Link'],drops],['lambda sensor',['O2 Sensor','Camshaft Sensor','Brake Pad Wear Sensor'],[card('SKU350-34466','Lambda Sensor','52.69'),card('0258986729','Lambda Sensor','95.44')]]]){
  const f=browser(()=>search(query,labels,cards)),r=request('Fit '+query);let result;
  await assert.rejects(discoverRepairCategory(f.page,query,{request:r,selectVehicle:f.selectVehicle}),e=>{result=cleanRepairChoices(e.result,r);return e.code==='CHOICE_REQUIRED';});
  assert.equal(result.selectionKind,'product');assert.ok(result.options.some(o=>o.detail.includes('Displayed £'+(query==='drop link'?'26.98':'52.69'))));assert.deepEqual(f.clicks,[]);
  assert.ok(result.options.every(o=>!labels.includes(o.label)));
 }
});

test('wishbone Did you mean selection preserves scope and opens the selected observed category',async()=>{
 const f=browser(query=>search(query,['Suspension Arm','Suspension Arm Bush'])),r=request('Fit 2 front wishbone');let result;
 await assert.rejects(discoverRepairCategory(f.page,'wishbone',{request:r,selectVehicle:f.selectVehicle}),e=>{result=cleanRepairChoices(e.result,r);return e.code==='CHOICE_REQUIRED';});
 assert.equal(result.selectionKind,'wording');assert.deepEqual(result.options.map(o=>o.label),['Suspension Arm','Suspension Arm Bush']);assert.deepEqual(f.clicks,[]);
 const option=result.options[0],next=repairRequest({...r,work:option.work,choices:{gsfCategory:option.categoryChoice}});
 assert.equal(await discoverRepairCategory(f.page,repairScope.resolve(next.work).query,{request:next,selectVehicle:f.selectVehicle}),'123');
 assert.equal(f.clicks.length,1);assert.equal(next.quantity,2);assert.equal(repairScope.resolve(next.work).axle,'front');
});

test('delayed synonym prices are awaited and unfinished products cannot become wording choices',async()=>{
 for(const ready of [true,false]){
  const f=browser((query,reads)=>search(query,['Stabiliser Link'],[card('FDL7578','Stabiliser Rod/Strut - Front LH/RH',ready&&reads>8?'26.98':'')]));
  await assert.rejects(discoverRepairCategory(f.page,'drop link',{request:request('Fit drop link'),selectVehicle:f.selectVehicle}),e=>ready?e.code==='CHOICE_REQUIRED'&&e.result.selectionKind==='product':e.detail==='SEARCH_PRODUCTS_NOT_READY');
  assert.ok(f.reads()>=10);assert.deepEqual(f.clicks,[]);
 }
});

test('a single supplier synonym category can verify the selected SKU, while ambiguity still stops',async()=>{
 const results=labels=>readCatalogueResults({query:'drop link'},doc(search('drop link',labels,drops)));
 const only=productVerificationCategory(results(['Stabiliser Link']),'drop link');assert.equal(only.label,'Stabiliser Link');
 assert.equal(productVerificationCategory(results(['Stabiliser Link','Stabiliser Link Bush']),'drop link'),null);
 assert.equal(productVerificationCategory({controls:[{label:'Stabiliser Link',path:''}]},'drop link'),null);
 const f=browser(()=>search('drop link',['Stabiliser Link'],drops));
 await f.page.locator('#search').fill('drop link');await f.page.locator('#search').press('Enter');
 const selected={searchUrl:f.page.url(),scope:repairScope.resolve('Fit front left drop link'),productDetails:{sku:'FDL7578',brand:'Fixture',description:'Stabiliser Rod/Strut - Front LH/RH',unitNetPence:2698,inStock:true}};
 assert.equal(await searchProductVehicleCategory(f.page,request('Fit front left drop link'),selected,{selectVehicle:f.selectVehicle}),'123');
 assert.equal(f.clicks.length,1);assert.equal(categoryChoiceId(only).length,32);
});
