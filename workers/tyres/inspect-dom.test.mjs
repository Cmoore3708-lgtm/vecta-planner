import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {inspectDocument} from './inspect-dom.mjs';
test('setup report exposes allowlisted controls and headings without secrets or prices',()=>{
 const {document}=parseHTML(`<html><body><div>Account: SECRET_ACCOUNT</div><input type="password" value="SECRET_PASSWORD"><input type="hidden" value="SECRET_TOKEN"><label for="w">Width</label><input id="w" name="Width" value="205"><button id="search">Search</button><button id="order">Order</button><table id="products"><tr><th>Product</th><th>Cost</th><th>Sellout</th></tr><tr><td>EXAMPLE</td><td>£20.86</td><td>£62.00</td></tr></table></body></html>`);
 const report=inspectDocument(document);const json=JSON.stringify(report);
 for(const secret of ['SECRET_ACCOUNT','SECRET_PASSWORD','SECRET_TOKEN','£20.86','£62.00','205'])assert.ok(!json.includes(secret));
 assert.deepEqual(report.fields.map(f=>f.label),['Width','Search']);assert.equal(report.tables[0].rowCount,2);assert.equal(report.fields.some(f=>f.id==='order'),false);
});
test('no unrelated table or control is exported',()=>{
 const {document}=parseHTML('<table><tr><th>Account</th></tr></table><input aria-label="Customer name" value="PRIVATE">');
 assert.deepEqual(inspectDocument(document),{version:1,fields:[],tables:[]});
});
