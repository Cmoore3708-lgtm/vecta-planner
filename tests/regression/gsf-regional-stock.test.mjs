import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {catalogueSelection,lookupLiveService} from '../../workers/gsf/live-service.mjs';
import {readProductDialog} from '../../workers/gsf/product-dialog.mjs';
import {calculateServicePrice} from '../../lib/service-pricing.js';
const report=JSON.parse(readFileSync('tests/fixtures/gsf-xj07wal-service.json','utf8'));
const capture=category=>structuredClone(report.categories.find(c=>c.category===category));
test('observed XJ07WAL air filter is available from RDC when local branch has none',()=>{
 const selected=catalogueSelection(capture('Air Filter'),'air_filter','XJ07WAL');assert.equal(selected.searchTerm,'FRACA12471');assert.equal(selected.expectedPricePence,10000);
 for(const transform of [t=>t.replace('In stock in RDC. Get it tomorrow.','Out of stock.'),t=>t.replace('In stock in RDC. Get it tomorrow.','Not in stock.'),t=>t.replace('Boldon 0 RDC 1 NDC 182','Boldon 0 RDC 0 NDC 0')]){const c=capture('Air Filter');c.visibleText=transform(c.visibleText);assert.throws(()=>catalogueSelection(c,'air_filter','XJ07WAL'),/REVIEW_REQUIRED/);}
});
test('fresh supplier details accept RDC stock wording while still rejecting zero stock and unavailable labels',()=>{
 const fixture=readFileSync('tests/fixtures/gsf-product-dialog.html','utf8');
 for(const label of ['In stock.','In stock in RDC. Get it tomorrow.','In stock in NDC.']){const {document}=parseHTML(fixture.replace('In stock.',label));assert.equal(readProductDialog(document).inStock,true);}
 for(const label of ['Out of stock.','Not in stock.','Call your branch for availability.']){const {document}=parseHTML(fixture.replace('In stock.',label));assert.throws(()=>readProductDialog(document),/UNAVAILABLE/);}
 const {document}=parseHTML(fixture.replace(/(<td>)\d+(<\/td>)/g,'$10$2'));assert.throws(()=>readProductDialog(document),/UNAVAILABLE/);
});
test('XJ07WAL completes each package with fresh checks for all parts and 4.7L required, 5L charged',async()=>{
 const kinds={'Oil Filter':'oil_filter','Air Filter':'air_filter','Cabin Filter':'cabin_filter','Fuel Filter':'fuel_filter','Engine Oils (Applied)':'oil'};
 for(const service of ['Oil & Filter Change','Full Service','Major Service']){
  let checks=0;const costs=await lookupLiveService({}, {registration:'XJ07WAL',service,range:'Mid Range',mileage:null},{capture:async(_,reg,category)=>capture(category),readFresh:async(_,s)=>{checks++;return {kind:s.kind,sku:s.searchTerm,brand:'Offline test fixture',description:s.description,unitNetPence:Math.ceil(s.expectedPricePence*1000/s.packQuantityMilli),quantityMilli:s.quantityMilli,...(s.kind==='oil'?{packNetPence:s.expectedPricePence,packQuantityMilli:s.packQuantityMilli}:{}),inStock:true,vatBasis:'EX_VAT'}}});
  assert.equal(checks,costs.items.length);assert.equal(costs.items.find(i=>i.kind==='oil').quantityMilli,4700);if(service==='Major Service')assert.ok(costs.items.some(i=>i.kind==='fuel_filter'));
  const price=calculateServicePrice(costs,costs.request,JSON.parse(readFileSync('workers/gsf/pricing-policy.example.json','utf8')),Date.now());assert.equal(price.lines.find(i=>i.kind==='oil').chargedQuantityMilli,5000);
 }
});
