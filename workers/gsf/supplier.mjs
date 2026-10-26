import {servicePriceRequest, cleanServiceCosts} from '../../lib/service-pricing.js';
import {readProductDialog} from './product-dialog.mjs';
export const SUPPLIER = 'https://trade.gsfcarparts.com';
export function supplierUrl(value) {
  const url=new URL(value);
  if(url.origin!==SUPPLIER || url.username || url.password || url.hash || !/^\/(?:products?|partfinder)\//.test(url.pathname))throw Error('SETTINGS_REQUIRED');
  return url.href;
}
export function moneyPence(value) {
  const match=String(value||'').trim().match(/^£\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/);
  if(!match)throw Error('SETTINGS_REQUIRED');
  return Number(match[1].replaceAll(',',''))*100+Number(match[2]);
}
export function approvedRecipe(config, raw, now=Date.now()) {
  const request=servicePriceRequest(raw);
  if(config?.calibrationApproved!==true || !Array.isArray(config.recipes))throw Error('SETTINGS_REQUIRED');
  const matches=config.recipes.filter(recipe=>recipe.registration===request.registration && recipe.service===request.service && recipe.range===request.range);
  if(matches.length!==1)throw Error('REVIEW_REQUIRED');
  const recipe=matches[0], reviewed=Date.parse(recipe.reviewedAt);
  if(config.lookupMode==='approved-skus' && !recipe.fitmentSource)throw Error('REVIEW_REQUIRED');
  if(recipe.approved!==true || !Number.isFinite(reviewed) || reviewed>now || now-reviewed>30*86400000 ||
    !recipe.id || !recipe.vehicle || !recipe.oilSpecification || !recipe.oilSource || !recipe.scopeSource ||
    !Array.isArray(recipe.items) || recipe.items.length<2 || recipe.items.length>16 ||
    !Array.isArray(recipe.requiredKinds))throw Error('REVIEW_REQUIRED');
  // Service scope is approved for this mileage window, rather than guessed.
  if(request.mileage===null ? recipe.allowUnknownMileage!==true :
    !Number.isSafeInteger(recipe.minimumMileage) || !Number.isSafeInteger(recipe.maximumMileage) ||
    request.mileage<recipe.minimumMileage || request.mileage>recipe.maximumMileage)throw Error('REVIEW_REQUIRED');
  for(const item of recipe.items) {
    if(config.lookupMode==='approved-skus') {
      if(!/^[A-Za-z0-9 ._/-]{1,80}$/.test(item.searchTerm||item.sku||''))throw Error('SETTINGS_REQUIRED');
    } else {
      supplierUrl(item.url);
      for(const key of ['rootCss','skuCss','priceCss','stockCss','vatBasisCss'])if(typeof item[key]!=='string'||!item[key].trim())throw Error('SETTINGS_REQUIRED');
    }
    if(item.vatBasis!=='EX_VAT' || !item.vatEvidence || !item.sku || !item.brand || !item.description ||
      !Number.isSafeInteger(item.quantityMilli) || item.quantityMilli<1 || !Number.isSafeInteger(item.packQuantityMilli) ||
      item.packQuantityMilli<1 || (item.kind!=='oil' && item.packQuantityMilli!==1000))throw Error('SETTINGS_REQUIRED');
  }
  return recipe;
}
export async function readProductBySku(page,item) {
  await page.goto(SUPPLIER,{waitUntil:'domcontentloaded',timeout:15000});
  if(/\/signin(?:[/?]|$)/.test(page.url()))throw Error('LOGIN_REQUIRED');
  if(new URL(page.url()).origin!==SUPPLIER)throw Error('UNAVAILABLE');
  const term=item.searchTerm||item.sku;
  if(!/^[A-Za-z0-9 ._/-]{1,80}$/.test(term))throw Error('SETTINGS_REQUIRED');
  const search=page.getByRole('textbox',{name:"Search for OE (cross ref), aftermarket or categories like 'Air filter'",exact:true});
  await search.fill(term);await search.press('Enter');
  await page.getByRole('heading',{name:'Search Results for "'+term+'"',exact:true}).waitFor({state:'visible',timeout:15000});
  const sku=page.getByRole('main').getByText(item.sku,{exact:true});
  await uniqueVisible(sku);await sku.click();
  // Desktop may navigate to a full product page instead of opening a dialog.
  const details=page.getByRole('dialog',{name:'Part Details',exact:true}).or(page.getByRole('main'));
  await details.getByRole('heading',{level:5,name:item.description,exact:true}).waitFor({state:'visible',timeout:15000});
  const product=await page.evaluate(readProductDialog);
  if(product.sku!==item.sku || product.brand.toUpperCase()!==item.brand.toUpperCase() || product.description!==item.description)throw Error('REVIEW_REQUIRED');
  return {kind:item.kind,sku:product.sku,brand:product.brand,description:product.description,
    quantityMilli:item.quantityMilli,unitNetPence:Math.ceil(product.unitNetPence*1000/item.packQuantityMilli),
    ...(item.kind==='oil'?{packNetPence:product.unitNetPence,packQuantityMilli:item.packQuantityMilli}:{}),vatBasis:'EX_VAT',inStock:true};
}
async function uniqueVisible(locator) {
  if(await locator.count()!==1 || !await locator.isVisible())throw Error('SETTINGS_REQUIRED');
  return locator;
}
export async function readProduct(page,item) {
  await page.goto(supplierUrl(item.url),{waitUntil:'domcontentloaded',timeout:15000});
  if(new URL(page.url()).origin!==SUPPLIER)throw Error('UNAVAILABLE');
  if(/\/signin(?:[/?]|$)/.test(page.url()))throw Error('LOGIN_REQUIRED');
  const root=page.locator(item.rootCss);
  await root.waitFor({state:'visible',timeout:10000});await uniqueVisible(root);
  const sku=await uniqueVisible(root.locator(item.skuCss));
  if((await sku.innerText()).replace(/^SKU:\s*/i,'').trim()!==item.sku)throw Error('REVIEW_REQUIRED');
  const price=await uniqueVisible(root.locator(item.priceCss));
  const stock=await uniqueVisible(root.locator(item.stockCss));
  const vat=await uniqueVisible(page.locator(item.vatBasisCss));
  if(!/^(?:Prices?\s+)?(?:ex(?:cluding)?\.?\s+VAT|VAT\s+excl(?:uded)?\.?)$/i.test((await vat.innerText()).trim()))throw Error('SETTINGS_REQUIRED');
  if(!/^In stock\.?$/i.test((await stock.innerText()).trim()))throw Error('UNAVAILABLE');
  const packNetPence=moneyPence(await price.innerText());
  if(packNetPence<1 || packNetPence>500000)throw Error('SETTINGS_REQUIRED');
  // Oil may be sold in 5L packs; charge only the verified fill quantity.
  const unitNetPence=Math.ceil(packNetPence*1000/item.packQuantityMilli);
  return {kind:item.kind,sku:item.sku,brand:item.brand,description:item.description,
    quantityMilli:item.quantityMilli,unitNetPence,
    ...(item.kind==='oil'?{packNetPence,packQuantityMilli:item.packQuantityMilli}:{}),vatBasis:'EX_VAT',inStock:true};
}
export async function lookupService(page,raw,config) {
  const request=servicePriceRequest(raw),recipe=approvedRecipe(config,request);
  if(config.lookupMode==='approved-skus') {
    const items=[];
    for(const item of recipe.items)items.push(await readProductBySku(page,item));
    return cleanServiceCosts({request,recipeId:recipe.id,vehicle:recipe.vehicle,oilSpecification:recipe.oilSpecification,
      requiredKinds:recipe.requiredKinds,items,fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date().toISOString()},request);
  }
  await page.goto(SUPPLIER,{waitUntil:'domcontentloaded',timeout:15000});
  if(/\/signin(?:[/?]|$)/.test(page.url()))throw Error('LOGIN_REQUIRED');
  // This is the visible registration search, never a hidden supplier API.
  const field=page.getByRole('textbox').nth(1);
  await field.fill(request.registration);
  await page.getByRole('button',{name:'Search VRM Button',exact:true}).click();
  // A recent-vehicles entry alone is insufficient evidence of selected fitment.
  const selected=page.locator(config.selectedVehicleCss);
  await selected.waitFor({state:'visible',timeout:15000});await uniqueVisible(selected);
  const identity=(await selected.innerText()).replace(/\s+/g,' ').toUpperCase();
  if(!identity.replace(/\s/g,'').includes(request.registration) || !identity.includes(recipe.vehicle.toUpperCase()))throw Error('REVIEW_REQUIRED');
  const items=[];
  for(const item of recipe.items)items.push(await readProduct(page,item));
  return cleanServiceCosts({request,recipeId:recipe.id,vehicle:recipe.vehicle,oilSpecification:recipe.oilSpecification,
    requiredKinds:recipe.requiredKinds,items,fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date().toISOString()},request);
}
