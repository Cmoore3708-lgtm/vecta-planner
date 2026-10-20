import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEspProduct} from './esp-normalise.mjs';
test('normalises confirmed Sellout samples without adding margin',()=>{
 const result=parseEspProduct({product:'205/55R16 COMFORSER CF510 91V',sellout:'£62.00',stockColumns:{Default:'+50',Company:'46'}});
 assert.equal(result.unitPence,6200);assert.equal(result.defaultStockMinimum,50);assert.equal(result.loadRating,91);assert.equal(result.speedRating,'V');assert.equal(result.size,'205/55R16');assert.equal(result.specificationUnverified,true);
});
test('supports configured multi-word brands and glued XL ratings',()=>{
 const result=parseEspProduct({product:'225/45R17 ROAD DMX TEST 94YXL',sellout:'£74.00',stockColumns:{Default:'5'}},{brands:['ROAD DMX']});
 assert.equal(result.brand,'ROAD DMX');assert.equal(result.model,'TEST 94YXL');assert.equal(result.extraLoad,true);assert.equal(result.speedRating,'Y');
});
test('missing stock is unknown and Company stock is never added',()=>{
 const result=parseEspProduct({product:'205/55R16 EXAMPLE MODEL',sellout:'£62.00',stockColumns:{Default:'',Company:'40'}});assert.equal(result.defaultStockMinimum,null);
});
