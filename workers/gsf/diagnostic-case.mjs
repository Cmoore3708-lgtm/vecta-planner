import {captureServiceCategory} from './service-capture.mjs';
import {catalogueSelection,lookupLiveService} from './live-service.mjs';
import {diagnosticProduct} from './diagnostic-product.mjs';
import {cleanEvidence,PAUSE_CODES,safeCode} from '../../lib/worker-tests.js';
const categories={oil_filter:'Oil Filter',air_filter:'Air Filter',cabin_filter:'Cabin Filter',fuel_filter:'Fuel Filter',oil:'Engine Oils (Applied)'};
export async function diagnosticCase(page,request,{capture=captureServiceCategory,readFresh=diagnosticProduct,lookup=lookupLiveService}={}) {
 let stage='REQUEST_VALIDATION',evidence={},supplierStatus=null;
 const observe=response=>{try{if(new URL(response.url()).origin==='https://trade.gsfcarparts.com'&&response.request().resourceType()==='document'&&[429,502,503,504].includes(response.status()))supplierStatus=response.status();}catch{}};
 page.on?.('response',observe);
 try {
  const {registration,operation}=request,fuel=String(request.fuelType||'').toLowerCase();
  if(operation!=='service'&&!categories[operation])throw Error('UNSUPPORTED_OPERATION');
  if((['electric','electricity','battery electric','bev'].includes(fuel)&&!['service','cabin_filter'].includes(operation)) || operation==='fuel_filter'&&['petrol','petrol hybrid'].includes(fuel))return {outcome:'SKIPPED',reason:'NOT_IN_SERVICE_SCOPE',evidence:{stage,reason:'NOT_IN_SERVICE_SCOPE',fuelType:fuel}};
  if(operation==='service') {
   stage='SERVICE_LOOKUP';
   const result=await lookup(page,{registration,service:['electric','electricity','battery electric','bev'].includes(fuel)?'EV Major Service':'Major Service',range:'Mid Range',mileage:null});
   return {outcome:'PASSED',reason:'SUPPLIER_CHECKS_PASSED',evidence:cleanEvidence({stage:'SERVICE_VALIDATION',reason:'SUPPLIER_CHECKS_PASSED',fitmentVerified:result.fitmentVerified,scopeVerified:result.scopeVerified,oilVerified:result.oilVerified,items:result.items,fuelType:result.fuelType})};
  }
  stage='CATEGORY_CAPTURE';
  const found=await capture(page,registration,categories[operation]);
  evidence={category:categories[operation],selectedRegistration:found.selectedRegistration===true,headings:found.headings,skus:found.skuLabels};
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
