import {captureServiceCategory} from './service-capture.mjs';
import {catalogueSelection,lookupLiveService} from './live-service.mjs';
import {diagnosticProduct} from './diagnostic-product.mjs';
import {cleanEvidence,PAUSE_CODES,safeCode,NON_VEHICLE_FIXTURES} from '../../lib/worker-tests.js';
export function selectedVehicleFuel(found,registration){
 if(!found?.selectedRegistration||found.registration!==registration||found.truncated)return null;
 const text=String(found.visibleText||'');
 // Require the selected identity boundary; never use related products or recent vehicles.
 const end=text.indexOf(' Copy VIN');if(end<0)return null;
 const identity=text.slice(0,end),fuels=['diesel','petrol','electric'].filter(f=>new RegExp('\\b'+(f==='electric'?'Electric(?:ity)?':f)+'\\b','i').test(identity));
 const combustion=fuels.filter(f=>f!=='electric');
 return combustion.length===1?combustion[0]:combustion.length>1?null:fuels.includes('electric')?'electric':null;
}
const categories={oil_filter:'Oil Filter',air_filter:'Air Filter',cabin_filter:'Cabin Filter',fuel_filter:'Fuel Filter',oil:'Engine Oils (Applied)'};
export async function diagnosticCase(page,request,{capture=captureServiceCategory,readFresh=diagnosticProduct,lookup=lookupLiveService}={}) {
 let stage='REQUEST_VALIDATION',evidence={},supplierStatus=null;
 const observe=response=>{try{if(new URL(response.url()).origin==='https://trade.gsfcarparts.com'&&response.request().resourceType()==='document'&&[429,502,503,504].includes(response.status()))supplierStatus=response.status();}catch{}};
 page.on?.('response',observe);
 try {
  const {registration,operation}=request;let fuel=String(request.fuelType||'').toLowerCase();
  if(NON_VEHICLE_FIXTURES.has(registration))return {outcome:'SKIPPED',reason:'NON_VEHICLE_FIXTURE',evidence:{stage,reason:'NON_VEHICLE_FIXTURE'}};
  if(operation!=='service'&&!categories[operation])throw Error('UNSUPPORTED_OPERATION');
  if((['electric','electricity','battery electric','bev'].includes(fuel)&&!['service','cabin_filter'].includes(operation)) || operation==='fuel_filter'&&['petrol','petrol hybrid'].includes(fuel))return {outcome:'SKIPPED',reason:'NOT_IN_SERVICE_SCOPE',evidence:{stage,reason:'NOT_IN_SERVICE_SCOPE',fuelType:fuel}};
  if(operation==='service') {
   if(!fuel){
    stage='VEHICLE_SCOPE';const identity=await capture(page,registration,categories.cabin_filter);
    fuel=selectedVehicleFuel(identity,registration);
    evidence={category:categories.cabin_filter,selectedRegistration:identity.selectedRegistration===true,fuelType:fuel};
    if(!fuel)throw Object.assign(Error('REVIEW_REQUIRED'),{diagnosticReason:'FUEL_TYPE_UNCONFIRMED'});
   }
   stage='SERVICE_LOOKUP';
   const result=await lookup(page,{registration,service:['electric','electricity','battery electric','bev'].includes(fuel)?'EV Major Service':'Major Service',range:'Mid Range',mileage:null});
   return {outcome:'PASSED',reason:'SUPPLIER_CHECKS_PASSED',evidence:cleanEvidence({stage:'SERVICE_VALIDATION',reason:'SUPPLIER_CHECKS_PASSED',fitmentVerified:result.fitmentVerified,scopeVerified:result.scopeVerified,oilVerified:result.oilVerified,items:result.items,fuelType:result.fuelType})};
  }
  stage='CATEGORY_CAPTURE';
  const found=await capture(page,registration,categories[operation]);
  evidence={category:categories[operation],selectedRegistration:found.selectedRegistration===true,headings:found.headings,skus:found.skuLabels};
  // Cohort fuel metadata may be absent. Use only this freshly selected vehicle's supplier identity.
  const selectedFuel=selectedVehicleFuel(found,registration);
  if(selectedFuel==='electric'&&operation!=='cabin_filter'||selectedFuel==='petrol'&&operation==='fuel_filter')return {outcome:'SKIPPED',reason:'NOT_IN_SERVICE_SCOPE',evidence:cleanEvidence({...evidence,stage:'SCOPE_VALIDATION',reason:'NOT_IN_SERVICE_SCOPE',fuelType:selectedFuel})};
  stage='CATALOGUE_SELECTION';
  const selected=catalogueSelection(found,operation,registration);
  evidence={...evidence,expectedDescription:selected.description,expectedPricePence:selected.expectedPricePence,fuelType:selected.fuelType};
  stage='PRODUCT_DETAILS';
  const item=await readFresh(page,selected);
  return {outcome:'PASSED',reason:'SUPPLIER_CHECKS_PASSED',evidence:cleanEvidence({...evidence,stage,reason:'SUPPLIER_CHECKS_PASSED',observedDescription:item.description,sku:item.sku,brand:item.brand,quantityMilli:item.quantityMilli,packQuantityMilli:item.packQuantityMilli})};
 }catch(error){
  const code=supplierStatus===429?'SUPPLIER_THROTTLED':supplierStatus?'SUPPLIER_UNAVAILABLE':safeCode(error.message,error.name==='TimeoutError'?'LOOKUP_TIMEOUT':/net::ERR_|ECONNRESET|ECONNREFUSED|ENOTFOUND/.test(error.message)?'NETWORK_ERROR':'LOOKUP_FAILED');
  const reason=supplierStatus?code:safeCode(error.diagnosticReason,code);
  const outcome=PAUSE_CODES.includes(reason)?'PAUSED':['LOOKUP_TIMEOUT','NETWORK_ERROR','LOOKUP_FAILED'].includes(reason)?'FAILED':'REVIEW_REQUIRED';
  return {outcome,reason,evidence:cleanEvidence({...evidence,...error.evidence,stage:error.stage||stage,reason})};
 }finally{page.removeListener?.('response',observe);}
}
