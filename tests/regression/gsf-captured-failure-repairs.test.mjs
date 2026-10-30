import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {parseHTML} from 'linkedom';
import {catalogueSelection,serviceVehicleLabel} from '../../workers/gsf/live-service.mjs';
import {readProductDialog} from '../../workers/gsf/product-dialog.mjs';
import {selectedProductUrl} from '../../workers/gsf/product-dialog.mjs';
import {readServiceCategory} from '../../workers/gsf/service-capture.mjs';
const rows=JSON.parse(readFileSync(new URL('../fixtures/gsf-failure-captures-2026-10-30.json',import.meta.url)));
test('captured same-afternoon RDC inventory is accepted without changing selected Gold grade or price',()=>{
 const row=rows.find(r=>r.registration==='AU62ZZF');const selected=catalogueSelection(row.capture,'cabin_filter',row.registration);
 assert.equal(selected.expectedPricePence,3084);assert.equal(selected.searchTerm,'MANCUK2231');
 const bad=structuredClone(row.capture);bad.visibleText=bad.visibleText.replace('RDC 1','RDC 0').replace('NDC 7','NDC 0');assert.throws(()=>catalogueSelection(bad,'cabin_filter',row.registration));
});
test('CM14KEL Bronze air filter remains review rather than being sold as Gold',()=>{
 const r=rows.find(r=>r.registration==='CM14KEL');assert.throws(()=>catalogueSelection(r.capture,'air_filter',r.registration),e=>e.diagnosticReason==='PRICE_OR_GRADE_NOT_CONFIRMED');
});
test('same-afternoon product still needs exact price, VAT and positive inventory',()=>{
 let html=readFileSync(new URL('../fixtures/gsf-product-dialog.html',import.meta.url),'utf8').replace('In stock.','In stock in RDC. Get it this afternoon.');
 assert.equal(readProductDialog(parseHTML(html).document).unitNetPence,494);
 assert.throws(()=>readProductDialog(parseHTML(html.replace('£5.93','£7.00')).document));
 assert.throws(()=>readProductDialog(parseHTML(html.replaceAll('<td>1</td>','<td>0</td>').replace('<td>406</td>','<td>0</td>')).document),/UNAVAILABLE/);
});
test('long captured Citan identity fits display contract without weakening fitment evidence',()=>{
 const r=rows.find(r=>r.registration==='SB65BXU');assert.ok(r.capture.visibleText.split(' Clear ')[1].split(' Copy VIN')[0].length>160);
 assert.equal(serviceVehicleLabel(r.capture,r.registration).length,160);assert.match(serviceVehicleLabel(r.capture,r.registration),/^Mercedes-Benz Citan/);assert.ok(r.capture.visibleText.includes('1461cc'));
});
test('slash SKU follows only an observed supplier URL that resolves to that exact SKU',()=>{
 const sku='MANW713/9';assert.throws(()=>selectedProductUrl({searchTerm:sku}),/PRODUCT_LINK_UNCONFIRMED/);
 for(const suffix of ['MANW713/9','MANW713%2F9','MANW713%252F9'])assert.ok(selectedProductUrl({searchTerm:sku,detailUrl:'/partdetails/'+suffix}).startsWith('https://trade.gsfcarparts.com/partdetails/'));
 for(const detailUrl of ['https://example.com/partdetails/MANW713%2F9','/partdetails/OTHER','/partdetails/MANW713%2F9?token=private'])assert.throws(()=>selectedProductUrl({searchTerm:sku,detailUrl}),/PRODUCT_LINK_UNCONFIRMED/);
});
test('capture retains exact supplier product link and excludes unrelated or external links',()=>{
 const doc=parseHTML('<main><section>BD53MUD <button>Clear</button></section><h5>Oil Filter</h5><p>SKU: MANW713/9</p><a href="/partdetails/MANW713%252F9">Details</a><a href="https://example.com/partdetails/MANW713%252F9">Other</a></main>').document;
 assert.deepEqual(readServiceCategory({registration:'BD53MUD',category:'Oil Filter'},doc).productLinks,[{sku:'MANW713/9',url:'https://trade.gsfcarparts.com/partdetails/MANW713%252F9'}]);
});
