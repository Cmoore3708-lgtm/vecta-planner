import {cleanServiceCosts,cleanServiceQuoteCosts} from './service-pricing.js';

// Upper quartile of verified 2 November 2026 supplier checks. Costs are ex VAT.
export const FILTER_ALLOWANCES=Object.freeze({oil_filter:1138,air_filter:2378,cabin_filter:1934,fuel_filter:4205});
export function estimatedFilter(kind){
 if(!Object.hasOwn(FILTER_ALLOWANCES,kind))throw Error('REVIEW_REQUIRED');
 return {kind,sku:'',brand:'',description:'Estimated '+kind.replaceAll('_',' '),unitNetPence:FILTER_ALLOWANCES[kind],quantityMilli:1000,vatBasis:'EX_VAT',inStock:false,estimated:true,estimateSource:'ALLOWANCE'};
}
const identity=value=>String(value||'').toLowerCase().replace(/\s+/g,' ').trim();
function similarVehicle(a,b){
 const x=identity(a.vehicle),y=identity(b.vehicle),cc=x.match(/\((\d+)cc\)/)?.[1];
 return !!cc&&cc===y.match(/\((\d+)cc\)/)?.[1]&&x.split(' ').slice(0,2).join(' ')===y.split(' ').slice(0,2).join(' ')&&a.fuelType===b.fuelType;
}
export function estimateMissingServiceCosts(raw,request,history=[],now=Date.now()){
 const costs=cleanServiceQuoteCosts(raw,request,now);
 if(!costs.guidePrice)return costs;
 const candidates=[];
 for(const row of history){
  const value=row.result||row,at=Date.parse(value.checkedAt);
  if(!Number.isFinite(at)||at<now-30*86400000||at>now||value.guidePrice||value.request?.range!==request.range)continue;
  try{candidates.push(cleanServiceCosts(value,value.request,at));}catch{ /* Unverified results never seed estimates. */ }
 }
 costs.items=costs.items.map(item=>{
  if(!item.estimated)return item;
  const eligible=candidates.filter(value=>value.items.some(x=>x.kind===item.kind&&!x.pricingOnly&&x.inStock===true&&x.quantityMilli===1000));
  const exact=eligible.filter(value=>value.request.registration===request.registration&&identity(value.vehicle)===identity(costs.vehicle)).sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt));
  if(exact.length)return {...estimatedFilter(item.kind),unitNetPence:exact[0].items.find(x=>x.kind===item.kind).unitNetPence,estimateSource:'SAME_VEHICLE'};
  // One observation per vehicle avoids repeated lookups dominating the estimate.
  const peers=new Map();
  for(const value of eligible.filter(value=>similarVehicle(costs,value)).sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt)))if(!peers.has(value.request.registration))peers.set(value.request.registration,value.items.find(x=>x.kind===item.kind).unitNetPence);
  const prices=[...peers.values()].sort((a,b)=>a-b);
  if(prices.length>=3)return {...estimatedFilter(item.kind),unitNetPence:prices[Math.ceil(prices.length*.75)-1],estimateSource:'SIMILAR_VEHICLE'};
  return estimatedFilter(item.kind);
 });
 return costs;
}
