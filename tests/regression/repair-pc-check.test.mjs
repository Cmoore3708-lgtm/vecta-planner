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
test('unpriced menu label does not conflict with the one repair-time row',()=>{const {document}=parseHTML('<html><body><p>Total time (H)</p><nav><span>Renew the alternator</span></nav><table><tr><td>1E02944501WV0</td><td>Renew the alternator</td><td>0.70</td></tr></table></body></html>');assert.equal(readAlternatorTime(document).hoursMilli,700);});
test('identical repeated rows deduplicate but different operation codes still require review',()=>{const row='<tr><td>1E02944501WV0</td><td>Renew the alternator</td><td>0.70</td></tr>';const {document}=parseHTML('<html><body><p>Total time (H)</p><table>'+row+row+'</table></body></html>');assert.equal(readAlternatorTime(document).hoursMilli,700);document.querySelectorAll('tr')[1].querySelector('td').textContent='OTHEROPERATION';assert.throws(()=>readAlternatorTime(document),/MULTIPLE_PRICED_OPERATIONS/);});
test('div rows with different wrappers/OE details deduplicate by operation code and time',()=>{const {document}=parseHTML('<html><body><p>Total time (H)</p><div><span>1E02944501WV0</span><span>Renew the alternator</span><span>0.70</span></div><div><span>1E02944501WV0</span><span>Renew the alternator</span><span>OE: 1181M9</span><span>0.70</span></div></body></html>');const result=readAlternatorTime(document);assert.equal(result.hoursMilli,700);assert.equal(result.operationId,'1E02944501WV0');document.querySelectorAll('div')[1].lastElementChild.textContent='1.10';assert.throws(()=>readAlternatorTime(document),/MULTIPLE_PRICED_OPERATIONS/);});
test('operation outside the visible screen does not create a second priced match',()=>{
 const row=(id,time)=>'<div><span>'+id+'</span><span>Renew the alternator</span><span>'+time+'</span></div>';
 const {document}=parseHTML('<html><body><p>Total time (H)</p>'+row('1E02944501WV0','0.70')+row('1D01901429WV0','0.30')+'</body></html>');
 document.defaultView.innerHeight=1000;document.defaultView.innerWidth=1000;document.querySelectorAll('*').forEach(el=>{el.getBoundingClientRect=()=>({left:10,right:100,top:50,bottom:70,width:90,height:20});});const hidden=document.querySelectorAll('body > div')[1];hidden.querySelectorAll('*').forEach(el=>{el.getBoundingClientRect=()=>({left:10,right:100,top:-50,bottom:-30,width:90,height:20});});
 assert.equal(readAlternatorTime(document).hoursMilli,700);
});
