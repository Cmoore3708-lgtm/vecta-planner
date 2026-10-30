// Same strict product checks as the live reader, with diagnostic-only evidence.
import {openSelectedProduct} from './product-dialog.mjs';
import {readProductDialog} from './product-dialog.mjs';
export async function diagnosticProduct(page,selected){
 await openSelectedProduct(page,selected);
 let product,lastError;const deadline=Date.now()+15000;
 while(Date.now()<deadline){
  if(/\/signin(?:[/?]|$)/.test(page.url()))throw Error('LOGIN_REQUIRED');
  try{product=await page.evaluate(readProductDialog);break;}catch(error){lastError=error;await page.waitForTimeout(200);}
 }
 const evidence={expectedDescription:selected.description,observedDescription:product?.description,sku:product?.sku,expectedPricePence:selected.expectedPricePence,observedPricePence:product?.unitNetPence};
 const fail=reason=>{throw Object.assign(Error('REVIEW_REQUIRED'),{diagnosticReason:reason,evidence});};
 if(!product)fail(lastError?.message==='UNAVAILABLE'?'PRODUCT_STOCK_UNAVAILABLE':'PRODUCT_DETAILS_UNREADABLE');
 if(product.description.replace(/\s+/g,' ').trim().toLowerCase()!==selected.description.replace(/\s+/g,' ').trim().toLowerCase())fail('PRODUCT_DESCRIPTION_MISMATCH');
 if(!selected.searchTerm.toUpperCase().endsWith(product.sku.toUpperCase()))fail('PRODUCT_SKU_MISMATCH');
 if(product.unitNetPence!==selected.expectedPricePence)fail('PRODUCT_PRICE_MISMATCH');
 return {kind:selected.kind,sku:product.sku,brand:product.brand,description:product.description,quantityMilli:selected.quantityMilli,
  unitNetPence:Math.ceil(product.unitNetPence*1000/selected.packQuantityMilli),...(selected.kind==='oil'?{packNetPence:product.unitNetPence,packQuantityMilli:selected.packQuantityMilli}:{}),vatBasis:'EX_VAT',inStock:true};
}
