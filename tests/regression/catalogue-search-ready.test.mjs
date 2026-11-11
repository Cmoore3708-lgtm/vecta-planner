import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readCatalogueSearchState,findCatalogueSearch} from '../../workers/repair-quotes/catalogue-search.mjs';
import {discoverRepairCategory} from '../../workers/repair-quotes/general-gsf.mjs';
const state=html=>readCatalogueSearchState(parseHTML('<html><body>'+html+'</body></html>').document);
const ready=()=>state('<input type="search" placeholder="Search parts or categories" value="DO_NOT_CAPTURE">');
test('catalogue search accepts observed label, placeholder, title and search input variants',()=>{
 for(const html of ['<input aria-label="Search for OE (cross ref), aftermarket or categories like Air filter">','<input type="search" placeholder="Search parts">','<label for="lookup">Find a product</label><input id="lookup">','<b id="caption">Search catalogue categories</b><input aria-labelledby="caption">','<input title="Search for OE">']){
  const result=state(html);assert.equal(result.fields.filter(f=>f.catalogue).length,1,html);
 }
});
test('registration/account controls, disabled fields and hidden mobile duplicates are not used',()=>{
 const result=state('<input placeholder="Enter reg / VIN"><input placeholder="Search customer"><input type="email" placeholder="Search parts" value="private@example.com"><input disabled placeholder="Search parts"><div style="display:none"><input placeholder="Search parts"></div><input placeholder="Search parts" value="SECRET">');
 assert.equal(result.fields.filter(f=>f.catalogue).length,1);assert.doesNotMatch(JSON.stringify(result),/SECRET|private@example|value/);
 assert.equal(state('<input type="password" value="private-password">').loginVisible,true);
 assert.equal(state('<input hidden type="password">').loginVisible,false);
});
function fake(states){
 let reads=0,waits=0;const control={count:async()=>1,isVisible:async()=>true,fill:async()=>{},press:async()=>{}};
 const page={url:()=> 'https://trade.gsfcarparts.com/',evaluate:async()=>{const next=states[Math.min(reads++,states.length-1)];if(next instanceof Error)throw next;return next;},locator:()=>control,waitForTimeout:async()=>{waits++;}};
 return {page,control,counts:()=>({reads,waits})};
}
test('waits for GSF hydration instead of failing on the first empty render',async()=>{
 const f=fake([state('<p>Loading</p>'),state('<input placeholder="Enter reg / VIN">'),ready()]);
 assert.equal(await findCatalogueSearch(f.page,{attempts:4}),f.control);assert.deepEqual(f.counts(),{reads:3,waits:2});
});
test('a redirect during hydration is retried, while sign-in is reported distinctly',async()=>{
 const f=fake([Error('Execution context was destroyed'),ready()]);assert.equal(await findCatalogueSearch(f.page,{attempts:3}),f.control);
 for(const login of [fake([state('<input type="password">')]).page,{url:()=> 'https://trade.gsfcarparts.com/signin'}])await assert.rejects(findCatalogueSearch(login,{attempts:1}),e=>e.code==='LOGIN_REQUIRED'&&e.supplier==='GSF');
});
test('ambiguous or missing search controls never select an arbitrary field and retain safe diagnostics',async()=>{
 const ambiguous=fake([state('<input placeholder="Search parts"><input type="search" placeholder="Search products">')]);
 await assert.rejects(findCatalogueSearch(ambiguous.page,{attempts:2}),e=>e.detail==='CATALOGUE_SEARCH_AMBIGUOUS'&&e.observed.fields.length===2);
 const missing=fake([state('<input type="text" placeholder="Enter reg / VIN" value="AB12CDE"><input type="hidden" value="SECRET">')]);
 await assert.rejects(findCatalogueSearch(missing.page,{attempts:2}),e=>e.detail==='CATALOGUE_SEARCH_UNAVAILABLE'&&!JSON.stringify(e.observed).includes('AB12CDE')&&!JSON.stringify(e.observed).includes('SECRET'));
 assert.equal(missing.counts().reads,2);
});
test('radiator category lookup waits for the delayed actual search field then uses its observed category link',async()=>{
 const f=fake([state('<p>Loading</p>'),ready()]);let filled='',submitted=0;
 f.page.goto=async()=>{};f.control.fill=async q=>{filled=q;};f.control.press=async()=>{submitted++;};
 f.page.locator=selector=>selector==='a[href]'?{evaluateAll:async()=>[{href:'/parts/Radiator',text:'Radiator'}]}:f.control;
 assert.equal(await discoverRepairCategory(f.page,'radiator'),'Radiator');assert.equal(filled,'radiator');assert.equal(submitted,0);assert.equal(f.counts().reads,2);
});
