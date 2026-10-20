import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectCatalogueGuides,canonicalBrand,isSpecialTyre} from './tiers.mjs';
const fixtures=JSON.parse(readFileSync(new URL('./confirmed-catalogue-fixture.json',import.meta.url)));
test('actual ESP catalogue produces three unchanged Sellout prices per size',()=>{
 for(const f of fixtures){const r=selectCatalogueGuides(f.guideCatalogue,{size:f.requestedSize,settings:f.settings,now:0});assert.deepEqual(r.options.map(o=>o.unitPence),f.requestedSize==='205/55R16'?[6200,7400,9500]:[6500,8200,10500]);}
});
test('quantities use sufficient Default stock and preserve exact penny totals',()=>{
 for(const f of fixtures)for(const quantity of [1,2,3,4]){
  const r=selectCatalogueGuides(f.guideCatalogue,{size:f.requestedSize,quantity,settings:f.settings});
  for(const o of r.options){assert.equal(o.available,true);assert.equal(o.totalPence,o.unitPence*quantity);}
 }
 const f=fixtures.find(f=>f.requestedSize==='205/55R16');const r=selectCatalogueGuides(f.guideCatalogue,{size:f.requestedSize,quantity:4,settings:f.settings});assert.equal(r.options[2].unitPence,10100);
});
test('unknown or mismatched supplier abbreviations do not acquire a tier',()=>{assert.equal(canonicalBrand({brand:'PI',model:'UNKNOWN'}),null);assert.equal(canonicalBrand({brand:'PI',model:'PWRGY2 94YXL'}),'PIRELLI');});
test('explicit winter, all-season and run-flat variants are excluded',()=>{
 for(const model of ['WIN5 94V','SNP3 94H','EUWIN HS02PRO 94VXL','HA32 91H AS','DMX 4SEAS 94W','XCLIMATE3 94YXL','DMX R8+ RFT 94YXL'])assert.equal(isSpecialTyre({model}),true,model);
});
test('unverified settings, bad quantities and conflicting tier rules fail',()=>{
 const f=fixtures[0],args={size:f.requestedSize,settings:f.settings};
 assert.throws(()=>selectCatalogueGuides(f.guideCatalogue,{...args,settings:{...f.settings,vatIncluded:false}}));
 assert.throws(()=>selectCatalogueGuides(f.guideCatalogue,{...args,quantity:5}));
 assert.throws(()=>selectCatalogueGuides(f.guideCatalogue,{...args,groups:{budget:['A'],premium:['A']}}));
});
test('unavailable tiers remain unavailable; wrong size, missing stock and invalid prices cannot be selected',()=>{
 const f=fixtures[0],base={size:f.requestedSize,brand:'COMFORSER',model:'TEST',unitPence:5000,defaultStockMinimum:5};
 for(const patch of [{size:'195/55R16'},{defaultStockMinimum:null},{defaultStockMinimum:0},{unitPence:NaN},{unitPence:0},{brand:'UNKNOWN'}]){
  const r=selectCatalogueGuides([{...base,...patch}],{size:f.requestedSize,settings:f.settings});assert.equal(r.options.every(o=>!o.available),true);
 }
});
