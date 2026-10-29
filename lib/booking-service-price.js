import {verifyServicePrice} from './service-price-token.js';
import {bookingServiceExtra,serviceExtraSnapshot} from './service-extras.js';
export function bookingServicePrice(body, types, secret = process.env.GSF_SERVICE_QUOTE_SECRET) {
  if (!body.service_price_token) return null;
  const request = {registration:body.registration, service:body.service_choice,
    mileage:body.mileage_unknown || body.mileage === '' || body.mileage == null ? null : Number(body.mileage), range:body.parts_range || 'Mid Range'};
  if (!types.includes(request.service)) throw Error('INVALID_SERVICE_QUOTE');
  const price=verifyServicePrice(body.service_price_token,request,secret);
  const extra=bookingServiceExtra(body),offer=price.serviceExtra;
  const extraPrice=extra&&offer?.kind===extra.kind?offer:null;
  const extraTotal=extra?.choice==='replace'&&extraPrice?extraPrice.totalPence:0;
  const total=price.totalPence+extraTotal+(types.includes('MOT')?6000:0); // Existing £65 MOT and £5 combined-service offer.
  const snapshot='\n\nService price agreed: £'+(price.totalPence/100).toFixed(2)+' including VAT.\n'+
    'Quote: '+price.id+' · Policy: '+price.policyVersion+'\n'+
    (price.oilSpecification?'Oil specification: '+price.oilSpecification+'\n':'')+
    price.items.map(item=>item.brand+' '+item.description+' ['+item.sku+']'+(item.kind==='oil'
      ? ' · Required '+(item.quantityMilli/1000)+'L; charged '+((item.chargedQuantityMilli??item.quantityMilli)/1000)+'L'
      : ' × '+(item.quantityMilli/1000))).join('\n');
  const partsQuote=extraTotal?{...price,items:[...price.items,...extraPrice.items]}:price;
  return {approximateCost:total/100,snapshot:snapshot+serviceExtraSnapshot(extra,extraPrice),quote:partsQuote};
}
