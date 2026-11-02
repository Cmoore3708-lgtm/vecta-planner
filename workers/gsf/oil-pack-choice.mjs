import {readProductDialog} from './product-dialog.mjs';

const family=value=>String(value||'').replace(/\s*[-–]?\s*\d+(?:\.\d+)?\s*L\s*$/i,'').replace(/\s+/g,' ').trim().toUpperCase();
// A candidate 5L route is not price evidence. Wait for the hydrated product and
// require its exact SKU, brand, oil family and current ex-VAT price.
export async function chooseServiceOilPack(page,original,{read=readProductDialog,searchTerm=original.sku}={}){
 if(original.kind!=='oil'||original.packQuantityMilli!==1000||original.quantityMilli<=1000)return original;
 const fail=reason=>{throw Object.assign(Error('REVIEW_REQUIRED'),{diagnosticReason:reason});};
 if(!/1L$/i.test(original.sku||''))fail('OIL_PACK_SKU_UNCONFIRMED');
 const requested=original.sku.replace(/1L$/i,'5L');
 try{await page.goto('https://trade.gsfcarparts.com/partdetails/'+encodeURIComponent(String(searchTerm).replace(/1L$/i,'5L')),{waitUntil:'domcontentloaded',timeout:8000});}
 catch{fail('OIL_PACK_NAVIGATION_FAILED');}
 const deadline=Date.now()+12000;let reason='OIL_PACK_DETAILS_NOT_READY';
 while(Date.now()<deadline){
  if(new URL(page.url()).origin!=='https://trade.gsfcarparts.com'||/\/signin/.test(page.url()))throw Error('LOGIN_REQUIRED');
  try{
   const product=await page.evaluate(read,{allowUnavailableOilPrice:true});
   const matches=/\b5\s*L\s*$/i.test(String(product.description||''))&&String(product.sku||'').toUpperCase()===requested.toUpperCase()&&String(product.brand||'').toUpperCase()===String(original.brand||'').toUpperCase()&&family(product.description)===family(original.description)&&product.vatBasis==='EX_VAT'&&Number.isSafeInteger(product.unitNetPence)&&product.unitNetPence>0&&product.unitNetPence<=original.packNetPence*5;
   if(matches){
    const packsNeeded=Math.ceil(Math.ceil(original.quantityMilli/1000)/5),stock=(product.stock||[]).reduce((sum,row)=>sum+Number(row.quantity||0),0),inStock=product.inStock===true&&stock>=packsNeeded;
    return {...original,inStock,...(!inStock?{pricingOnly:true}:{}),sku:product.sku,description:product.description,packNetPence:product.unitNetPence,packQuantityMilli:5000,unitNetPence:Math.ceil(product.unitNetPence/5)};
   }
   fail('OIL_PACK_IDENTITY_OR_PRICE_UNCONFIRMED');
  }catch(error){if(error.message==='LOGIN_REQUIRED'||error.diagnosticReason)throw error;reason='OIL_PACK_DETAILS_NOT_READY';}
  if(typeof page.waitForTimeout!=='function')fail(reason);
  await page.waitForTimeout(200);
 }
 fail(reason);
}
