import {servicePriceRequest,calculateServicePrice,COMPARISON_SERVICES as SERVICES,normaliseRegistration} from '../../lib/service-pricing.js';

export function comparisonVehicles(raw) {
  if(!Array.isArray(raw?.vehicles)||raw.vehicles.length!==10)throw Error('Choose exactly ten registrations for the comparison.');
  const vehicles=raw.vehicles.map(vehicle=>{
    const input=servicePriceRequest({registration:vehicle.registration,mileage:vehicle.mileage,range:vehicle.range||'Mid Range',service:SERVICES[0]});
    return {registration:input.registration,mileage:input.mileage,range:input.range};
  });
  if(new Set(vehicles.map(vehicle=>normaliseRegistration(vehicle.registration))).size!==10)throw Error('Use ten different registrations.');
  return vehicles;
}
export async function compareServices(vehicles,policy,lookup) {
  const rows=[];
  // Deliberately sequential: one supplier search at a time.
  for(const vehicle of vehicles) {
    const row={...vehicle,services:{}};
    for(const service of SERVICES) {
      const request=servicePriceRequest({...vehicle,service});
      try {
        const costs=await lookup(request);
        const price=calculateServicePrice(costs,request,policy);
        row.services[service]={status:'PRICED',totalPence:price.totalPence,netPence:price.netPence,vatPence:price.vatPence,
          recipeId:price.recipeId,oilSpecification:price.oilSpecification,checkedAt:price.checkedAt,
          parts:price.lines.map(({kind,sku,brand,description,quantityMilli,chargedQuantityMilli,costNetPence,sellNetPence})=>
            ({kind,sku,brand,description,quantityMilli,chargedQuantityMilli,costNetPence,sellNetPence}))};
      } catch(error) {
        row.services[service]={status:['LOGIN_REQUIRED','SETTINGS_REQUIRED','REVIEW_REQUIRED','UNAVAILABLE'].includes(error.message)?error.message:'REVIEW_REQUIRED'};
      }
    }
    rows.push(row);
  }
  return rows;
}
const priceCell=value=>value.status==='PRICED'?'£'+(value.totalPence/100).toFixed(2):'Needs verification';
export function comparisonMarkdown(rows,policy) {
  const labour=SERVICES.map(service=>'£'+(policy.labourNetPence[service]/100).toFixed(2)).join('/');
  return '# VECTA service price comparison\n\nOil quantity is charged at the next whole litre (6.7L is charged as 7L). Prices include '+(policy.markupBps/100)+'% parts/oil markup, preset net labour ('+labour+'), then '+(policy.vatBps/100)+'% VAT.\nUnverified combinations have no calculated price.\n\n'+
    '| Registration | Oil & filter | Full service | Major service |\n|---|---:|---:|---:|\n'+
    rows.map(row=>'| '+row.registration+' | '+SERVICES.map(service=>priceCell(row.services[service])).join(' | ')+' |').join('\n')+'\n';
}
export function comparisonCsv(rows) {
  return 'Registration,Oil and filter inc VAT,Full service inc VAT,Major service inc VAT\r\n'+
    rows.map(row=>[row.registration,...SERVICES.map(service=>row.services[service].status==='PRICED'?(row.services[service].totalPence/100).toFixed(2):'Needs verification')].join(',')).join('\r\n')+'\r\n';
}
