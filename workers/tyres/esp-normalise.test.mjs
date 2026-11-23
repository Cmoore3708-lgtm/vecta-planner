import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCatalogueGuides} from './tiers.mjs';
import {parseEspProduct} from './esp-normalise.mjs';
test('normalises confirmed Sellout samples without adding margin',()=>{
 const result=parseEspProduct({product:'205/55R16 COMFORSER CF510 91V',sellout:'£62.00',stockColumns:{Default:'+50',Company:'46'}});
 assert.equal(result.unitPence,6200);assert.equal(result.defaultStockMinimum,50);assert.equal(result.loadRating,91);assert.equal(result.speedRating,'V');assert.equal(result.size,'205/55R16');assert.equal(result.specificationUnverified,true);
});
test('supports configured multi-word brands and glued XL ratings',()=>{
 const result=parseEspProduct({product:'225/45R17 ROAD DMX TEST 94YXL',sellout:'£74.00',stockColumns:{Default:'5'}},{brands:['ROAD DMX']});
 assert.equal(result.brand,'ROAD DMX');assert.equal(result.model,'TEST 94YXL');assert.equal(result.extraLoad,true);assert.equal(result.speedRating,'Y');
});
test('green-arrow Company quantity qualifies the exact Falken model for a pair',()=>{
 const product={product:'215/65R17 FALKEN ZE320 103V XL',sellout:'£136.00'};
 const row=parseEspProduct({...product,stockColumns:{Default:'',Company:'2'}});
 const settings={showSellout:true,vatIncluded:true,priceList:'Vecta',multiplier:1};
 const midrange=quantity=>selectCatalogueGuides([row],{size:row.size,quantity,settings}).options[1];
 assert.equal(midrange(2).brand,'FALKEN');
 assert.equal(midrange(2).totalPence,27200);
 assert.equal(midrange(3).available,false);
 assert.equal(parseEspProduct({...product,stockColumns:{Default:'1',Company:'2'}}).defaultStockMinimum,2);
 assert.equal(parseEspProduct({...product,stockColumns:{Default:'',Company:'↓'}}).defaultStockMinimum,null);
});
