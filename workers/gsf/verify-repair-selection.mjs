import {readProductBySku} from './supplier.mjs';
import {readProductDialog} from './product-dialog.mjs';
const review=()=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED'});};
// The catalogue group SKU is not a manufacturer SKU. Use an explicitly reviewed
// mapping and verify all product identity/price/stock fields again after lookup.
export async function verifyRepairSelection(page,analysis,reviewedPart,{lookup=readProductBySku,now=Date.now}={}){
 const choice=analysis?.cheapestDisplayedAvailable;
 if(!choice||!reviewedPart||analysis.displayedGroupSku!==reviewedPart.searchTerm||choice.brand!==reviewedPart.brand||choice.description!==reviewedPart.description)review();
 await lookup(page,{...reviewedPart,kind:'repair_part',quantityMilli:1000,packQuantityMilli:1000});
 const part=await page.evaluate(readProductDialog);
 if(part.sku!==reviewedPart.sku||part.brand!==choice.brand||part.description!==choice.description||part.unitNetPence!==choice.costPence||part.vatBasis!=='EX_VAT'||part.inStock!==true||!part.stock?.some(row=>Number.isSafeInteger(row.quantity)&&row.quantity>0)||!part.imageUrl)review();
 return {source:'GSF',...part,checkedAt:new Date(now()).toISOString(),priceMatchesCatalogue:true,fitmentConfirmed:false,catalogueComplete:false};
}
