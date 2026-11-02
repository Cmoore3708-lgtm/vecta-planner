import {readProductDialog} from './product-dialog.mjs';

const family=value=>String(value||'').replace(/\s*[-–]?\s*\d+(?:\.\d+)?\s*L\s*$/i,'').replace(/\s+/g,' ').trim().toUpperCase();
// Preserve the vehicle-applied oil family. A guessed pack URL is only a search
// candidate: fresh matching SKU, brand, name, price and stock must confirm it.
export async function chooseServiceOilPack(page,original,{read=readProductDialog,searchTerm=original.sku}={}){
 if(original.kind!=='oil'||original.packQuantityMilli!==1000||original.quantityMilli<=1000)return original;
 if(!/1L$/i.test(original.sku||''))throw Error('REVIEW_REQUIRED');
 const requested=original.sku.replace(/1L$/i,'5L');
 let product;
 try{
  await page.goto('https://trade.gsfcarparts.com/partdetails/'+encodeURIComponent(String(searchTerm).replace(/1L$/i,'5L')),{waitUntil:'domcontentloaded',timeout:8000});
  if(new URL(page.url()).origin!=='https://trade.gsfcarparts.com'||/\/signin/.test(page.url()))throw Error('LOGIN_REQUIRED');
  product=await page.evaluate(read);
 }catch(error){if(error.message==='LOGIN_REQUIRED')throw error;throw Error('REVIEW_REQUIRED');}
 const pack=String(product.description||'').match(/\b5\s*L\s*$/i);
 const packsNeeded=Math.ceil(Math.ceil(original.quantityMilli/1000)/5);
 const stock=(product.stock||[]).reduce((sum,row)=>sum+Number(row.quantity||0),0);
 if(!pack||String(product.sku||'').toUpperCase()!==requested.toUpperCase()||String(product.brand||'').toUpperCase()!==String(original.brand||'').toUpperCase()||family(product.description)!==family(original.description)||product.vatBasis!=='EX_VAT'||product.inStock!==true||stock<packsNeeded||!Number.isSafeInteger(product.unitNetPence)||product.unitNetPence<=0||product.unitNetPence>original.packNetPence*5)throw Error('REVIEW_REQUIRED');
 // Existing pricing remains per litre consumed, rounded up to a whole litre;
 // leftover oil is reusable workshop stock, not a charge for a second full can.
 return {...original,sku:product.sku,description:product.description,packNetPence:product.unitNetPence,packQuantityMilli:5000,unitNetPence:Math.ceil(product.unitNetPence/5)};
}
