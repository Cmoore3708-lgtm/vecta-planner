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
 for(const change of [{brand:'Other'},{description:'ECO-FE Plus 5W-30 - 5L'},{sku:'OTHER5L'},{description:'ECO-FE Plus 0W-30 - 1L'},{vatBasis:'INC_VAT'},{inStock:false},{unitNetPence:8000},{stock:[{location:'Boldon',quantity:1}]}])await assert.rejects(chooseServiceOilPack(page({...pack,...change}),original),/REVIEW_REQUIRED/);
});
test('existing large packs and one-litre fills do not trigger extra supplier reads',async()=>{
 for(const item of [{...original,packQuantityMilli:5000},{...original,quantityMilli:1000}])assert.equal(await chooseServiceOilPack({goto:()=>assert.fail('Unexpected request')},item),item);
});
test('unavailable bulk pack blocks a misleading live quote rather than pricing nine single bottles',async()=>{
 await assert.rejects(chooseServiceOilPack({goto:async()=>{throw Error('Unavailable')}},original),/REVIEW_REQUIRED/);
});
