import {managerGate,validManagerSession} from '../middleware.js';
import {bookingServiceParts} from './booking-service-parts.js';
import {bookingTyreParts} from './tyre-cost-token.js';

export async function workshopPricingAuthorised(req){
 const h=req.headers||{};
 const request=new Request('https://'+(h.host||'vecta-planner.vercel.app')+'/website-settings.html',{headers:{authorization:String(h.authorization||''),cookie:String(h.cookie||'')}});
 const credentials={user:process.env.VECTA_MAIN_USER,password:process.env.VECTA_MAIN_PASSWORD};
 if(!await validManagerSession(request,credentials)&&managerGate(request,credentials))return false;
 if(h['x-vecta-workshop']!=='1'||h['sec-fetch-site']==='cross-site')return false;
 if(h.origin){try{if(new URL(h.origin).host!==h.host)return false;}catch{return false;}}
 return true;
}
export function workshopServiceResult(data,secret){
 if(data.status!=='MATCHED'||!data.quote)return data;
 return {...data,parts:bookingServiceParts(data.quote,[],secret),missingKinds:data.quote.items.filter(item=>item.estimated).map(item=>item.kind)};
}
export function workshopTyreResult(body,secret){
 if(!body.tyre_guide?.costToken)throw Error('Select a fresh tyre price before adding it.');
 const parts=bookingTyreParts(body,['Tyres'],secret);
 return {status:'MATCHED',parts,totalPence:body.tyre_guide.unitPence*Number(body.tyre_quantity)};
}
