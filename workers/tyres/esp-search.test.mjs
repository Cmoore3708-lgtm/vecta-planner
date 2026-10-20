import test from 'node:test';
import assert from 'node:assert/strict';
import {testEspSearch} from './esp-search.mjs';
function mock({wrongButton=false,stale=false,wrongSize=false}={}){
 const filled={},clicks=[];let clicked=false;
 return {filled,clicks,
  locator(selector){return {count:async()=>1,isVisible:async()=>true,fill:async value=>{filled[selector]=value},inputValue:async()=>wrongButton?'Order':'Search',click:async()=>{clicks.push(selector);clicked=true},textContent:async()=>clicked?'new results':'old results'};},
  async waitForFunction(fn,previous){assert.equal(previous,'old results');if(stale)throw Error('timeout');},
  async evaluate(_fn,source){if(source.includes('checkboxCounts'))return {showSellout:true,vatIncluded:true,priceList:'Vecta',multiplier:1};return {products:[{product:wrongSize?'205/55R16 EXAMPLE':'225/45R17 EXAMPLE',sellout:'£70.00',stockColumns:{Default:'5'}}]};}
 };
}
test('ESP search fills confirmed controls, clears speed and only clicks tyre Search',async()=>{
 const page=mock();const result=await testEspSearch(page,'225/45 R17');
 assert.deepEqual(page.filled,{'#key1':'225','#key2':'45','#key3':'17','#key4':''});assert.deepEqual(page.clicks,['#FindProductsButton']);assert.equal(result.productsRead,1);
});
test('changed Search text prevents any click',async()=>{const page=mock({wrongButton:true});await assert.rejects(testEspSearch(page,'225/45R17'),/BUTTON_CHANGED/);assert.equal(page.clicks.length,0);});
test('stale results fail before extraction',async()=>{const page=mock({stale:true});await assert.rejects(testEspSearch(page,'225/45R17'));});
test('results for a different size cannot be reported as the requested size',async()=>{await assert.rejects(testEspSearch(mock({wrongSize:true}),'225/45R17'),/SIZE_MISMATCH/);});
