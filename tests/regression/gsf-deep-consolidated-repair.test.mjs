import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {oilFillEvidence} from '../../workers/gsf/oil-capacity.mjs';import {catalogueSelection,freshProduct} from '../../workers/gsf/live-service.mjs';
import {openSelectedProduct} from '../../workers/gsf/product-dialog.mjs';import {diagnosticProduct} from '../../workers/gsf/diagnostic-product.mjs';
const rows=JSON.parse(readFileSync(new URL('../fixtures/gsf-manufacturer-fill-captures.json',import.meta.url)));
test('all thirteen captured engine identities receive only their documented manufacturer refill',()=>{
 assert.equal(rows.length,13);
 for(const row of rows){
  const expected=row.registration==='J8LGH'?4100:row.capture.visibleText.includes('1.3 DIG-T')?5400:5100;
  const result=oilFillEvidence(row.capture,row.registration);assert.equal(result.requiredMl,expected);assert.equal(result.includingFilter,true);assert.match(result.source,/^https:\/\/www.nissan.co.uk\//);
  assert.equal(catalogueSelection(row.capture,'oil',row.registration).quantityMilli,expected);
  for(const capture of [{...row.capture,selectedRegistration:false},{...row.capture,truncated:true},{...row.capture,registration:'WRONG1'},{...row.capture,visibleText:row.capture.visibleText.replace('Petrol','Diesel')},{...row.capture,visibleText:row.capture.visibleText.replace('Nissan','Renault')}])assert.equal(oilFillEvidence(capture,row.registration),null);
  assert.equal(oilFillEvidence(row.capture,'WRONG1'),null);
 }
});
test('new 205 e-Power cannot inherit the 190 engine fill; bottle sizes still cannot establish sump fill',()=>{
 const r=rows.find(r=>r.capture.visibleText.includes('190 e-Power'));
 assert.equal(oilFillEvidence({...r.capture,visibleText:r.capture.visibleText.replace('190 e-Power','205 e-Power')},r.registration),null);
});
function searchPage({duplicates=1,product}={}){
 const events=[];const code={waitFor:async()=>{},count:async()=>duplicates,isVisible:async()=>true,click:async()=>events.push('click-exact-W713/9')};
 return {events,keyboard:{press:async k=>events.push(k)},getByRole(role,opts){
  if(role==='textbox')return {fill:async v=>events.push(v),press:async v=>events.push(v)};
  if(role==='heading')return {waitFor:async()=>events.push(opts.name)};
  assert.equal(role,'main');return {getByText(sku,opts){assert.equal(sku,'W713/9');assert.equal(opts.exact,true);return code;}};
 },url:()=> 'https://trade.gsfcarparts.com/search',evaluate:async()=>product,waitForTimeout:async()=>{},goto:async()=>{throw Error('Broken route must not be used');}};
}
const selected={kind:'oil_filter',searchTerm:'MANW713/9',description:'Oil Filter - Spin-on Filter',expectedPricePence:1606,quantityMilli:1000,packQuantityMilli:1000};
const product={sku:'W713/9',brand:'MANN-FILTER',description:selected.description,unitNetPence:1606};
test('slash SKU uses calibrated exact-code supplier search instead of retrying the broken product route',async()=>{
 const page=searchPage();await openSelectedProduct(page,selected);assert.deepEqual(page.events,['Escape','MANW713/9','Enter','Search Results for "MANW713/9"','click-exact-W713/9']);
 await assert.rejects(openSelectedProduct(searchPage({duplicates:2}),selected),/PRODUCT_LINK_UNCONFIRMED/);
});
test('both live and batch slash readers still reject different manufacturer, SKU, price and description',async()=>{
 for(const reader of [freshProduct,diagnosticProduct]){
  const item=await reader(searchPage({product}),selected);assert.equal(item.sku,'W713/9');
  for(const mutation of [{brand:'OTHER'},{sku:'713/9'},{unitNetPence:1607},{description:'Different filter'}])await assert.rejects(reader(searchPage({product:{...product,...mutation}}),selected),/REVIEW_REQUIRED/);
 }
});

test('a lower-grade first group cannot hide a separate confirmed Gold filter group',()=>{
 const header='PA14GEO Clear Nissan vehicle Diesel Copy VIN ';
 const group=(sku,title,price,grade)=>title+' SKU: '+sku+' In stock. Sort By Relevancy £'+price+' '+grade+' '+title+' Local Branch Stock Type Quantity Boldon 1 RDC 0 NDC 0 £'+price+' RRP: £30.00 ';
 const capture={status:'CAPTURED_FOR_REVIEW',selectedRegistration:true,registration:'PA14GEO',truncated:false,headings:['Cabin Filter - Bio','£6.32','Cabin Filter - Particulate Filter','£14.36'],visibleText:header+group('DRPC12.1086','Cabin Filter - Bio','6.32','Bronze')+group('MANCU26009','Cabin Filter - Particulate Filter','14.36','Gold')};
 const selected=catalogueSelection(capture,'cabin_filter','PA14GEO');assert.equal(selected.searchTerm,'MANCU26009');assert.equal(selected.description,'Cabin Filter - Particulate Filter');assert.equal(selected.expectedPricePence,1436);
 assert.throws(()=>catalogueSelection({...capture,visibleText:capture.visibleText.replace('14.36 Gold','14.36 Silver')},'cabin_filter','PA14GEO'));
 assert.throws(()=>catalogueSelection({...capture,visibleText:capture.visibleText.replace('Cabin Filter - Particulate Filter Local Branch Stock Type Quantity Boldon 1','Cabin Filter - Particulate Filter Local Branch Stock Type Quantity Boldon 0')},'cabin_filter','PA14GEO'));
});
