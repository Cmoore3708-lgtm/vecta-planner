import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRepairSelection} from '../../workers/gsf/verify-repair-selection.mjs';
const mapping={searchTerm:'DREA8828',sku:'A8828',brand:'DriveTec',description:'Alternator - 150 Amp'};
const analysis={displayedGroupSku:'DREA8828',cheapestDisplayedAvailable:{brand:'DriveTec',description:'Alternator - 150 Amp',costPence:19474}};
const captured={sku:'A8828',brand:'DriveTec',description:'Alternator - 150 Amp',unitNetPence:19474,costIncVatPence:23369,vatBasis:'EX_VAT',inStock:true,stock:[{location:'Boldon',quantity:1}],imageUrl:'https://gsfappstorage.blob.core.windows.net/catalogue-assets//ProductImages/WAI/21126N_B1.jpg'};
test('selected catalogue option is checked against a fresh exact-SKU product read',async()=>{
 let lookups=0;
 const result=await verifyRepairSelection({evaluate:async()=>captured,url:()=> 'https://trade.gsfcarparts.com/enhancedSearch/DREA8828'},analysis,mapping,{lookup:async(page,item)=>{lookups++;assert.equal(item.searchTerm,'DREA8828');assert.equal(item.sku,'A8828');},now:()=>1000});
 assert.equal(result.gsfUrl,'https://trade.gsfcarparts.com/enhancedSearch/DREA8828');
 assert.equal(lookups,1);assert.equal(result.unitNetPence,19474);assert.equal(result.priceMatchesCatalogue,true);assert.equal(result.catalogueComplete,false);assert.equal(result.fitmentConfirmed,false);assert.equal(result.checkedAt,'1970-01-01T00:00:01.000Z');
});
test('changed price, identity, VAT, stock or missing image prevents verification',async()=>{
 for(const change of [{unitNetPence:20000},{sku:'OTHER'},{brand:'Lucas'},{vatBasis:'INC_VAT'},{inStock:false},{stock:[]},{imageUrl:''}])await assert.rejects(verifyRepairSelection({evaluate:async()=>({...captured,...change})},analysis,mapping,{lookup:async()=>{}}),/REVIEW_REQUIRED/);
 let looked=false;await assert.rejects(verifyRepairSelection({},analysis,{...mapping,brand:'Lucas'},{lookup:async()=>{looked=true;}}),/REVIEW_REQUIRED/);assert.equal(looked,false);
});

import {repairLookupPreview} from '../../workers/repair-quotes/quote-preview.mjs';
test('same-run part and labour preview applies agreed markup, half-hour rounding and VAT',()=>{
 const stamp='2026-10-26T10:27:51.000Z',now=Date.parse(stamp),part={...captured,registration:'FV65JTY',checkedAt:stamp,priceMatchesCatalogue:true},labour={registration:'FV65JTY',hoursMilli:700,checkedAt:stamp};
 const result=repairLookupPreview(part,labour,{now});assert.equal(result.partsSalePence,24421);assert.equal(result.chargedHoursMilli,1000);assert.equal(result.labourPence,5000);assert.equal(result.totalIncVatPence,35305);assert.equal(result.readyForAutomaticQuote,false);assert.equal(result.previewOnly,true);
 assert.equal(repairLookupPreview(part,{...labour,hoursMilli:1100},{now}).labourPence,7500);
 assert.throws(()=>repairLookupPreview(part,{...labour,registration:'WRONG'},{now}),/REVIEW_REQUIRED/);
 assert.throws(()=>repairLookupPreview(part,labour,{now:now+16*60000}),/REVIEW_REQUIRED/);
});

import {readProductBySku} from '../../workers/gsf/supplier.mjs';
test('exact-SKU lookup reads the active dialog rather than matching background product headings',async()=>{
 let current='https://trade.gsfcarparts.com',clicked=false,dialogHeading=0;
 const heading={waitFor:async()=>{}},dialog={count:async()=>clicked?1:0,isVisible:async()=>true,getByRole:()=>{dialogHeading++;return heading;}};
 const main={getByText:()=>({count:async()=>1,isVisible:async()=>true,click:async()=>{clicked=true;}}),getByRole:()=>{throw Error('Must not read background heading');}};
 const page={goto:async url=>{current=url;},url:()=>current,getByRole:role=>role==='textbox'?{fill:async()=>{},press:async()=>{}}:role==='heading'?heading:role==='dialog'?dialog:main,evaluate:async()=>captured,waitForTimeout:async()=>{}};
 const result=await readProductBySku(page,{...mapping,kind:'repair_part',quantityMilli:1000,packQuantityMilli:1000});assert.equal(result.unitNetPence,19474);assert.equal(dialogHeading,1);
});
