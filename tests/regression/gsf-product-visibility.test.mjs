import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';import {readFileSync} from 'node:fs';import {readProductDialog} from '../../workers/gsf/product-dialog.mjs';
const source=readFileSync(new URL('../fixtures/gsf-product-dialog.html',import.meta.url),'utf8');
test('hidden responsive product copies cannot make a visible product ambiguous',()=>{
 for(const attribute of ['hidden','aria-hidden="true"']){
 const doc=parseHTML(source+`<section ${attribute}>${source}</section>`).document;
 const row=readProductDialog(doc);assert.equal(row.sku,'23.265.00');assert.equal(row.unitNetPence,494);
 }
});
test('hidden product fields and stock labels are excluded through their ancestors',()=>{
 const doc=parseHTML(source).document;const d=doc.querySelector('[role="dialog"]');d.insertAdjacentHTML('beforeend','<section hidden><h5>Other filter</h5><p>SKU: WRONG</p><p>£0.01 ex vat</p><div>Out of stock.</div></section>');
 assert.equal(readProductDialog(doc).sku,'23.265.00');
});
test('two visible product dialogs are still rejected',()=>{
 assert.throws(()=>readProductDialog(parseHTML(source+source).document),/SETTINGS_REQUIRED/);
});
