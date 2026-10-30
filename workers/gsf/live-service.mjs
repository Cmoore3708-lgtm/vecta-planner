import {servicePriceRequest,serviceRequiredKinds,cleanServiceCosts} from '../../lib/service-pricing.js';
import {captureServiceCategory} from './service-capture.mjs';
import {readProductDialog} from './product-dialog.mjs';
import {openSelectedProduct} from './product-dialog.mjs';
import {oilFillEvidence} from './oil-capacity.mjs';
const fail=(reason='REVIEW_REQUIRED',evidence={})=>{throw Object.assign(Error('REVIEW_REQUIRED'),{diagnosticReason:reason,evidence});};
const categories={oil:'Engine Oils (Applied)',oil_filter:'Oil Filter',air_filter:'Air Filter',cabin_filter:'Cabin Filter',fuel_filter:'Fuel Filter'};
// Parse only the selected product's stock/price panel, never alternative cards or RRP.
export function catalogueSelection(capture,kind,registration){
 if(capture.status!=='CAPTURED_FOR_REVIEW'||!capture.selectedRegistration||capture.registration!==registration||capture.truncated)fail(capture.reason||'VEHICLE_OR_CAPTURE_NOT_CONFIRMED',{selectedRegistration:capture.selectedRegistration===true});
 const text=capture.visibleText||'',skus=[...text.matchAll(/\bSKU:\s*([A-Za-z0-9._/-]+)/g)];
 if(!skus.length)fail('NO_PRODUCT_SKU');
 let firstFailure;
 for(let productIndex=0;productIndex<skus.length;productIndex++){
 try{
 const sku=skus[productIndex][1],segment=text.slice(skus[productIndex].index,skus[productIndex+1]?.index??text.length);
 const panel=segment.match(/Stock Type Quantity\s+(.+?)\s+£\s*(\d+\.\d{2})\s+RRP:/);
 if(!panel||!/^SKU:\s*[A-Za-z0-9._/-]+\s+In stock(?: in (?:RDC|NDC))?\.(?: Get it (?:tomorrow|this afternoon)\.)?(?=\s|$)/i.test(segment)||!/(?:Boldon|RDC|NDC)\s+[1-9]\d*/.test(panel[1]))fail('STOCK_PANEL_NOT_CONFIRMED');
 const pricePence=Math.round(Number(panel[2])*100);
 const selectedCard=segment.match(/Sort By Relevancy\s+£\s*(\d+\.\d{2})\s+(Gold|Silver|Bronze)\b/);
 if(!selectedCard||selectedCard[1]!==panel[2]||selectedCard[2]!=='Gold')fail('PRICE_OR_GRADE_NOT_CONFIRMED'); // Mid Range: selected Gold option only.
 const prefix=text.slice(0,skus[productIndex].index),previousIndex=productIndex?skus[productIndex-1].index:-1;
 const title=capture.headings?.filter(h=>h&&!/^£/.test(h)&&!['Fitment','Attributes','Engine Oil Information','Progress','Oil recommendation','Capacity','Viscosity'].includes(h))
  .map(h=>({h,index:prefix.lastIndexOf(h)})).filter(x=>x.index>previousIndex).sort((a,b)=>b.index-a.index)[0]?.h;
 if(!title)fail('PRODUCT_DESCRIPTION_MISSING');
 let quantityMilli=1000,packQuantityMilli=1000;
 if(kind==='oil'){
  const fill=oilFillEvidence(capture,registration),pack=title.match(/\b(\d+(?:\.\d+)?)\s*L\s*$/i);
  if(!fill||!pack)fail('OIL_FILL_OR_PACK_UNCONFIRMED');quantityMilli=fill.requiredMl;packQuantityMilli=Math.round(Number(pack[1])*1000);
  if(quantityMilli<1||quantityMilli>30000||packQuantityMilli<1||packQuantityMilli>250000)fail('OIL_QUANTITY_OUT_OF_RANGE');
 }
 const identityEnd=text.indexOf(' Copy VIN'),identity=identityEnd<0?'':text.slice(0,identityEnd);
 const fuels=['diesel','petrol','electric'].filter(f=>new RegExp('\\b'+(f==='electric'?'Electric(?:ity)?':f)+'\\b','i').test(identity));
 const combustion=fuels.filter(f=>f!=='electric');
 const fuelType=combustion.length===1?combustion[0]:combustion.length>1?null:fuels.includes('electric')?'electric':null;
 if(!fuelType)fail('FUEL_TYPE_UNCONFIRMED');
 return {kind,searchTerm:sku,detailUrl:capture.productLinks?.find(link=>link.sku===sku)?.url,expectedPricePence:pricePence,description:title,quantityMilli,packQuantityMilli,fuelType};
 }catch(error){
  // Try another independently displayed group only for unavailable stock/grade.
  // Never mask unknown oil fill, ambiguous identity or description evidence.
  if(kind==='oil'||!['STOCK_PANEL_NOT_CONFIRMED','PRICE_OR_GRADE_NOT_CONFIRMED'].includes(error.diagnosticReason))throw error;
  firstFailure ||= error;
 }
 }
 throw firstFailure;
}
export async function freshProduct(page,selected){
 await openSelectedProduct(page,selected);
 let product,lastReadError;const deadline=Date.now()+15000;
 while(Date.now()<deadline){
  if(/\/signin(?:[/?]|$)/.test(page.url()))throw Error('LOGIN_REQUIRED');
  try{product=await page.evaluate(readProductDialog);break;}catch(error){lastReadError=error;await page.waitForTimeout(200);}
 }
 const evidence={expectedDescription:selected.description,observedDescription:product?.description,sku:product?.sku,expectedPricePence:selected.expectedPricePence,observedPricePence:product?.unitNetPence};
 if(!product)fail(lastReadError?.message==='UNAVAILABLE'?'PRODUCT_STOCK_UNAVAILABLE':lastReadError?.message==='SETTINGS_REQUIRED'?'PRODUCT_FIELDS_UNCONFIRMED':'PRODUCT_DETAILS_UNREADABLE',evidence);
 if(String(product.description).replace(/\s+/g,' ').trim().toLowerCase()!==selected.description.replace(/\s+/g,' ').trim().toLowerCase())fail('PRODUCT_DESCRIPTION_MISMATCH',evidence);
 if(/^MAN.*\//.test(selected.searchTerm)&&(product.sku!==selected.searchTerm.slice(3)||product.brand.toUpperCase()!=='MANN-FILTER'))fail('PRODUCT_SKU_MISMATCH',evidence);
 if(!selected.searchTerm.toUpperCase().endsWith(product.sku.toUpperCase()))fail('PRODUCT_SKU_MISMATCH',evidence);
 if(product.unitNetPence!==selected.expectedPricePence)fail('PRODUCT_PRICE_MISMATCH',evidence);
 return {kind:selected.kind,sku:product.sku,brand:product.brand,description:product.description,quantityMilli:selected.quantityMilli,
  unitNetPence:Math.ceil(product.unitNetPence*1000/selected.packQuantityMilli),...(selected.kind==='oil'?{packNetPence:product.unitNetPence,packQuantityMilli:selected.packQuantityMilli}:{}),vatBasis:'EX_VAT',inStock:true};
}
export async function lookupLiveService(page,raw,{capture=captureServiceCategory,readFresh=freshProduct,now=Date.now}={}){
 const request=servicePriceRequest(raw);
 if(request.range!=='Mid Range')fail('QUALITY_GRADE_UNSUPPORTED'); // Never mislabel Gold catalogue parts as Budget or Dealer.
 const firstKind=request.service==='EV Major Service'?'cabin_filter':'oil_filter';
 let stage='CATEGORY_CAPTURE',kind=firstKind;
 try {
 const first=await capture(page,request.registration,categories[firstKind]);
 stage='CATALOGUE_SELECTION';
 const selectedFirst=catalogueSelection(first,firstKind,request.registration);
 const fuelType=selectedFirst.fuelType,requiredKinds=serviceRequiredKinds(request.service,fuelType),items=[];
 for(const nextKind of requiredKinds){
  kind=nextKind;stage='CATEGORY_CAPTURE';
  let selected=selectedFirst;
  if(kind!==firstKind){const found=await capture(page,request.registration,categories[kind]);stage='CATALOGUE_SELECTION';selected=catalogueSelection(found,kind,request.registration);}
  if(selected.fuelType!==fuelType)fail('FUEL_TYPE_MISMATCH');
  stage='PRODUCT_DETAILS';
  items.push(await readFresh(page,selected));
 }
 stage='SERVICE_VALIDATION';
 return cleanServiceCosts({request,recipeId:'gsf-selected-vehicle-v1',vehicle:serviceVehicleLabel(first,request.registration),
  fuelType,oilSpecification:request.service==='EV Major Service'?'':'GSF vehicle-applied oil recommendation',requiredKinds,items,
  fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date(now()).toISOString()},request,now());
 }catch(error){error.stage ||= stage;error.evidence={category:categories[kind],...error.evidence};throw error;}
}

// Display label only: full identity was checked above and is never truncated for fitment.
export function serviceVehicleLabel(capture,registration){
 const identity=capture.visibleText?.split(' Clear ')[1]?.split(' Copy VIN')[0]||registration;
 return identity.length>160?identity.slice(0,159)+'…':identity;
}
