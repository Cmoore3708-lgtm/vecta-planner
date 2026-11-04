import {estimatedFilter} from '../../lib/service-guide-costs.js';
import {servicePriceRequest,serviceRequiredKinds,cleanServiceQuoteCosts,cleanPartialServiceCosts} from '../../lib/service-pricing.js';
import {captureServiceCategory} from './service-capture.mjs';
import {readProductDialog,openSelectedProduct} from './product-dialog.mjs';
import {oilFillEvidence} from './oil-capacity.mjs';
import {chooseServiceOilPack} from './oil-pack-choice.mjs';
// Older standalone oil-fix installations have only the category lookup.
// Resolve the optional Service Kit reader only when that route is attempted.
const captureServiceKit=async(...args)=>(await import('./service-kit.mjs')).captureServiceKit(...args);
const readKitProduct=async(...args)=>(await import('./service-kit.mjs')).readKitProduct(...args);
const fail=(reason='REVIEW_REQUIRED',evidence={})=>{throw Object.assign(Error('REVIEW_REQUIRED'),{diagnosticReason:reason,evidence});};
const categories={oil:'Engine Oils (Applied)',oil_filter:'Oil Filter',air_filter:'Air Filter',cabin_filter:'Cabin Filter',fuel_filter:'Fuel Filter'};
// Parse only the selected product's stock/price panel, never alternative cards or RRP.
export function catalogueSelection(capture,kind,registration,{allowPriceOnly=false}={}){
 if(capture.status!=='CAPTURED_FOR_REVIEW'||!capture.selectedRegistration||capture.registration!==registration||capture.truncated)fail(capture.reason||'VEHICLE_OR_CAPTURE_NOT_CONFIRMED',{selectedRegistration:capture.selectedRegistration===true});
 const text=capture.visibleText||'',skus=[...text.matchAll(/\bSKU:\s*([A-Za-z0-9._/-]+)/g)];
 if(!skus.length)fail('NO_PRODUCT_SKU');
 let firstFailure;
 for(let productIndex=0;productIndex<skus.length;productIndex++){
 try{
 const sku=skus[productIndex][1],segment=text.slice(skus[productIndex].index,skus[productIndex+1]?.index??text.length);
 const panel=segment.match(/Stock Type Quantity\s+(.+?)\s+£\s*(\d+\.\d{2})\s+RRP:/);
 const selectedCard=segment.match(/Sort By Relevancy\s+£\s*(\d+\.\d{2})\s+(Gold|Silver|Bronze)\b/);
 if(!selectedCard||selectedCard[2]!=='Gold'||(panel&&selectedCard[1]!==panel[2]))fail('PRICE_OR_GRADE_NOT_CONFIRMED');
 const stockConfirmed=!!panel&&/^SKU:\s*[A-Za-z0-9._/-]+\s+In stock(?: in (?:RDC|NDC))?\./i.test(segment)&&/(?:Boldon|RDC|NDC)\s+[1-9]\d*/.test(panel[1]);
 if(!stockConfirmed&&!allowPriceOnly)fail('STOCK_PANEL_NOT_CONFIRMED');
 const pricePence=Math.round(Number(selectedCard[1])*100);
 if(!Number.isSafeInteger(pricePence)||pricePence<1)fail('PRICE_OR_GRADE_NOT_CONFIRMED');
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
 return {kind,searchTerm:sku,detailUrl:capture.productLinks?.find(link=>link.sku===sku)?.url,expectedPricePence:pricePence,description:title,quantityMilli,packQuantityMilli,fuelType,...(!stockConfirmed?{pricingOnly:true}:{})};
 }catch(error){
  // Try another independently displayed group only for unavailable stock/grade.
  // Never mask unknown oil fill, ambiguous identity or description evidence.
  if(kind==='oil'||!['STOCK_PANEL_NOT_CONFIRMED','PRICE_OR_GRADE_NOT_CONFIRMED'].includes(error.diagnosticReason))throw error;
  firstFailure ||= error;
 }
 }
 throw firstFailure;
}
async function freshProduct(page,selected){
 await openSelectedProduct(page,selected);
 let product;const deadline=Date.now()+15000;
 while(Date.now()<deadline){
  if(/\/signin(?:[/?]|$)/.test(page.url()))throw Error('LOGIN_REQUIRED');
  try{product=await page.evaluate(readProductDialog,{allowUnavailablePrice:true});break;}catch{await page.waitForTimeout(200);}
 }
 if(!product||String(product.description).replace(/\s+/g,' ').trim().toLowerCase()!==selected.description.replace(/\s+/g,' ').trim().toLowerCase()||!selected.searchTerm.toUpperCase().endsWith(product.sku.toUpperCase())||product.unitNetPence!==selected.expectedPricePence)fail();
 return {kind:selected.kind,sku:product.sku,brand:product.brand,description:product.description,quantityMilli:selected.quantityMilli,
  unitNetPence:Math.ceil(product.unitNetPence*1000/selected.packQuantityMilli),...(selected.kind==='oil'?{packNetPence:product.unitNetPence,packQuantityMilli:selected.packQuantityMilli}:{}),vatBasis:'EX_VAT',inStock:product.inStock===true,...(product.inStock!==true?{pricingOnly:true}:{})};
}
export async function lookupLiveService(page,raw,{capture=captureServiceCategory,readFresh=freshProduct,chooseOilPack=chooseServiceOilPack,captureKit=capture===captureServiceCategory?captureServiceKit:null,readKit=readKitProduct,now=Date.now}={}){
 const began=Date.now();
 const request=servicePriceRequest(raw);
 if(request.range!=='Mid Range')fail(); // Never mislabel Gold catalogue parts as Budget or Dealer.
 const firstKind=request.service==='EV Major Service'?'cabin_filter':'oil_filter';
 let kit=null;
 if(captureKit){
  try{kit=await captureKit(page,request);}
  catch(error){if(['LOGIN_REQUIRED','PAIRING_REQUIRED'].includes(error.message))throw error;}
 }
 // A missing oil-filter category is not proof that the other categories have no stock.
 // Establish the exact vehicle from another required category before using any prices.
 let first=kit?.vehicleCapture,identityKind=firstKind;
 const attempts=new Map();
 if(!first){for(const kind of new Set([firstKind,...(request.service==='EV Major Service'?[]:['oil',...(/Full|Major/.test(request.service)?['air_filter','cabin_filter']:[])])])){
  try{const candidate=await capture(page,request.registration,categories[kind]);attempts.set(kind,candidate);
   if(candidate.registration&&candidate.registration!==request.registration)throw Error('VEHICLE_MISMATCH');
   if(candidate.status==='CAPTURED_FOR_REVIEW'&&candidate.selectedRegistration&&candidate.registration===request.registration&&!candidate.truncated){first=candidate;identityKind=kind;break;}
  }catch(error){if(['LOGIN_REQUIRED','PAIRING_REQUIRED','VEHICLE_MISMATCH'].includes(error.message))throw error;attempts.set(kind,null);}
 }}
 if(!first||first.status!=='CAPTURED_FOR_REVIEW'||!first.selectedRegistration||first.registration!==request.registration||first.truncated)fail(first?.reason||'SELECTED_VEHICLE_NOT_CONFIRMED');
 const text=first.visibleText||'',boundary=text.indexOf(' Copy VIN'),identity=boundary<0?'':text.slice(0,boundary);
 const fuels=['diesel','petrol','electric'].filter(f=>new RegExp('\\b'+(f==='electric'?'Electric(?:ity)?':f)+'\\b','i').test(identity));
 const combustion=fuels.filter(f=>f!=='electric');
 const fuelType=combustion.length===1?combustion[0]:combustion.length?null:fuels.includes('electric')?'electric':null;
 if(!fuelType)fail('FUEL_TYPE_UNCONFIRMED');
 const requiredKinds=serviceRequiredKinds(request.service,fuelType),items=[];
 for(const kind of requiredKinds){
  try{
   const kitRow=kit?.registration===request.registration?kit.items.find(item=>item.kind===kind):null;
   if(kitRow){
    try{
     const product=await readKit(page,kitRow,request,{capture});
     items.push(kind==='oil'?await chooseOilPack(page,product,{searchTerm:kitRow.searchTerm}):product);
     continue;
    }catch(error){
     if(['LOGIN_REQUIRED','PAIRING_REQUIRED','VEHICLE_MISMATCH'].includes(error.message))throw error;
     // A missing field or changed price falls back to the existing independently
     // verified category flow; kit values are never treated as a completed quote.
    }
   }
   const evidence=kind===identityKind&&!kit?first:attempts.has(kind)?attempts.get(kind):await capture(page,request.registration,categories[kind]);
   if(!evidence)throw Error('REVIEW_REQUIRED');
   if(evidence.registration!==request.registration)throw Error('VEHICLE_MISMATCH');
   if(!evidence.selectedRegistration)throw Error('REVIEW_REQUIRED');
   const selected=catalogueSelection(evidence,kind,request.registration,{allowPriceOnly:true});
   if(selected.fuelType!==fuelType)throw Error('VEHICLE_MISMATCH');
   const product=await readFresh(page,selected);
   items.push(kind==='oil'?await chooseOilPack(page,product,{searchTerm:selected.searchTerm}):product);
  }catch(error){
   if(['LOGIN_REQUIRED','PAIRING_REQUIRED','VEHICLE_MISMATCH'].includes(error.message)){error.evidence={category:categories[kind],...error.evidence};throw error;}
   if(kind!=='oil')items.push(estimatedFilter(kind));
  }
 }
 const partial=requiredKinds.some(kind=>!items.some(item=>item.kind===kind));
 const guidePrice=items.some(item=>item.estimated||item.pricingOnly);
 const optionalParts=[];
 // Older PC workers can keep returning the core service unchanged. New workers
 // also attempt plugs, but only an explicit GSF required quantity can be priced.
 if(request.service==='Major Service'&&/^petrol(?: hybrid)?$/.test(fuelType)&&Date.now()-began<100000){
  let optionalTimer;
  try{
   await Promise.race([(async()=>{
   const evidence=await capture(page,request.registration,'Spark Plug');
   const selected=catalogueSelection(evidence,'spark_plug',request.registration);
   const quantities=[...String(evidence.visibleText||'').matchAll(/\b(?:required quantity|quantity required|quantity per vehicle)\s*[:=-]?\s*(\d+)\b/gi)].map(m=>Number(m[1]));
   if(selected.fuelType===fuelType&&quantities.length&&new Set(quantities).size===1&&quantities[0]>=1&&quantities[0]<=16){
    selected.quantityMilli=quantities[0]*1000;
    optionalParts.push({...await readFresh(page,selected),fitmentVerified:true,quantityVerified:true});
   }
   })(),new Promise((_,reject)=>{optionalTimer=setTimeout(()=>reject(Error('OPTIONAL_TIMEOUT')),10000);})]);
  }catch { /* Optional lookup failure must not lose the Full/Interim price. */ }
  finally {clearTimeout(optionalTimer);}
 }
 return (partial?cleanPartialServiceCosts:cleanServiceQuoteCosts)({request,...(partial?{partial:true}:{}),...(guidePrice?{guidePrice:true}:{}),recipeId:'gsf-selected-vehicle-v1',vehicle:serviceVehicleLabel(first,request.registration),
  fuelType,oilSpecification:request.service==='EV Major Service'?'':'GSF vehicle-applied oil recommendation',requiredKinds,items,optionalParts,
  fitmentVerified:true,scopeVerified:true,oilVerified:items.some(item=>item.kind==='oil'),checkedAt:new Date(now()).toISOString()},request,now());
}

// Display label only: full identity was checked above and is never truncated for fitment.
export function serviceVehicleLabel(capture,registration){
 const identity=capture.visibleText?.split(' Clear ')[1]?.split(' Copy VIN')[0]||registration;
 return identity.length>160?identity.slice(0,159)+'…':identity;
}
