import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readEspGrid} from './esp-dom.mjs';
import {parseEspProduct} from './esp-normalise.mjs';
import {cleanTyreCatalogue} from '../../lib/tyre-relay-contract.js';
import {selectCatalogueGuides} from './tiers.mjs';
test('warehouse tyres survive DOM, normalisation, relay and quantity-aware brand selection',()=>{
 const settings={showSellout:true,vatIncluded:true,priceList:'Vecta',multiplier:1};
 const rows=[['ACCELERA IOTA 84WXL','','2',64],['MASSIMO OTTP 84WXL','','7',65],['COMFORSER CF700 84W XL','16','',70]];
 const {document}=parseHTML('<table id="OrderWindowGrid"><tr><th>Product</th><th>Default</th><th>Company</th><th></th><th>Sellout</th></tr>'+rows.map(([model,local,warehouse,price])=>`<tr><td>175/65R17 ${model}</td><td>${local}</td><td></td><td>${warehouse}${warehouse?'<img src="green-down.gif">':''}</td><td>£${price}.00</td></tr>`).join('')+'</table>');
 const catalogue=readEspGrid(document).products.map(row=>parseEspProduct(row));
 const clean=cleanTyreCatalogue({size:'175/65R17',checkedAt:new Date().toISOString(),catalogue,settings},'175/65R17');
 const guides=quantity=>selectCatalogueGuides(clean.catalogue,{size:'175/65R17',quantity,settings}).options[0];
 assert.deepEqual(guides(2).choices.map(c=>[c.brand,c.unitPence]),[['ACCELERA',6400],['MASSIMO',6500],['COMFORSER',7000]]);
 assert.deepEqual(guides(4).choices.map(c=>c.brand),['MASSIMO','COMFORSER']);
 assert.equal(guides(4).stockLevels.find(c=>c.brand==='ACCELERA').availableQuantity,2);
});
