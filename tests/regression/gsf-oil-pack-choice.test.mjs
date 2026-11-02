import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseServiceOilPack} from '../../workers/gsf/oil-pack-choice.mjs';
const original={kind:'oil',sku:'ECOFEP1L',brand:'Comma',description:'ECO-FE Plus 0W-30 - 1L',quantityMilli:8800,packQuantityMilli:1000,packNetPence:1424,unitNetPence:1424,vatBasis:'EX_VAT',inStock:true};
const pack={sku:'ECOFEP5L',brand:'Comma',description:'ECO-FE Plus 0W-30 - 5L',unitNetPence:4995,vatBasis:'EX_VAT',inStock:true,stock:[{location:'Boldon',quantity:2}]};
function page(product){return {url:()=> 'https://trade.gsfcarparts.com/partdetails/ECOFEP5L',goto:async()=>{},evaluate:async()=>product};}
test('Defender selects matching 5L oil and retains verified 8.8L fill',async()=>{
 const result=await chooseServiceOilPack(page(pack),original);
 assert.equal(result.quantityMilli,8800);assert.equal(result.packNetPence,4995);assert.equal(result.packQuantityMilli,5000);assert.equal(result.unitNetPence,999);assert.equal(original.packQuantityMilli,1000);
 assert.equal(Math.round(result.packNetPence*9/5),8991);
});
test('wrong family, viscosity, brand, pack, price and insufficient stock cannot replace applied oil',async()=>{
 for(const change of [{brand:'Other'},{description:'ECO-FE Plus 5W-30 - 5L'},{sku:'OTHER5L'},{description:'ECO-FE Plus 0W-30 - 1L'},{vatBasis:'INC_VAT'},{unitNetPence:8000}])await assert.rejects(chooseServiceOilPack(page({...pack,...change}),original),/REVIEW_REQUIRED/);
});
test('existing large packs and one-litre fills do not trigger extra supplier reads',async()=>{
 for(const item of [{...original,packQuantityMilli:5000},{...original,quantityMilli:1000}])assert.equal(await chooseServiceOilPack({goto:()=>assert.fail('Unexpected request')},item),item);
});
test('unavailable bulk pack blocks a misleading live quote rather than pricing nine single bottles',async()=>{
 await assert.rejects(chooseServiceOilPack({goto:async()=>{throw Error('Unavailable')}},original),/REVIEW_REQUIRED/);
});

test('verified bulk price is usable even with no stock, without claiming availability',async()=>{const result=await chooseServiceOilPack(page({...pack,inStock:false,stock:[]}),original);assert.equal(result.packNetPence,4995);assert.equal(result.inStock,false);assert.equal(result.pricingOnly,true);});

test('pricing accepts verified unavailable oil but still rejects unavailable filters',async()=>{
 const {calculateServicePrice}=await import('../../lib/service-pricing.js');
 const request={registration:'G4WPC',service:'Oil & Filter Change',range:'Mid Range',mileage:null};
 const oil=await chooseServiceOilPack(page({...pack,inStock:false,stock:[]}),original);
 const filter={kind:'oil_filter',sku:'filter',brand:'Test',description:'Oil filter',quantityMilli:1000,unitNetPence:1000,vatBasis:'EX_VAT',inStock:true};
 const raw={request,recipeId:'test',vehicle:'Defender',fuelType:'diesel',oilSpecification:'GSF applied oil',fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date().toISOString(),requiredKinds:['oil','oil_filter'],items:[oil,filter]};
 const policy={version:'test',markupBps:5000,oilMarkupBps:3000,vatBps:2000,roundUpPence:500,labourNetPence:{'Oil & Filter Change':3000,'Full Service':6000,'Major Service':8000}};
 const result=calculateServicePrice(raw,request,policy);assert.equal(result.lines[0].inStock,false);assert.equal(result.lines[0].pricingOnly,true);
 assert.equal(result.lines[0].costNetPence,8991);
 assert.throws(()=>calculateServicePrice({...raw,items:[oil,{...filter,inStock:false,pricingOnly:true}]},request,policy),/SETTINGS_REQUIRED/);
});
