import {readServiceCostSnapshot} from './service-price-token.js';
import {cleanServiceQuoteCosts,normaliseRegistration} from './service-pricing.js';

// Called only after the customer's service token has been verified server-side.
// New quotes carry encrypted costs; older quotes recover the private supplier result.
export function bookingServiceParts(quote,results=[],secret=process.env.GSF_SERVICE_QUOTE_SECRET){
 const raw=results.find(row=>{
  const value=row.result||row;
  return normaliseRegistration(value.request?.registration)===quote.request.registration&&value.request?.range===quote.request.range&&value.checkedAt===quote.checkedAt;
 });
 const snapshot=quote.costSnapshot?readServiceCostSnapshot(quote,secret):null;
 let costs=null;
 if(raw){
  const value=raw.result||raw;
  costs=cleanServiceQuoteCosts(value,value.request,Date.parse(quote.checkedAt));
 }
 return quote.items.map(item=>{
  const saved=snapshot?.find(x=>x.kind===item.kind&&x.sku===item.sku&&x.quantityMilli===item.quantityMilli);
  if(item.estimated){
   const estimatedCost=saved?.estimated?saved.unitNetPence:null;
   return {id:'gsf-'+quote.id+'-'+item.kind,description:'ESTIMATED COST'+(estimatedCost!==null?' £'+(estimatedCost/100).toFixed(2)+' ex VAT':' unavailable')+' · '+item.description+' · Confirm part before ordering',quantity:item.quantityMilli/1000,cost_price:estimatedCost===null?null:estimatedCost/100,ordered:false,arrived:false};
  }
  const found=saved||[...(costs?.items||[]),...(costs?.optionalParts||[])].find(x=>x.kind===item.kind&&x.sku===item.sku&&x.brand===item.brand&&x.description===item.description&&x.quantityMilli===item.quantityMilli);
  const oil=item.kind==='oil',charged=item.chargedQuantityMilli??item.quantityMilli;
  const pack=oil&&found?.packQuantityMilli;
  const quantity=found?(pack?Math.ceil(charged/pack):oil?Math.ceil(charged/1000):item.quantityMilli/1000):1;
  const cost=found?(pack?found.packNetPence:found.unitNetPence):null;
  const detail=oil?' · Fill '+(item.quantityMilli/1000)+'L; priced '+(charged/1000)+'L'+(pack?' · GSF '+(pack/1000)+'L pack':' per litre'):'';
  return {id:'gsf-'+quote.id+'-'+item.kind,description:'GSF · '+item.brand+' '+item.description+' ['+item.sku+']'+detail+(found?.pricingOnly?' · Supplier price; availability unconfirmed':'')+(found?'':' · GSF cost unavailable'),quantity,
   cost_price:cost===null?null:cost/100,ordered:false,arrived:false};
 });
}
