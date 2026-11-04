import {workshopEstimate} from './workshop-estimate-math.js';
import {workshopAllowances} from './workshop-estimate-defaults.js';
import {cleanServiceCosts} from './service-pricing.js';
function observed(item){
 const oil=item.kind==='oil',charged=oil?Math.ceil(item.quantityMilli/1000)*1000:item.quantityMilli,pack=oil&&item.packQuantityMilli;
 const costNetPence=pack?Math.round(item.packNetPence*charged/pack):Math.round(item.unitNetPence*charged/1000);
 return {kind:item.kind,costNetPence,part:{id:'gsf-partial-'+item.kind,description:'GSF · '+item.brand+' '+item.description+' ['+item.sku+']'+(oil?' · Fill '+(item.quantityMilli/1000)+'L; priced '+(charged/1000)+'L':'')+(item.pricingOnly?' · Availability unconfirmed':''),quantity:pack?Math.ceil(charged/pack):charged/1000,cost_price:(pack?item.packNetPence:item.unitNetPence)/100,ordered:false,arrived:false}};
}
// Never use a previous estimate as the source of another estimate.
export function estimateWorkshopService(request,partial,rows,policy,now=Date.now()){
 const allowances={...workshopAllowances},records=[];
 for(const row of rows){const v=row.result||row,at=Date.parse(v.checkedAt);if(!Number.isFinite(at)||at>now||at<now-30*86400000||v.request?.range!==request.range||v.partial||v.guidePrice)continue;try{records.push(cleanServiceCosts(v,v.request,at));}catch{/* not verified */}}
 const normal=v=>String(v||'').toLowerCase().trim().replace(/\s+/g,' ');
 const peer=(a,b)=>a&&b&&normal(a.vehicle)===normal(b.vehicle)&&normal(a.fuelType)===normal(b.fuelType);
 records.sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt));
 for(const kind of Object.keys(allowances)){
  const eligible=records.filter(r=>r.items.some(i=>i.kind===kind&&i.inStock&&!i.estimated&&!i.pricingOnly));
  const same=eligible.find(r=>r.request.registration===request.registration&&(!partial||peer(r,partial)));
  if(same){allowances[kind]=observed(same.items.find(i=>i.kind===kind)).costNetPence;continue;}
  const peers=new Map();for(const r of eligible)if(peer(r,partial)&&!peers.has(r.request.registration))peers.set(r.request.registration,observed(r.items.find(i=>i.kind===kind)).costNetPence);
  if(peers.size>=3){const sorted=[...peers.values()].sort((a,b)=>a-b);allowances[kind]=sorted[Math.ceil(sorted.length*.75)-1];}
 }
 return workshopEstimate(request,(partial?.items||[]).filter(i=>!i.estimated).map(observed),allowances,policy);
}
