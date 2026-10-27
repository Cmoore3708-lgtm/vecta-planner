import {cleanServiceCosts,normaliseRegistration} from './service-pricing.js';

// Called only after the customer's service token has been verified server-side.
// Public quotes omit costs; recover the original private supplier result instead.
export function bookingServiceParts(quote,results=[]){
 const raw=results.find(row=>{
  const value=row.result||row;
  return normaliseRegistration(value.request?.registration)===quote.request.registration&&value.request?.range===quote.request.range&&value.checkedAt===quote.checkedAt;
 });
 let costs=null;
 if(raw){
  const value=raw.result||raw;
  costs=cleanServiceCosts(value,value.request,Date.parse(quote.checkedAt));
 }
 return quote.items.map(item=>{
  const found=costs?.items.find(x=>x.kind===item.kind&&x.sku===item.sku&&x.brand===item.brand&&x.description===item.description&&x.quantityMilli===item.quantityMilli);
  const oil=item.kind==='oil',charged=item.chargedQuantityMilli??item.quantityMilli;
  const pack=oil&&found?.packQuantityMilli;
  const quantity=found?(pack?Math.ceil(charged/pack):oil?Math.ceil(charged/1000):item.quantityMilli/1000):1;
  const cost=found?(pack?found.packNetPence:found.unitNetPence):null;
  const detail=oil?' · Fill '+(item.quantityMilli/1000)+'L; priced '+(charged/1000)+'L'+(pack?' · GSF '+(pack/1000)+'L pack':' per litre'):'';
  return {id:'gsf-'+quote.id+'-'+item.kind,description:'GSF · '+item.brand+' '+item.description+' ['+item.sku+']'+detail+(found?'':' · GSF cost unavailable'),quantity,
   cost_price:cost===null?null:cost/100,ordered:false,arrived:false};
 });
}
