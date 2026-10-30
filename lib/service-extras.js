// Costs have already passed cleanServiceCosts; only public selling prices leave this module.
export function serviceExtraPrice(costs,policy){
 const kind=/^diesel(?: hybrid)?$/.test(costs.fuelType)?'fuel_filter':/^petrol(?: hybrid)?$/.test(costs.fuelType)?'spark_plug':null;
 if(!kind)return null;
 const item=(kind==='fuel_filter'?costs.items:costs.optionalParts||[]).find(row=>row.kind===kind);
 if(!item)return null;
 const cost=Math.round(item.unitNetPence*item.quantityMilli/1000);
 // Chris: verified GSF cost for the filter or full plug set including VAT,
 // then 30%, then £25 fitting. No further VAT; round the final estimate up to £5.
 const partsIncludingVat=cost+Math.round(cost*policy.vatBps/10000);
 const totalPence=Math.ceil((Math.round(partsIncludingVat*130/100)+2500)/500)*500;
 const netPence=Math.round(totalPence*10000/(10000+policy.vatBps));
 const {sku,brand,description,quantityMilli}=item;
 return {kind,totalPence,netPence,vatPence:totalPence-netPence,items:[{kind,sku,brand,description,quantityMilli}]};
}

export function bookingServiceExtra(body){
 const choice=body.service_extra_choice||'none';
 if(!['none','check','replace'].includes(choice))throw Error('INVALID_SERVICE_EXTRA');
 if(choice==='none'||body.service_choice!=='Full Service')return null;
 const kind=body.service_extra_kind;
 if(!['fuel_filter','spark_plug'].includes(kind))throw Error('INVALID_SERVICE_EXTRA');
 return {choice,kind,label:kind==='fuel_filter'?'Fuel filter':'Spark plugs'};
}

export function serviceExtraSnapshot(extra,price){
 if(!extra)return '';
 const live=price?.kind===extra.kind&&Number.isSafeInteger(price.totalPence)&&price.totalPence>0;
 const decision=extra.choice==='check'?'Check the manufacturer’s guidance; replace only if due. If service history is unclear, contact the customer first.':'Customer requests replacement.';
 const amount=live?'Estimated additional cost: £'+(price.totalPence/100).toFixed(2)+' including fitting and VAT'+(extra.choice==='check'?' — only charge if due.':'.'):'We will confirm the price before fitting. Obtain price approval before replacement.';
 return '\n\nOptional service item — '+extra.label+'\n'+decision+'\n'+amount;
}
