import {servicePriceRequest,serviceRequiredKinds,cleanServiceCosts} from '../../lib/service-pricing.js';
import {captureServiceCategory} from './service-capture.mjs';
import {readProductDialog} from './product-dialog.mjs';
import {oilFillEvidence} from './oil-capacity.mjs';
const fail=()=>{throw Error('REVIEW_REQUIRED');};
const categories={oil:'Engine Oils (Applied)',oil_filter:'Oil Filter',air_filter:'Air Filter',cabin_filter:'Cabin Filter',fuel_filter:'Fuel Filter'};
// Parse only the selected product's stock/price panel, never alternative cards or RRP.
export function catalogueSelection(capture,kind,registration){
 if(capture.status!=='CAPTURED_FOR_REVIEW'||!capture.selectedRegistration||capture.registration!==registration||capture.truncated)fail();
 const text=capture.visibleText||'',skus=[...text.matchAll(/\bSKU:\s*([A-Za-z0-9._/-]+)/g)];
 if(!skus.length)fail();
 const sku=skus[0][1],segment=text.slice(skus[0].index,skus[1]?.index??text.length);
 const panel=segment.match(/Stock Type Quantity\s+(.+?)\s+£\s*(\d+\.\d{2})\s+RRP:/);
 if(!panel||!/^SKU:\s*[A-Za-z0-9._/-]+\s+In stock(?: in (?:RDC|NDC))?\.(?: Get it tomorrow\.)?(?=\s|$)/i.test(segment)||!/(?:Boldon|RDC|NDC)\s+[1-9]\d*/.test(panel[1]))fail();
 const pricePence=Math.round(Number(panel[2])*100);
 const selectedCard=segment.match(/Sort By Relevancy\s+£\s*(\d+\.\d{2})\s+(Gold|Silver|Bronze)\b/);
 if(!selectedCard||selectedCard[1]!==panel[2]||selectedCard[2]!=='Gold')fail(); // Mid Range: selected Gold option only.
 const title=capture.headings?.find(h=>h&&!/^£/.test(h)&&!['Engine Oil Information','Progress','Oil recommendation','Capacity','Viscosity'].includes(h));
 if(!title)fail();
 let quantityMilli=1000,packQuantityMilli=1000;
 if(kind==='oil'){
  const fill=oilFillEvidence(capture,registration),pack=title.match(/\b(\d+(?:\.\d+)?)\s*L\s*$/i);
  if(!fill||!pack)fail();quantityMilli=fill.requiredMl;packQuantityMilli=Math.round(Number(pack[1])*1000);
  if(quantityMilli<1||quantityMilli>30000||packQuantityMilli<1||packQuantityMilli>250000)fail();
 }
 const fuelType=/\bDiesel\b/.test(text)?'diesel':/\bPetrol\b/.test(text)?'petrol':/\bElectric(?:ity)?\b/.test(text)?'electric':null;
 if(!fuelType)fail();
 return {kind,searchTerm:sku,expectedPricePence:pricePence,description:title,quantityMilli,packQuantityMilli,fuelType};
}
async function freshProduct(page,selected){
 await page.goto('https://trade.gsfcarparts.com/partdetails/'+encodeURIComponent(selected.searchTerm),{waitUntil:'domcontentloaded',timeout:15000});
 let product;const deadline=Date.now()+15000;
 while(Date.now()<deadline){
  if(/\/signin(?:[/?]|$)/.test(page.url()))throw Error('LOGIN_REQUIRED');
  try{product=await page.evaluate(readProductDialog);break;}catch{await page.waitForTimeout(200);}
 }
 if(!product||String(product.description).replace(/\s+/g,' ').trim().toLowerCase()!==selected.description.replace(/\s+/g,' ').trim().toLowerCase()||!selected.searchTerm.toUpperCase().endsWith(product.sku.toUpperCase())||product.unitNetPence!==selected.expectedPricePence)fail();
 return {kind:selected.kind,sku:product.sku,brand:product.brand,description:product.description,quantityMilli:selected.quantityMilli,
  unitNetPence:Math.ceil(product.unitNetPence*1000/selected.packQuantityMilli),...(selected.kind==='oil'?{packNetPence:product.unitNetPence,packQuantityMilli:selected.packQuantityMilli}:{}),vatBasis:'EX_VAT',inStock:true};
}
export async function lookupLiveService(page,raw,{capture=captureServiceCategory,readFresh=freshProduct,now=Date.now}={}){
 const request=servicePriceRequest(raw);
 if(request.range!=='Mid Range')fail(); // Never mislabel Gold catalogue parts as Budget or Dealer.
 const firstKind=request.service==='EV Major Service'?'cabin_filter':'oil_filter';
 const first=await capture(page,request.registration,categories[firstKind]);
 const selectedFirst=catalogueSelection(first,firstKind,request.registration);
 const fuelType=selectedFirst.fuelType,requiredKinds=serviceRequiredKinds(request.service,fuelType),items=[];
 for(const kind of requiredKinds){
  const selected=kind===firstKind?selectedFirst:catalogueSelection(await capture(page,request.registration,categories[kind]),kind,request.registration);
  if(selected.fuelType!==fuelType)fail();
  items.push(await readFresh(page,selected));
 }
 return cleanServiceCosts({request,recipeId:'gsf-selected-vehicle-v1',vehicle:first.visibleText.split(' Clear ')[1]?.split(' Copy VIN')[0]||request.registration,
  fuelType,oilSpecification:request.service==='EV Major Service'?'':'GSF vehicle-applied oil recommendation',requiredKinds,items,
  fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date(now()).toISOString()},request,now());
}
