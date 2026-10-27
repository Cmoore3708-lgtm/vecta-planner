// Offline evidence audit only: no browser, relay, price estimates or approvals.
import {COMPARISON_SERVICES as SERVICES,serviceRequiredKinds} from '../../lib/service-pricing.js';
import {comparisonVehicles} from './comparison.mjs';
import {approvedRecipe} from './supplier.mjs';

const hasText=value=>typeof value==='string'&&value.trim().length>0;
export function serviceCoverage(input,config,now=Date.now()) {
  const vehicles=comparisonVehicles(input);
  const rows=vehicles.map(vehicle=>({registration:vehicle.registration,services:Object.fromEntries(SERVICES.map(service=>{
    const request={...vehicle,service},issues=[];
    if(config?.calibrationApproved!==true)issues.push('SHARED_WORKER_CALIBRATION_PENDING');
    const matches=Array.isArray(config?.recipes)?config.recipes.filter(r=>r.registration===vehicle.registration&&r.service===service&&r.range===vehicle.range):[];
    if(matches.length!==1)issues.push(matches.length?'AMBIGUOUS_PARTS_MAPPING':'PARTS_MAPPING_MISSING');
    else {
      const recipe=matches[0],reviewed=Date.parse(recipe.reviewedAt);
      if(recipe.approved!==true)issues.push('MAPPING_REVIEW_PENDING');
      if(!Number.isFinite(reviewed)||reviewed>now||reviewed<now-30*86400000)issues.push('MAPPING_REVIEW_EXPIRED');
      if(!hasText(recipe.fitmentSource))issues.push('VEHICLE_FITMENT_EVIDENCE_MISSING');
      if(!hasText(recipe.oilSource)||!hasText(recipe.oilSpecification))issues.push('OIL_SPECIFICATION_EVIDENCE_MISSING');
      const items=Array.isArray(recipe.items)?recipe.items:[],kinds=items.map(item=>item.kind);
      const allowed=['oil','oil_filter','air_filter','cabin_filter','fuel_filter','spark_plug','sump_plug','washer'];
      let base=[];try{base=serviceRequiredKinds(service,recipe.fuelType);}catch{issues.push('FUEL_TYPE_REQUIRED');}
      if(kinds.some(kind=>!base.includes(kind)&&!['sump_plug','washer'].includes(kind)))issues.push('DEFAULT_SERVICE_SCOPE_MISMATCH');
      const required=recipe.requiredKinds;
      if(!Array.isArray(required)||!required.length||items.length>16||new Set(required).size!==required.length||
        new Set(kinds).size!==kinds.length||base.some(kind=>!kinds.includes(kind))||
        items.some(item=>!allowed.includes(item.kind)||!Number.isSafeInteger(item.quantityMilli)||item.quantityMilli<1||item.quantityMilli>30000||
          (item.kind!=='oil'&&item.quantityMilli%1000!==0))||
        required.some(kind=>!kinds.includes(kind))||kinds.some(kind=>!required.includes(kind)))issues.push('SERVICE_PARTS_INCOMPLETE');
      const oils=items.filter(item=>item.kind==='oil');
      if(oils.length!==1||!Number.isSafeInteger(oils[0].quantityMilli)||oils[0].quantityMilli<1||oils[0].quantityMilli>30000||
        !Number.isSafeInteger(oils[0].packQuantityMilli)||oils[0].packQuantityMilli<1||oils[0].packQuantityMilli>250000)issues.push('OIL_FILL_OR_PACK_SIZE_MISSING');
      try {approvedRecipe(config,request,now);}catch {if(!issues.length)issues.push('PARTS_MAPPING_INVALID');}
    }
    return [service,{status:issues.length?'NEEDS_VERIFICATION':'READY_FOR_LIVE_PRICE_CHECK',issues}];
  }))}));
  const ready=rows.flatMap(row=>Object.values(row.services)).filter(cell=>cell.status==='READY_FOR_LIVE_PRICE_CHECK').length;
  return {checkedAt:new Date(now).toISOString(),vehicleCount:rows.length,serviceCount:rows.length*SERVICES.length,
    readyForLiveCheck:ready,verifiedPrices:0,rows};
}

const labels={
  SHARED_WORKER_CALIBRATION_PENDING:'shared worker calibration',PARTS_MAPPING_MISSING:'verified parts mapping',
  AMBIGUOUS_PARTS_MAPPING:'resolve duplicate mappings',MAPPING_REVIEW_PENDING:'mapping review',MAPPING_REVIEW_EXPIRED:'current mapping review',
  VEHICLE_FITMENT_EVIDENCE_MISSING:'vehicle fitment evidence',
  OIL_SPECIFICATION_EVIDENCE_MISSING:'oil specification evidence',FUEL_TYPE_REQUIRED:'verified petrol/diesel fuel type',
  DEFAULT_SERVICE_SCOPE_MISMATCH:'default service parts scope',SERVICE_PARTS_INCOMPLETE:'complete service parts',
  OIL_FILL_OR_PACK_SIZE_MISSING:'verified oil fill and pack size',PARTS_MAPPING_INVALID:'valid parts mapping'
};
export function serviceCoverageMarkdown(report) {
  return '# VECTA service pricing readiness\n\n'+
    `${report.readyForLiveCheck} of ${report.serviceCount} combinations are ready for a live price check. This audit verifies no supplier prices and activates nothing.\n\n`+
    'Use the shared GSF worker from the repair-quote setup. Do not start a second supplier browser from the old service-price package.\n\n'+
    '| Registration | Oil & filter | Full service | Major service |\n|---|---|---|---|\n'+
    report.rows.map(row=>'| '+row.registration+' | '+SERVICES.map(service=>{
      const cell=row.services[service];return cell.status==='READY_FOR_LIVE_PRICE_CHECK'?'Ready for live check':cell.issues.map(issue=>labels[issue]).join('; ');
    }).join(' | ')+' |').join('\n')+'\n\n'+
    'Commercial rule: oil quantity rounds up to the next whole litre; 50% markup on filters and 30% on charged oil costs; net labour £30 / £60 / £100; then 20% VAT. Repair-job markup and hourly labour rules do not apply to these service packages.\n';
}
