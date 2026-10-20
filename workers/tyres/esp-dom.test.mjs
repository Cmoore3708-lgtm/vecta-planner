import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readEspGrid,ESP_SEARCH,ESP_GRID} from './esp-dom.mjs';
import {inspectDocument} from './inspect-dom.mjs';
function doc(markup){return parseHTML(markup).document;}
test('extracts Sellout from the verified ESP grid and never substitutes Cost',()=>{
 const document=doc('<table><tr><td><table id="OrderWindowGrid"><tr><th>Product</th><th>Default</th><th>Cost</th><th>Sellout</th><th>Actual</th><th>Cart</th></tr><tr><td>205/55R16 COMFORSER CF510 91V</td><td>+50</td><td>£20.86</td><td>£62.00</td><td>PRIVATE</td><td><input value="SECRET"></td></tr></table></td></tr></table>');
 const result=readEspGrid(document);assert.equal(result.products.length,1);assert.equal(result.products[0].sellout,'£62.00');
 assert.equal(result.products[0].stockColumns.Default,'+50');assert.ok(!JSON.stringify(result).includes('20.86'));assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes('SECRET'));
 assert.equal(ESP_SEARCH,'#FindProductsButton');assert.equal(ESP_GRID,'#OrderWindowGrid');
});
test('fails when Sellout column is missing or ambiguous',()=>{
 for(const headings of ['<th>Product</th><th>Cost</th>','<th>Product</th><th>Sellout</th><th>Sellout</th>'])assert.throws(()=>readEspGrid(doc('<table id="OrderWindowGrid"><tr>'+headings+'</tr></table>')));
});
test('blank Sellout stays blank and rows with merged cells are skipped',()=>{
 const result=readEspGrid(doc('<table id="OrderWindowGrid"><tr><th>Product</th><th>Cost</th><th>Sellout</th></tr><tr><td>205/55R16 EXAMPLE</td><td>£20.86</td><td></td></tr><tr><td colspan="2">205/55R16 WRONG</td><td>£40.00</td><td>£60.00</td></tr></table>'));
 assert.equal(result.products.length,1);assert.equal(result.products[0].sellout,'');
});
test('recognises ESP plain-text labels while omitting input values',()=>{
 const report=inspectDocument(doc('<div>Width <input id="x" value="205"> Profile <input id="y" value="55"> Rim <input id="z" value="16"><input type="submit" id="FindProductsButton" value="Search"></div>'));
 assert.deepEqual(report.fields.slice(0,3).map(f=>f.label.toLowerCase()),['width','profile','rim']);
 assert.equal(report.fields.slice(0,3).every(f=>f.inSearchPanel),true);assert.ok(!JSON.stringify(report).includes('205'));
});
test('bounded panel inventory finds unlabelled controls without leaking outside fields',()=>{
 const report=inspectDocument(doc('<input aria-label="Customer" value="PRIVATE"><section><input id="a"><input id="b"><input id="c"><input type="submit" id="FindProductsButton" value="Search"></section>'));
 assert.deepEqual(report.fields.map(f=>f.id),['a','b','c','FindProductsButton']);
});
test('removes real ESP hidden SKU prefixes and duplicate tooltip descriptions',()=>{
 const document=doc('<table id="OrderWindowGrid"><tr><th>Product</th><th>Sellout</th></tr><tr><td><input type="hidden">2055516VBUCOMFO<div>205/55R16 COMFORSER CF510 91V <span>205/55R16 COMFORSER CF510 91V</span></div></td><td>£62.00</td></tr></table>');
 assert.equal(readEspGrid(document).products[0].product,'205/55R16 COMFORSER CF510 91V');
});
test('different sizes within one product cell are rejected',()=>{
 assert.throws(()=>readEspGrid(doc('<table id="OrderWindowGrid"><tr><th>Product</th><th>Sellout</th></tr><tr><td>205/55R16 EXAMPLE 225/45R17 EXAMPLE</td><td>£62.00</td></tr></table>')),/SIZE_AMBIGUOUS/);
});
