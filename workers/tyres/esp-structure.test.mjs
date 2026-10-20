import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {inspectEspStructure} from './esp-structure.mjs';
test('structural diagnostics include product/cell positions but never price or account values',()=>{
 const {document}=parseHTML('<p>SECRET_ACCOUNT</p><input type="password" value="SECRET_PASSWORD"><table id="OrderWindowGrid"><tr><th>Product</th><th>Cost</th><th>Sellout</th></tr><tr><td class="description"><span>205/55R16 COMFORSER CF510 91V</span></td><td>£20.86</td><td>£62.00</td></tr></table>');
 const report=inspectEspStructure(document),json=JSON.stringify(report);
 assert.equal(report.dataRows[0].cells[0].product,'205/55R16 COMFORSER CF510 91V');assert.equal(report.dataRows[0].cellCount,3);
 for(const secret of ['SECRET_ACCOUNT','SECRET_PASSWORD','20.86','62.00'])assert.ok(!json.includes(secret));
});
