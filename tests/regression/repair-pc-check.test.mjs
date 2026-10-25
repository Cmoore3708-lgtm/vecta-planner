import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readProductDialog} from '../../workers/repair-quotes/product-dialog.mjs';
import {readAlternatorTime} from '../../workers/repair-quotes/repair-time-reader.mjs';
test('observed GSF dialog reads account cost and photo, excluding RRP/surcharge',()=>{
 const {document}=parseHTML('<html><body><div role="dialog"><h2>Part Details</h2><h5>Alternator - 150 Amp</h5><p>SKU: A8828</p><p>RRP: £624.31</p><p>£194.74 ex vat</p><p>£10.00 surcharge</p><p>In stock.</p><div><p>Brand</p><p>DriveTec</p></div><div><p>SKU</p><p>A8828</p></div><div><p>Cost inc. VAT</p><p>£233.69</p></div><table><tbody><tr><td>Boldon</td><td>1</td></tr></tbody></table><img src="https://gsfappstorage.blob.core.windows.net/catalogue-assets/ProductImages/WAI/21126N_B1.jpg"></div></body></html>');
 const part=readProductDialog(document);assert.equal(part.unitNetPence,19474);assert.equal(part.sku,'A8828');assert.equal(part.brand,'DriveTec');assert.match(part.imageUrl,/21126N_B1/);
});
test('screenshot-informed Haynes row capture uses hours rather than interpreting 0.70 as minutes',()=>{
 const {document}=parseHTML('<html><body><div>TOTAL TIME (H)</div><input id="numberPlate" value="FV65 JTY"><table><tr><td>1E02944501WV0</td><td><span>Renew the alternator</span></td><td>0.70</td></tr></table></body></html>');const result=readAlternatorTime(document);assert.equal(result.hoursMilli,700);assert.equal(result.registrationVisible,'FV65JTY');assert.equal(result.fitmentConfirmed,false);
 document.querySelector('tr').insertAdjacentHTML('beforeend','<td>1.10</td>');assert.throws(()=>readAlternatorTime(document),/LABOUR_REVIEW_REQUIRED/);
});

test('nested operation label and code sharing one cell are accepted; hidden duplicates ignored',()=>{
 const {document}=parseHTML('<html><body><p>Total time (H)</p><table><tr><td>1E02944501WV0 <span>Renew <b>the alternator</b></span></td><td>0.70</td></tr></table><div hidden><span>Renew the alternator</span><span>1.00</span></div></body></html>');assert.equal(readAlternatorTime(document).hoursMilli,700);
});
test('capture reports a specific reason without assuming a time',()=>{const {document}=parseHTML('<html><body>Sign in</body></html>');assert.throws(()=>readAlternatorTime(document),/OPERATION_NOT_VISIBLE/);});
